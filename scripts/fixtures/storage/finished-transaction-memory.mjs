/** Test-only retained-heap probe. Public IndexedDB operations are unchanged;
 * explicit GC measures whether completed transactions keep obsolete results.
 * The optional module URL is used only to reproduce the prior dependency. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {setImmediate} from 'node:timers/promises';

const scenario=process.argv[2];
assert.ok(scenario==='commit'||scenario==='abort');
assert.equal(typeof globalThis.gc,'function','Run this fixture with --expose-gc');
const {IDBFactory}=await import(process.argv[3]??import.meta.resolve('fake-indexeddb'));
const factory=new IDBFactory();
const db=await new Promise((resolve,reject)=>{
 const request=factory.open('finished-transactions',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('records');
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
const read=()=>new Promise((resolve,reject)=>{
 const tx=db.transaction('records','readonly'),request=tx.objectStore('records').get('current');
 let result;request.onsuccess=()=>{result=request.result;};
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);
});
const write=(value,abort)=>new Promise((resolve,reject)=>{
 const tx=db.transaction('records','readwrite'),request=tx.objectStore('records').put(value,'current');
 if(abort){request.onsuccess=()=>tx.abort();tx.onabort=()=>resolve(value.length);tx.oncomplete=()=>reject(Error('Write unexpectedly committed'));}
 else{tx.oncomplete=()=>resolve(value.length);tx.onabort=()=>reject(tx.error);}
});
const collect=async()=>{for(let i=0;i<8;i++){await setImmediate();globalThis.gc();}await setImmediate();return process.memoryUsage().heapUsed;};
await write('baseline',false);await collect();const before=await collect();
let last='baseline';
for(let i=0;i<96;i++){
 const value=randomBytes(64*1024).toString('hex');
 assert.equal(await write(value,scenario==='abort'),128*1024);
 if(scenario==='commit')last=value;
 assert.equal(await read(),last,'Commit and abort must retain their actual IndexedDB meaning');
}
const after=await collect();assert.equal(await read(),last);
const retainedBytes=after-before,budgetBytes=4*1024*1024;
console.log(JSON.stringify({scenario,iterations:96,currentRows:1,retainedBytes,budgetBytes,heapLimitMiB:128,valuesVerified:true}));
db.close();
assert.ok(retainedBytes<budgetBytes,'Completed '+scenario+' transactions retained obsolete values: '+retainedBytes+' bytes');
