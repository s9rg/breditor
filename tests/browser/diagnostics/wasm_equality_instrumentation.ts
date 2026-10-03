import { createHash } from "node:crypto";

/** Capture both original heap lookup results exactly once, then the original
 * strict-equality result before it returns to Wasm. Fail closed on glue drift.
 * This changes import code shape and is diagnostic evidence, not a fix. */
export function instrumentWasmEquality(code: string, recorder: string, mode: "calls" | "inline" = "calls") {
  const pattern = /__wbg___wbindgen_jsval_eq_[a-f0-9]+:function\((\w+),(\w+)\)\{return (\w+)\(\1\)===\3\(\2\)\}/g;
  const matches = [...code.matchAll(pattern)];
  if (matches.length !== 1) throw new Error("Expected exactly one pinned strict-equality import");
  const match = matches[0]!;
  const source = match[0];
  const body = source.indexOf("{return");
  const finish = mode === "calls" ? "return __breditorWasmEquality(__result,__left,__right)" :
    "__breditorEqRing[__breditorEqCursor]=[__left,__right,__result];__breditorEqCursor=(__breditorEqCursor+1)%16;return __result";
  const replacement = `${source.slice(0, body)}{const __left=${match[3]}(${match[1]}),__right=${match[3]}(${match[2]});const __result=__left===__right;${finish}}`;
  const header = mode === "calls" ? `import { recordWasmEquality as __breditorWasmEquality } from ${JSON.stringify(recorder)};` :
    `import { sanitizeWasmEqualities as __breditorSanitizeEq } from ${JSON.stringify(recorder)};
const __breditorEqRing=[];let __breditorEqCursor=0;
export function __breditorReadWasmEqualities(){return __breditorSanitizeEq(__breditorEqRing.slice(__breditorEqCursor).concat(__breditorEqRing.slice(0,__breditorEqCursor)));}`;
  return { sourceSha256: createHash("sha256").update(code).digest("hex"),
    code: `${header}\n${code.replace(source, replacement)}` };
}
