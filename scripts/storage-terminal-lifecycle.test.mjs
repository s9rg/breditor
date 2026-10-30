/** Actual IDB transaction outcomes, terminal closure release and live watches. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {settleOwnedTransaction} from '../packages/breditor-collaboration/dist/persistence/settle_owned_transaction.js';

async function database(){
 const factory=new IDBFactory(),db=await new Promise((resolve,reject)=>{const q=factory.open('owned-terminal',1);q.onupgradeneeded=()=>q.result.createObjectStore('state');q.onerror=()=>reject(q.error);q.onsuccess=()=>resolve(q.result);});
 await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put({text:'Native checkpoint 🙂 '.repeat(2000)},'current');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
 return {factory,db};
}
function released(tx){for(const field of ['oncomplete','onabort','onerror'])assert.equal(tx[field],null,field+' releases its terminal closure');}
async function read(db){return new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly'),q=tx.objectStore('state').get('current');tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}

test('large exact reads release terminal closures and preserve the live database watch',async()=>{
 const {db}=await database(),watch=()=>{};db.onversionchange=watch;
 try{for(let i=0;i<30;i++){let tx,requestValue;const value=await new Promise((resolve,reject)=>{tx=db.transaction('state','readonly');const q=tx.objectStore('state').get('current');q.onsuccess=()=>{requestValue=q.result;assert.equal(typeof tx.oncomplete,'function');};settleOwnedTransaction(tx,()=>requestValue,()=>tx.error,resolve,reject);});assert.equal(value.text,'Native checkpoint 🙂 '.repeat(2000));released(tx);assert.equal(db.onversionchange,watch);}}finally{db.close();}
});
test('an explicit transaction abort preserves the original failure and leaves stored bytes intact',async()=>{
 const {db}=await database(),before=await read(db),refusal=Error('Authority changed during the read');let tx;
 try{await assert.rejects(new Promise((resolve,reject)=>{tx=db.transaction('state','readwrite');const q=tx.objectStore('state').get('current');settleOwnedTransaction(tx,()=>{throw Error('Must not acknowledge an abort');},()=>refusal,resolve,reject);q.onsuccess=()=>{tx.objectStore('state').put({text:'Uncommitted'},'current');tx.abort();};}),error=>error===refusal);released(tx);assert.deepEqual(await read(db),before);}finally{db.close();}
});
test('late permission refusal reports failure after retaining the actual committed fact',async()=>{
 const {db}=await database(),refusal=Error('Permission revoked after commit');let tx,committed;
 try{await assert.rejects(new Promise((resolve,reject)=>{tx=db.transaction('state','readwrite');tx.objectStore('state').put({text:'Actually committed'},'current');settleOwnedTransaction(tx,()=>{committed='Actually committed';throw refusal;},()=>tx.error,resolve,reject);}),error=>error===refusal);released(tx);assert.equal(committed,'Actually committed');assert.deepEqual(await read(db),{text:committed});}finally{db.close();}
});
test('a thrown failure decoder cannot strand an aborted transaction',async()=>{
 const {db}=await database(),refusal=Error('Original failure decoder');let tx;
 try{await assert.rejects(new Promise((resolve,reject)=>{tx=db.transaction('state','readonly');settleOwnedTransaction(tx,()=>null,()=>{throw refusal;},resolve,reject);tx.abort();}),error=>error===refusal);released(tx);}finally{db.close();}
});
test('completed reads leave the real version-change invalidation active',async()=>{
 const {factory,db}=await database();let changed=false,tx;
 try{db.onversionchange=()=>{changed=true;db.close();};await new Promise((resolve,reject)=>{tx=db.transaction('state','readonly');tx.objectStore('state').get('current');settleOwnedTransaction(tx,()=>undefined,()=>tx.error,resolve,reject);});released(tx);const next=await new Promise((resolve,reject)=>{const q=factory.open(db.name,2);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('Live watcher was lost'));q.onsuccess=()=>resolve(q.result);});next.close();assert.equal(changed,true);}finally{db.close();}
});
