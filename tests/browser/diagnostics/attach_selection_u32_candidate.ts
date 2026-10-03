import { expect, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { replaceSelectionU32WithBits } from "./selection_u32_bits_candidate";

/** HTTP metadata only, after the workload. No evaluation in the browser realm. */
export async function attachSelectionU32Candidate(page: Page, info: TestInfo): Promise<void> {
  if (!info.config.configFile?.endsWith("playwright.selection-u32-candidate.config.ts")) return;
  try {
    const response = await page.request.get("/selection-u32-manifest.json");
    await info.attach("selection-u32-manifest.json", { body: await response.body(), contentType: "application/json" });
    expect(response.ok(), "candidate must actually be installed").toBe(true);
    const original = readFileSync(new URL("../../../packages/breditor-browser/dist/wasm_selection_adapter.js", import.meta.url), "utf8");
    const mode = info.config.metadata["selectionU32"];
    const hash = (source: string) => createHash("sha256").update(source).digest("hex");
    expect(await response.json()).toEqual({ mode, logging: false, module: {
      originalSha256: hash(original), executedSha256: hash(mode === "bits" ? replaceSelectionU32WithBits(original) : original),
    } });
  } catch (error) {
    if (info.status === info.expectedStatus) throw error;
  }
}
