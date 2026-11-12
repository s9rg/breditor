import assert from 'node:assert/strict';

/** Exercise selection and policy changes from a real synchronous authority callback. */
export async function checkPacketAssetSelection(Reader,files,parent,options){
 const changed=structuredClone(parent);
 const archive=await Reader.read(files,changed,{...options,checkAuthority(){
  options.checkAuthority();
  changed.references.sha256='0'.repeat(64);
 }});
 try{assert.deepEqual(archive.header().parent,parent);}
 finally{archive.dispose();}
 assert.notEqual(changed.references.sha256,parent.references.sha256);

 await assert.rejects(async()=>{
  const admitted=await Reader.read(files,changed,{...options,checkAuthority(){
   options.checkAuthority();
   changed.references.sha256=parent.references.sha256;
  }});
  admitted.dispose();
 },{code:'metadata_packet_retention_state'});

 const mutable={...options,checkAuthority(){
  options.checkAuthority();
  mutable.wasm=undefined;
  mutable.signal=AbortSignal.abort();
 }};
 const admitted=await Reader.read(files,parent,mutable);
 try{assert.deepEqual(admitted.header().parent,parent);}
 finally{admitted.dispose();}
}

/** Re-encode the already admitted provider facts and immutable raster bytes. */
export async function checkPacketAssetWriter(encode,archive,files,options){
 const {payloads,chunks:_,...header}=archive.header();
 const sources=payloads.map(({offset:_,...info})=>({info,blob:archive.payload(info.asset)}));
 const selected=structuredClone(header),changed=sources.map(row=>({...row,info:{...row.info}}));
 const retained=await encode(selected,changed,{...options,checkAuthority(){
  options.checkAuthority();
  selected.parent.references.sha256='0'.repeat(64);
  selected.provider.assets.length=0;
  changed.length=0;
 }});
 assert.notEqual(selected.parent.references.sha256,header.parent.references.sha256);
 assert.equal(retained.manifest.sha256,files.manifest.sha256);
 assert.deepEqual(await retained.manifest.file.arrayBuffer(),await files.manifest.file.arrayBuffer());
 assert.equal(retained.chunks.length,files.chunks.length);
 for(const [index,chunk] of retained.chunks.entries()){
  assert.equal(chunk.sha256,files.chunks[index].sha256);
  assert.deepEqual(await chunk.file.arrayBuffer(),await files.chunks[index].file.arrayBuffer());
 }
 const mutable={...options,checkAuthority(){
  options.checkAuthority();
  mutable.wasm=undefined;
  mutable.signal=AbortSignal.abort();
  mutable.checkAuthority=()=>{throw Error('Replaced asset writer authority');};
 }};
 const readmitted=await encode(header,sources,mutable);
 assert.equal(readmitted.manifest.sha256,files.manifest.sha256);
}
