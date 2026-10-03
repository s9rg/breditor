/** Local-only inline ring for the projection format-count return. Saves the
 * original Wasm result and original sentinel decoder result without rereading
 * either the projection or the decoder. No document text is retained. */
export function instrumentWasmFormatCount(code: string) {
  const pattern = /formatCount\((\w+)\)\{let (\w+)=([$\w]+)\.breditorprojection_formatCount\(this\.__wbg_ptr,\1\);return \2===2\*\*53-1\?void 0:\2\}/g;
  const matches = [...code.matchAll(pattern)];
  if (matches.length !== 1) throw new Error("Expected exactly one pinned projection format-count getter");
  const match = matches[0]!;
  const [source, index, raw, wasm] = match;
  const replacement = `formatCount(${index}){let ${raw}=${wasm}.breditorprojection_formatCount(this.__wbg_ptr,${index});const __decoded=${raw}===2**53-1?void 0:${raw};__breditorCountRing[__breditorCountCursor]={index:${index},raw:${raw},decodedType:typeof __decoded,decoded:__decoded};__breditorCountCursor=(__breditorCountCursor+1)%16;return __decoded}`;
  return `const __breditorCountRing=[];let __breditorCountCursor=0;
export function __breditorReadFormatCounts(){return __breditorCountRing.slice(__breditorCountCursor).concat(__breditorCountRing.slice(0,__breditorCountCursor));}
${code.replace(source!, replacement)}`;
}
