/**
 * Backend abstraction for image generation + vision/chat calls.
 *
 * Two backends are supported:
 *   - openai: api.openai.com Responses API (image_generation tool) + chat completions.
 *   - azure: Azure OpenAI direct /images/generations endpoint for image gen.
 *            Chat/vision is NOT routed to Azure here — the user's Azure resource
 *            in this project only has an image deployment (gpt-image-2). When
 *            the caller needs vision, we fall back to OpenAI if a key is
 *            present, otherwise the call surfaces a clear error.
 *
 * Config resolution (highest priority wins):
 *   1. Env vars: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY,
 *      AZURE_OPENAI_IMAGE_DEPLOYMENT, AZURE_OPENAI_API_VERSION,
 *      OPENAI_API_KEY
 *   2. ~/.gstack/openai.json:
 *      {
 *        "api_key": "sk-...",                 // optional — OpenAI key
 *        "azure": {
 *          "endpoint": "https://....cognitiveservices.azure.com",
 *          "api_key": "...",
 *          "image_deployment": "gpt-image-2",
 *          "api_version": "2025-04-01-preview"
 *        }
 *      }
 */

import fs from "fs";
import path from "path";

export interface AzureConfig {
  endpoint: string;
  apiKey: string;
  imageDeployment: string;
  apiVersion: string;
}

export interface OpenAIConfig {
  apiKey: string;
}

export interface BackendConfig {
  azure: AzureConfig | null;
  openai: OpenAIConfig | null;
}

const CONFIG_PATH = path.join(process.env.HOME || "~", ".gstack", "openai.json");
const DEFAULT_AZURE_API_VERSION = "2025-04-01-preview";

function readConfigFile(): any {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function trimEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

export function loadBackendConfig(): BackendConfig {
  const file = readConfigFile();

  const azureFile = file?.azure || {};
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || azureFile.endpoint || "";
  const azureKey = process.env.AZURE_OPENAI_API_KEY || process.env.AZURE_API_KEY || azureFile.api_key || "";
  const azureDeployment = process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || azureFile.image_deployment || "";
  const azureApiVersion = process.env.AZURE_OPENAI_API_VERSION || azureFile.api_version || DEFAULT_AZURE_API_VERSION;

  const azure: AzureConfig | null = azureEndpoint && azureKey && azureDeployment
    ? {
        endpoint: trimEndpoint(azureEndpoint),
        apiKey: azureKey,
        imageDeployment: azureDeployment,
        apiVersion: azureApiVersion,
      }
    : null;

  const openaiKey = process.env.OPENAI_API_KEY || file.api_key || "";
  const openai: OpenAIConfig | null = openaiKey ? { apiKey: openaiKey } : null;

  return { azure, openai };
}

export function describeBackends(config: BackendConfig): string {
  const parts: string[] = [];
  if (config.azure) parts.push(`azure(${config.azure.imageDeployment})`);
  if (config.openai) parts.push("openai");
  return parts.length > 0 ? parts.join(" + ") : "none";
}

/**
 * Generate a single image. Routes to Azure /images/generations when an Azure
 * config is present; otherwise to OpenAI Responses API + image_generation tool.
 *
 * Returns { b64, responseId }. responseId is null on the Azure path because
 * the direct images endpoint is single-shot and doesn't return a Responses
 * thread id (callers that depended on threading must use the non-threaded
 * fallback path).
 */
export async function generateImage(
  config: BackendConfig,
  prompt: string,
  size: string,
  quality: string,
): Promise<{ b64: string; responseId: string | null }> {
  if (config.azure) {
    return generateImageAzure(config.azure, prompt, size, quality);
  }
  if (config.openai) {
    return generateImageOpenAI(config.openai, prompt, size, quality);
  }
  throw new Error(
    "No image backend configured. Set AZURE_OPENAI_* env vars, OPENAI_API_KEY, "
    + "or run `$D setup`."
  );
}

async function generateImageAzure(
  azure: AzureConfig,
  prompt: string,
  size: string,
  quality: string,
): Promise<{ b64: string; responseId: string | null }> {
  const url = `${azure.endpoint}/openai/deployments/${azure.imageDeployment}/images/generations?api-version=${azure.apiVersion}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 360_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": azure.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        size: normalizeAzureSize(size),
        quality: normalizeAzureQuality(quality),
        n: 1,
        output_format: "png",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Azure image API error (${response.status}): ${error.slice(0, 400)}`);
    }

    const data = await response.json() as any;
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error(`Azure image response missing b64_json. Keys: ${Object.keys(data || {}).join(",")}`);
    }
    return { b64, responseId: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function generateImageOpenAI(
  openai: OpenAIConfig,
  prompt: string,
  size: string,
  quality: string,
): Promise<{ b64: string; responseId: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 360_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        input: prompt,
        tools: [{ type: "image_generation", size, quality }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      if (response.status === 403 && error.includes("organization must be verified")) {
        throw new Error(
          "OpenAI organization verification required.\n"
          + "Go to https://platform.openai.com/settings/organization to verify.\n"
          + "After verification, wait up to 15 minutes for access to propagate.",
        );
      }
      throw new Error(`OpenAI API error (${response.status}): ${error.slice(0, 400)}`);
    }

    const data = await response.json() as any;
    const imageItem = data.output?.find((item: any) => item.type === "image_generation_call");
    if (!imageItem?.result) {
      throw new Error(
        `No image data in response. Output types: ${data.output?.map((o: any) => o.type).join(", ") || "none"}`
      );
    }
    return { b64: imageItem.result, responseId: data.id };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeAzureSize(size: string): string {
  const allowed = new Set(["1024x1024", "1024x1536", "1536x1024", "auto"]);
  return allowed.has(size) ? size : "1536x1024";
}

function normalizeAzureQuality(quality: string): string {
  const allowed = new Set(["low", "medium", "high", "auto"]);
  return allowed.has(quality) ? quality : "high";
}

/**
 * Iterative image generation against an OpenAI Responses thread.
 * Azure's direct images endpoint has no equivalent — callers must fall back
 * to a fresh re-generation prompt that bakes in accumulated feedback.
 */
export async function generateImageThreaded(
  config: BackendConfig,
  previousResponseId: string,
  feedbackInput: string,
  size: string,
  quality: string,
): Promise<{ b64: string; responseId: string | null }> {
  if (!config.openai) {
    throw new Error("Threaded iteration requires an OpenAI key (Azure direct images endpoint has no thread state).");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 360_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        input: feedbackInput,
        previous_response_id: previousResponseId,
        tools: [{ type: "image_generation", size, quality }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI threaded API error (${response.status}): ${error.slice(0, 400)}`);
    }

    const data = await response.json() as any;
    const imageItem = data.output?.find((item: any) => item.type === "image_generation_call");
    if (!imageItem?.result) {
      throw new Error("No image data in threaded response");
    }
    return { b64: imageItem.result, responseId: data.id };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Vision/chat backend. Currently only OpenAI — the local Azure resource has
 * no chat deployment. Returns null when no chat backend is configured so
 * callers can degrade gracefully (skip vision-only quality gates).
 */
export interface ChatBackend {
  url: string;
  headers: Record<string, string>;
  model: string;
}

export function getChatBackend(config: BackendConfig): ChatBackend | null {
  if (config.openai) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        "Authorization": `Bearer ${config.openai.apiKey}`,
        "Content-Type": "application/json",
      },
      model: "gpt-4o",
    };
  }
  return null;
}

export function requireChatBackend(config: BackendConfig): ChatBackend {
  const backend = getChatBackend(config);
  if (!backend) {
    throw new Error(
      "Vision/chat features require an OpenAI key (set OPENAI_API_KEY or "
      + "save it to ~/.gstack/openai.json). The Azure deployment in this "
      + "project is image-only."
    );
  }
  return backend;
}

export function requireBackend(): BackendConfig {
  const config = loadBackendConfig();
  if (!config.azure && !config.openai) {
    console.error("No backend configured.");
    console.error("");
    console.error("For Azure image generation, set:");
    console.error("  AZURE_OPENAI_ENDPOINT=https://<resource>.cognitiveservices.azure.com");
    console.error("  AZURE_OPENAI_API_KEY=<key>");
    console.error("  AZURE_OPENAI_IMAGE_DEPLOYMENT=<deployment-name>");
    console.error("");
    console.error("For OpenAI direct, set OPENAI_API_KEY or save it to ~/.gstack/openai.json.");
    process.exit(1);
  }
  return config;
}
