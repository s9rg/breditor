import assert from 'node:assert/strict';

/** Re-encode genuine retained pages while the authority callback mutates its caller. */
export async function assertCapturedImportSelection(encode,archive,options){
 const manifest=archive.manifest(),before=archive.beforeFile();
 const input={
  server:structuredClone(manifest.server),
  before:{selection:{...before.selection},file:before.file},
  pages:manifest.pages.map((entry,index)=>({request:entry.request,file:archive.pageFile(index)})),
 };
 const selected=await encode(input,{...options,checkAuthority(){
  options.checkAuthority();
  input.server.instance='f'.repeat(64);
  input.before.selection.sha256='0'.repeat(64);
 }});
 assert.notEqual(input.before.selection.sha256,before.selection.sha256);
 assert.deepEqual(selected.selection,archive.selection());
 assert.deepEqual(await selected.file.arrayBuffer(),await archive.file().arrayBuffer());
}
