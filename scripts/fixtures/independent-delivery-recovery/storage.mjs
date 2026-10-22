/** Terminal IDB failure/commit-before-ack fixtures. Never physical crash-durability evidence. */
import {IDBDatabase} from 'fake-indexeddb';
export function recoveryFaults(){
 const original=IDBDatabase.prototype.transaction;let selected;const observed=[];
 IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args),s=selected;
  if(s&&this.name===s.database&&args[1]==='readwrite'&&[...tx.objectStoreNames].includes(s.store)){
   observed.push({database:this.name,store:s.store,number:s.seen+1});s.seen++;
   if(s.seen===s.number){selected=undefined;if(s.kind==='abort')queueMicrotask(()=>{try{tx.abort();}catch{}});
    else Object.defineProperty(tx,'oncomplete',{configurable:true,set(handler){tx.addEventListener('complete',event=>{if(s.kind==='lost-ack')tx.onabort?.(event);else{s.afterCommit?.();handler?.(event);}});}});
   }
  }return tx;
 };
 return{observed,select(database,store,number,kind='abort',afterCommit){selected={database,store,number,kind,afterCommit,seen:0};},clear(){selected=undefined;},restore(){IDBDatabase.prototype.transaction=original;}};
}
export async function databaseValues(database){
 const db=await open(database);try{return await new Promise((resolve,reject)=>{const names=[...db.objectStoreNames].sort(),tx=db.transaction(names,'readonly'),out={};for(const name of names){const s=tx.objectStore(name);s.getAllKeys().onsuccess=e=>{(out[name]??={}).keys=e.target.result;};s.getAll().onsuccess=e=>{(out[name]??={}).values=e.target.result;};}tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export function open(database){return new Promise((resolve,reject)=>{const q=indexedDB.open(database);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
export async function change(database,store,mutate){const db=await open(database);try{return await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');mutate(tx.objectStore(store));tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export async function unknownDatabase(database){const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(database,7);q.onupgradeneeded=()=>q.result.createObjectStore('foreign').add('preserve','foreign');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});db.close();}
