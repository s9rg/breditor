/** Both archive families must decode the exact page that passed its byte pin. */
import assert from 'node:assert/strict';
import {MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES} from '../../../packages/breditor-collaboration/dist/archive_integrity/policy.js';

export async function assertPinnedAcceptedPage(archive,options,integrityCode){
 const read=Blob.prototype.arrayBuffer;
 const original=Buffer.from(await read.call(archive.pageFile(0)));
 assert.ok(original.length>0&&original.length<=MAX_SHARED_ARCHIVE_DIGEST_CHUNK_BYTES);
 const expected=JSON.parse(original);
 assert.equal(JSON.stringify(expected),original.toString());
 assert.equal(typeof expected.documentFrame,'string');
 const changedFrame=expected.documentFrame.replace(/[a-z0-9]/i,value=>value==='a'?'b':'a');
 assert.notEqual(changedFrame,expected.documentFrame);
 const changed=Buffer.from(JSON.stringify({...expected,documentFrame:changedFrame}));
 assert.equal(changed.length,original.length);
 let reads=0,replaceOn=2;
 Blob.prototype.arrayBuffer=async function(){
  const bytes=await read.call(this);
  if(bytes.byteLength===original.length&&Buffer.from(bytes).equals(original)&&++reads===replaceOn){
   return Uint8Array.from(changed).buffer;
  }
  return bytes;
 };
 try{
  const accepted=await archive.readPage(0,options);
  assert.ok(accepted.documentFrame===expected.documentFrame,'Decoded frame must come from the exact verified page bytes');
  assert.equal(reads,1,'Only one full read may supply the verified page');
  reads=0;
  replaceOn=1;
  await assert.rejects(archive.readPage(0,options),error=>error.code===integrityCode);
  assert.equal(reads,1);
 }finally{Blob.prototype.arrayBuffer=read;}
}
