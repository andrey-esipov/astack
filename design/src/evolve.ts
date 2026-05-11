/**
 * Screenshot-to-Mockup Evolution.
 * Takes a screenshot of the live site and generates a mockup showing
 * how it SHOULD look based on a design brief.
 * Starts from reality, not blank canvas.
 */

import fs from "fs";
import path from "path";
import { requireBackend, generateImage, getChatBackend, type ChatBackend } from "./backend";

export interface EvolveOptions {
  screenshot: string;
  brief: string;
  output: string;
}

export async function evolve(options: EvolveOptions): Promise<void> {
  const config = requireBackend();
  const screenshotData = fs.readFileSync(options.screenshot).toString("base64");

  console.error(`Evolving ${options.screenshot} with: "${options.brief}"`);
  const startTime = Date.now();

  const chat = getChatBackend(config);
  let analysis = "";
  if (chat) {
    analysis = await analyzeScreenshot(chat, screenshotData);
    console.error(`  Analyzed current design: ${analysis.slice(0, 100)}...`);
  } else {
    console.error("  No vision backend available — proceeding with brief-only prompt.");
    analysis = "(no vision analysis available — describe the requested changes from scratch)";
  }

  const evolvedPrompt = [
    "Generate a pixel-perfect UI mockup that is an improved version of an existing design.",
    "",
    "CURRENT DESIGN (what exists now):",
    analysis,
    "",
    "REQUESTED CHANGES:",
    options.brief,
    "",
    "Generate a new mockup that keeps the existing layout structure but applies the requested changes.",
    "The result should look like a real production UI. All text must be readable.",
    "1536x1024 pixels.",
  ].join("\n");

  const { b64 } = await generateImage(config, evolvedPrompt, "1536x1024", "high");

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  const imageBuffer = Buffer.from(b64, "base64");
  fs.writeFileSync(options.output, imageBuffer);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.error(`Generated (${elapsed}s, ${(imageBuffer.length / 1024).toFixed(0)}KB) → ${options.output}`);

  console.log(JSON.stringify({
    outputPath: options.output,
    sourceScreenshot: options.screenshot,
    brief: options.brief,
  }, null, 2));
}

async function analyzeScreenshot(chat: ChatBackend, imageBase64: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
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
              image_url: { url: `data:image/png;base64,${imageBase64}` },
            },
            {
              type: "text",
              text: `Describe this UI in detail for re-creation. Include: overall layout structure, color scheme (hex values), typography (sizes, weights), specific text content visible, spacing between elements, alignment patterns, and any decorative elements. Be precise enough that someone could recreate this UI from your description alone. 200 words max.`,
            },
          ],
        }],
        max_tokens: 400,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return "Unable to analyze screenshot";
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content?.trim() || "Unable to analyze screenshot";
  } finally {
    clearTimeout(timeout);
  }
}
