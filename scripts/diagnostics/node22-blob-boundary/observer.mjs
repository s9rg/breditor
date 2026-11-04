/** Explicit Node-only diagnostic. It observes Native reader byte counts while
 * returning the ORIGINAL arrayBuffer Promise. It retains no Blob, payload,
 * Native handle or result buffer in observation records. Not qualification. */
export function watchNativeBlobBoundary(){
 if(process.version!=='v22.14.0')throw Error('This diagnostic selects Node 22.14.0 internals explicitly');
 const arrayDescriptor=Object.getOwnPropertyDescriptor(Blob.prototype,'arrayBuffer'),size=Object.getOwnPropertyDescriptor(Blob.prototype,'size').get,length=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
 const sample=new Blob(['shape']),descriptors=Object.getOwnPropertyDescriptors(sample),symbol=Reflect.ownKeys(descriptors).find(key=>typeof key==='symbol'&&typeof descriptors[key].value?.getReader==='function');
 if(!symbol)throw Error('The selected Native Blob handle shape is unavailable');
 const handle=descriptors[symbol].value,handlePrototype=Object.getPrototypeOf(handle),readerPrototype=Object.getPrototypeOf(handle.getReader()),getDescriptor=Object.getOwnPropertyDescriptor(handlePrototype,'getReader'),pullDescriptor=Object.getOwnPropertyDescriptor(readerPrototype,'pull');
 for(const descriptor of[arrayDescriptor,getDescriptor,pullDescriptor])if(typeof descriptor?.value!=='function'||!descriptor.configurable)throw Error('The selected diagnostic methods must be configurable');
 const metadata=new WeakMap(),readers=new WeakMap();let active=true,sequence=0,arrayBufferCalls=0,completed=0,observationErrors=0,firstIncomplete=null;const recent=[];
 const snapshot=row=>({id:row.id,expectedBytes:row.expectedBytes,pulls:row.pulls,chunks:row.chunks,totalNativeBytes:row.totalNativeBytes,lastStatus:row.lastStatus,stack:row.stack});
 function observedArrayBuffer(...args){
  if(active)try{const own=Object.getOwnPropertyDescriptor(this,symbol),expectedBytes=Reflect.apply(size,this,[]);if(own&&'value'in own&&typeof own.value==='object'&&Number.isSafeInteger(expectedBytes)&&expectedBytes>=0){arrayBufferCalls++;metadata.set(own.value,{id:++sequence,expectedBytes});}}catch{observationErrors++;}
  // No then(), wrapper Promise, Blob capture, alternate reader or reread.
  return Reflect.apply(arrayDescriptor.value,this,args);
 }
 function observedGetReader(...args){const reader=Reflect.apply(getDescriptor.value,this,args);if(active)try{const row=metadata.get(this);if(row)readers.set(reader,{...row,pulls:0,chunks:0,totalNativeBytes:0,lastStatus:null});}catch{observationErrors++;}return reader;}
 function observedPull(callback,...args){
  const row=readers.get(this);if(!active||!row||typeof callback!=='function')return Reflect.apply(pullDescriptor.value,this,[callback,...args]);
  const receiver=this;
  return Reflect.apply(pullDescriptor.value,this,[(...values)=>{
   if(active)try{row.pulls++;row.lastStatus=values[0];if(values[1]!==undefined){row.chunks++;row.totalNativeBytes+=Reflect.apply(length,values[1],[]);}if(values[0]===0){completed++;const record=snapshot(row);recent.push(record);if(recent.length>32)recent.shift();if(row.totalNativeBytes!==row.expectedBytes&&!firstIncomplete)firstIncomplete={...record,stack:new Error('First incomplete Native Blob reader').stack.slice(0,2048)};}}catch{observationErrors++;}
   return Reflect.apply(callback,receiver,values);
  },...args]);
 }
 Object.defineProperty(Blob.prototype,'arrayBuffer',{...arrayDescriptor,value:observedArrayBuffer});Object.defineProperty(handlePrototype,'getReader',{...getDescriptor,value:observedGetReader});Object.defineProperty(readerPrototype,'pull',{...pullDescriptor,value:observedPull});
 return Object.freeze({summary:()=>({format:'breditor/test-native-blob-boundary',formatVersion:1,node:process.version,qualification:false,arrayBufferCalls,completed,observationErrors,firstIncomplete,recent:recent.map(row=>({...row})),scope:'Native callback byte counts before Node arrayBuffer concatenation. Original Promise/result/error and callbacks are preserved; observations hold no Blob, Native handle or result buffer. Instrumented diagnostic only.'}),uninstall(){active=false;const entries=[[Blob.prototype,'arrayBuffer',arrayDescriptor,observedArrayBuffer],[handlePrototype,'getReader',getDescriptor,observedGetReader],[readerPrototype,'pull',pullDescriptor,observedPull]];for(const[prototype,name,descriptor,installed]of entries)if(Object.getOwnPropertyDescriptor(prototype,name)?.value===installed)Object.defineProperty(prototype,name,descriptor);}});
}
