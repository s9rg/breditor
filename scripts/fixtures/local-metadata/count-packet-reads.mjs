import assert from 'node:assert/strict';

/** Count complete reads of one small fixture file. Restore the intrinsic on failure. */
export async function countPacketReads(file,read){
 assert.ok(file.size<=1024*1024,'Fixture must fit one digest chunk');
 const descriptor=Object.getOwnPropertyDescriptor(Blob.prototype,'arrayBuffer');
 const original=descriptor.value;
 let reads=0;
 Object.defineProperty(Blob.prototype,'arrayBuffer',{...descriptor,value:function(){
  if(this.size===file.size&&this.type===file.type)reads++;
  return original.call(this);
 }});
 try{return{value:await read(),reads};}
 finally{Object.defineProperty(Blob.prototype,'arrayBuffer',descriptor);}
}
