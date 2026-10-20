/** Exact committed records/bytes; inspection must never create a missing store. */
import assert from 'node:assert/strict';
async function stored(value){if(value instanceof Blob)return{type:value.type,bytes:[...new Uint8Array(await value.arrayBuffer())]};if(value instanceof ArrayBuffer)return{bytes:[...new Uint8Array(value)]};if(ArrayBuffer.isView(value))return{bytes:[...new Uint8Array(value.buffer,value.byteOffset,value.byteLength)]};if(Array.isArray(value))return Promise.all(value.map(stored));if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([key,v])=>[key,await stored(v)])));return value;}
export async function databaseSnapshot(name){
 assert.ok((await indexedDB.databases()).some(row=>row.name===name),'Never create a missing database for inspection');
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{const result={version:db.version,stores:{}};for(const name of [...db.objectStoreNames])result.stores[name]=await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly'),s=tx.objectStore(name),keys=s.getAllKeys(),values=s.getAll();tx.oncomplete=()=>resolve({keys:keys.result,values:values.result});tx.onabort=()=>reject(tx.error);});return await stored(result);}finally{db.close();}
}
