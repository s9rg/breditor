/** Read-only synthetic-IDB evidence. Missing stores abort rather than create a
 * placeholder. Blob/typed bytes, exact keys, schema and MIME stay observable. */
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function normalized(value){
 if(value instanceof Blob)return{type:'Blob',mime:value.type,bytes:value.size,sha256:sha(Buffer.from(await value.arrayBuffer()))};
 if(value instanceof ArrayBuffer)return{type:'ArrayBuffer',bytes:value.byteLength,sha256:sha(Buffer.from(value))};
 if(ArrayBuffer.isView(value))return{type:value.constructor.name,bytes:value.byteLength,sha256:sha(Buffer.from(value.buffer,value.byteOffset,value.byteLength))};
 if(value instanceof Date)return{type:'Date',value:value.toISOString()};
 if(Array.isArray(value))return Promise.all(value.map(normalized));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(async([key,item])=>[key,await normalized(item)])));
 return value;
}
export async function snapshotReadDatabases(){
 const result=[];
 for(const {name}of (await indexedDB.databases()).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onupgradeneeded=()=>request.transaction.abort();request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);});
  try{
   const stores=[];
   for(const name of db.objectStoreNames){
    const data=await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),store=tx.objectStore(name),keys=store.getAllKeys(),values=store.getAll();tx.oncomplete=()=>resolve({name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,keys:keys.result,values:values.result});tx.onabort=()=>reject(tx.error);});
    stores.push(await normalized(data));
   }
   result.push({name,version:db.version,stores});
  }finally{db.close();}
 }
 return result;
}
