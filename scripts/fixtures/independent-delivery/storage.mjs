/** Actual IDB terminal events over isolated fixtures; not physical crash/OS lock qualification. */
import {IDBDatabase} from 'fake-indexeddb';
export function deliveryFaults(){
 const transaction=IDBDatabase.prototype.transaction,commits=[];let selected;
 IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);if(args[1]==='readwrite'&&[...tx.objectStoreNames].includes('delivery_history_heads')){
  const store=tx.objectStore('delivery_history_heads');for(const name of ['add','put']){const original=store[name];store[name]=function(...args){commits.push({database:tx.db.name,head:args[0]});return original.apply(this,args);};}const get=tx.objectStore;tx.objectStore=function(name){return name==='delivery_history_heads'?store:get.call(this,name);};
  if(this.name===selected?.database){if(selected.kind==='abort')queueMicrotask(()=>{try{tx.abort();}catch{}});else{selected=undefined;Object.defineProperty(tx,'oncomplete',{configurable:true,set(){tx.addEventListener('complete',event=>tx.onabort?.(event));}});}}
 }return tx;};
 return{commits,select(database,kind='abort'){selected={database,kind};},clear(){selected=undefined;},restore(){IDBDatabase.prototype.transaction=transaction;}};
}
export async function readDeliveryHead(database){const db=await openDeliveryDatabase(database);try{return await new Promise((resolve,reject)=>{const tx=db.transaction('delivery_history_heads','readonly'),q=tx.objectStore('delivery_history_heads').get(['room','101']);let value;q.onsuccess=()=>{value=q.result;};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export function openDeliveryDatabase(database){return new Promise((resolve,reject)=>{const request=indexedDB.open(database);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function changeDeliveryStore(database,name,change){const db=await openDeliveryDatabase(database);try{return await new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');change(tx.objectStore(name));tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
