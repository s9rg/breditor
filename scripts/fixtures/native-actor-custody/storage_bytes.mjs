/** Test-only full storage comparisons. Node deepEqual does not compare Blob
 * contents; preserve their actual bytes and metadata outside the IDB transaction.
 * These observations are not SDK/native/persistence authority or crash proofs. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function storedValueBytes(value){
 const seen=new WeakMap();let count=0;
 async function visit(value){
  if(value===null)return{kind:'null'};
  if(typeof value!=='object'){
   if(['undefined','string','boolean','bigint'].includes(typeof value))return{kind:typeof value,value:typeof value==='bigint'?value.toString():value};
   if(typeof value==='number')return{kind:'number',value:Object.is(value,-0)?'-0':Number.isNaN(value)?'NaN':value===Infinity?'Infinity':value===-Infinity?'-Infinity':value};
   throw Error('Unsupported stored primitive');
  }
  const known=seen.get(value);if(known!==undefined)return{reference:known};
  const id=count++;seen.set(value,id);
  if(value instanceof Blob){const bytes=Buffer.from(await value.arrayBuffer());assert.equal(bytes.length,value.size);return{id,kind:Object.prototype.toString.call(value),bytes:bytes.length,mime:value.type,sha256:digest(bytes),...(typeof File!=='undefined'&&value instanceof File?{name:value.name,lastModified:value.lastModified}:{})};}
  if(value instanceof ArrayBuffer)return{id,kind:'ArrayBuffer',bytes:value.byteLength,sha256:digest(new Uint8Array(value))};
  if(ArrayBuffer.isView(value))return{id,kind:Object.prototype.toString.call(value),byteOffset:value.byteOffset,byteLength:value.byteLength,buffer:await visit(value.buffer)};
  if(value instanceof Date)return{id,kind:'Date',milliseconds:await visit(value.getTime())};
  if(value instanceof Map){const entries=[];for(const[key,child]of value)entries.push([await visit(key),await visit(child)]);return{id,kind:'Map',entries};}
  if(value instanceof Set){const entries=[];for(const child of value)entries.push(await visit(child));return{id,kind:'Set',entries};}
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);if(!array&&prototype!==Object.prototype&&prototype!==null)throw Error('Unsupported stored object');
  const entries=[];for(const key of Reflect.ownKeys(value)){if(array&&key==='length')continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!descriptor||!('value'in descriptor))throw Error('Unsupported stored accessor or key');entries.push([key,await visit(descriptor.value)]);}
  return{id,kind:array?'array':prototype===null?'null-prototype-object':'object',...(array?{length:value.length}:{}),entries};
 }
 return visit(value);
}
export async function databaseByteSnapshot(name){
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onupgradeneeded=()=>request.transaction.abort();request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Snapshot requires an existing unblocked database'));request.onsuccess=()=>resolve(request.result);});
 try{const names=[...db.objectStoreNames],version=db.version;if(!names.length)return{version,stores:[]};
  const raw=await new Promise((resolve,reject)=>{const tx=db.transaction(names,'readonly'),result=names.map(name=>{const store=tx.objectStore(name),keys=store.getAllKeys(),values=store.getAll(),indexes=[...store.indexNames].map(name=>{const index=store.index(name);return{name,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry};}),row={name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes,keys:undefined,values:undefined};keys.onsuccess=()=>{row.keys=keys.result;};values.onsuccess=()=>{row.values=values.result;};return row;});tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);});
  return{version,stores:await storedValueBytes(raw)};
 }finally{db.close();}
}
export async function sourceByteSnapshots(){return new Map(await Promise.all((await indexedDB.databases()).map(async row=>[row.name,await databaseByteSnapshot(row.name)])));}
export async function assertSourceBytesUnchanged(before){for(const[name,expected]of before)assert.deepEqual(await databaseByteSnapshot(name),expected,name);}
