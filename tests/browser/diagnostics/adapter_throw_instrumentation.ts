import { createHash } from "node:crypto";
import { parseSync, type ESTree } from "rolldown/utils";

/** Observe existing adapter throws without rewriting successful calls or queue catches.
 * Diagnostic builds only: preserve the thrown identity and evaluate its operand once.
 */
export function instrumentAdapterThrows(code: string, id: string, recorder: string) {
  if (!id.endsWith("/breditor-browser/dist/wasm_command_adapter.js")) return null;
  if (code.includes("__breditorAdapterThrow")) throw new Error("Adapter throw diagnostic already installed");
  const parsed = parseSync(id, code);
  if (parsed.errors.length) throw new Error("Cannot parse adapter throw diagnostic module");
  const edits: { start: number; end: number; text: string }[] = [];
  const sites: { stage: string; line: number }[] = [];
  function visit(node: ESTree.Node): void {
    if (node.type === "ThrowStatement") {
      const line = code.slice(0, node.start).split("\n").length;
      const stage = `wasm_command_adapter:throw:${line}`;
      const operand = node.argument;
      sites.push({ stage, line });
      edits.push({ start: operand.start, end: operand.end,
        text: `__breditorAdapterThrow(${JSON.stringify(stage)}, (${code.slice(operand.start, operand.end)}))` });
      return;
    }
    for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : [value]) {
      if (child !== null && typeof child === "object" && "type" in child && "start" in child && "end" in child) {
        visit(child as ESTree.Node);
      }
    }
  }
  visit(parsed.program);
  if (sites.length === 0) throw new Error("Expected adapter throw sites");
  let transformed = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  }
  return { sourceSha256: createHash("sha256").update(code).digest("hex"), sites,
    code: `import { recordAdapterThrow as __breditorAdapterThrow } from ${JSON.stringify(recorder)};\n${transformed}` };
}
