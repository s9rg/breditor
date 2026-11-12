import assert from 'node:assert/strict';

/** Observe only the outer archive's reads. Nested part admission is separate. */
export async function readVerifiedFrame(t,file,magic,read){
 const lengthOffset=Buffer.byteLength(magic),prefixBytes=lengthOffset+4;
 const length=Buffer.from(await file.slice(lengthOffset,prefixBytes).arrayBuffer()).readUInt32LE();
 const slice=Blob.prototype.slice,spans=[];
 const spy=t.mock.method(Blob.prototype,'slice',function(start,end,...rest){
  if(this.size===file.size&&this.type===file.type)spans.push([start,end]);
  return slice.call(this,start,end,...rest);
 });
 let archive;
 try{
  archive=await read();
  assert.ok(spans.some(([start,end])=>start===0&&end===prefixBytes),'Read bounded outer framing');
  assert.ok(!spans.some(([start,end])=>start===prefixBytes&&end===prefixBytes+length),'Decode the outer header from the verified stream');
  return archive;
 }catch(error){
  archive?.dispose();
  throw error;
 }finally{spy.mock.restore();}
}
