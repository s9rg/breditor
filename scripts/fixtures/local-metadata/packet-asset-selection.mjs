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
