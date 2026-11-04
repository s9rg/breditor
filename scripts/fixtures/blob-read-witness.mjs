/** Opt-in Node forensics only. Install BEFORE importing the SDK, which captures
 * host methods at module initialization. Instrumented runs do not qualify the
 * ordinary runtime. Keep the first failing Blob handle without re-reading,
 * flattening, clipping, changing the returned buffer, or changing a refusal. */
export function watchBlobReadLengths(){
 const prior=Object.getOwnPropertyDescriptor(Blob.prototype,'arrayBuffer');
 const size=Object.getOwnPropertyDescriptor(Blob.prototype,'size').get;
 const length=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
 if(typeof prior?.value!=='function'||!prior.configurable)throw Error('A configurable host Blob reader is required');
 const read=prior.value;let first,active=true,failures=0;
 function observedArrayBuffer(...args){
  const file=this,pending=Reflect.apply(read,file,args);let expectedBytes;
  try{expectedBytes=Reflect.apply(size,file,[]);}catch{return pending;}
  return pending.then(result=>{
   // The observer cannot replace a successful value or the original error.
   try{
    const actualBytes=Reflect.apply(length,result,[]);
    if(active&&actualBytes!==expectedBytes){
     failures++;
     if(!first)first=Object.freeze({format:'breditor/test-blob-read-witness',formatVersion:1,file,expectedBytes,actualBytes,node:process.version,stack:new Error('First incomplete host Blob read').stack.slice(0,4096)});
    }
   }catch{/* Leave unexpected host values for the actual caller to validate. */}
   return result;
  });
 }
 Object.defineProperty(Blob.prototype,'arrayBuffer',{...prior,value:observedArrayBuffer});
 return Object.freeze({
  first:()=>first,
  failures:()=>failures,
  uninstall(){
   active=false;
   // A different owner's later patch must not be overwritten.
   if(Object.getOwnPropertyDescriptor(Blob.prototype,'arrayBuffer')?.value!==observedArrayBuffer)return false;
   Object.defineProperty(Blob.prototype,'arrayBuffer',prior);return true;
  },
 });
}
