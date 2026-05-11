/**
 * Design-to-Code Prompt Generator.
 * Extracts implementation instructions from an approved mockup via GPT-4o vision.
 * Produces a structured prompt the agent can use to implement the design.
 */

import fs from "fs";
import { loadBackendConfig, requireChatBackend } from "./backend";
import { readDesignConstraints } from "./memory";

export interface DesignToCodeResult {
  implementationPrompt: string;
  colors: string[];
  typography: string[];
  layout: string[];
  components: string[];
}

/**
 * Generate a structured implementation prompt from an approved mockup.
 */
export async function generateDesignToCodePrompt(
  imagePath: string,
  repoRoot?: string,
): Promise<DesignToCodeResult> {
  const chat = requireChatBackend(loadBackendConfig());
  const imageData = fs.readFileSync(imagePath).toString("base64");

  const designConstraints = repoRoot ? readDesignConstraints(repoRoot) : null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const contextBlock = designConstraints
      ? `\n\nExisting DESIGN.md (use these as constraints):\n${designConstraints}`
      : "";

    const response = await fetch(chat.url, {
      method: "POST",
      headers: chat.headers,
      body: JSON.stringify({
        model: chat.model,
        messages: [{
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${imageData}` },
            },
            {
              type: "text",
              text: `Analyze this approved UI mockup and generate a structured implementation prompt. Return valid JSON only:

{
  "implementationPrompt": "A detailed paragraph telling a developer exactly how to build this UI. Include specific CSS values, layout approach (flex/grid), component structure, and interaction behaviors. Reference the specific elements visible in the mockup.",
  "colors": ["#hex - usage", ...],
  "typography": ["role: family, size, weight", ...],
  "layout": ["description of layout pattern", ...],
  "components": ["component name - description", ...]
}

Be specific about every visual detail: exact hex colors, font sizes in px, spacing values, border-radius, shadows. The developer should be able to implement this without looking at the mockup again.${contextBlock}`,
            },
          ],
        }],
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error (${response.status}): ${error.slice(0, 200)}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    return JSON.parse(content) as DesignToCodeResult;
  } finally {
    clearTimeout(timeout);
  }
}
