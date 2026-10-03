import { createHash } from "node:crypto";
import { parseSync } from "rolldown/utils";

/** Test-only exports; the original selection module and predicate bodies stay intact. */
export function exposeSelectionValidators(code: string, id: string) {
  if (!id.endsWith("/breditor-browser/dist/wasm_selection_adapter.js")) return null;
  const parsed = parseSync(id, code);
  const names = parsed.program.body.flatMap(node =>
    node.type === "FunctionDeclaration" ? [node.id?.name] : []);
  if (parsed.errors.length || !names.includes("isU32") || !names.includes("readPoint")) {
    throw new Error("Selection validator export source drift");
  }
  if (code.includes("diagnosticIsU32") || code.includes("diagnosticReadPoint")) {
    throw new Error("Selection validators already exposed");
  }
  const suffix = "\nexport { isU32 as diagnosticIsU32, readPoint as diagnosticReadPoint };\n";
  return { code: code + suffix, sourceSha256: createHash("sha256").update(code).digest("hex"), suffix };
}
