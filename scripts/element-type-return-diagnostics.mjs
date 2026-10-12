import assert from "node:assert/strict";

/** Disposable generated-glue trace. Never rereads Wasm memory or retries calls. */
export function instrumentElementTypeReturn(code) {
  const pattern = /elementType\(([\w$]+)\)\{try\{let ([\w$]+)=([\w$]+)\.__wbindgen_add_to_stack_pointer\(-16\);\3\.breditorprojection_elementType\(\2,this\.__wbg_ptr,\1\);var ([\w$]+)=([\w$]+)\(\)\.getInt32\(\2\+0,!0\),([\w$]+)=\5\(\)\.getInt32\(\2\+4,!0\);let ([\w$]+);return/gu;
  let sites = 0;
  const result = code.replace(pattern, (match, index, stack, wasm, pointer, memory, length) => {
    sites++;
    return match.slice(0, -6) + `if (${pointer} === 0 && (${index} === 634 || ${index} === 1587) && breditorElementTypeAbsenceLogs < 16) {breditorElementTypeAbsenceLogs++;try {console.error("breditor elementType raw absence", JSON.stringify({index:${index},handle:this.__wbg_ptr,pointer:${pointer},length:${length}}));} catch {}} return`;
  });
  assert.equal(sites, 1, "generated elementType return site changed");
  // Only the two fixed-workload indexes already captured as failed elements.
  // Other absent types are expected for text nodes and must not flood tracing.
  return "let breditorElementTypeAbsenceLogs = 0;\n" + result;
}
