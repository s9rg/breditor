/** Isolated storage/lock host. These are SDK lifecycle laws, not browser or OS lock proofs. */
import {IDBFactory} from 'fake-indexeddb';
export function cleanupEnvironment(){
 const saved=new Map(['indexedDB','navigator'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)])),held=new Set();
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});
 const locks={request(name,_options,callback){return Promise.resolve().then(async()=>{if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}});}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks}});
 return{held,restore(){for(const[name,value]of saved)if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}};
}
export async function databaseCut(name){
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 try{return await new Promise((resolve,reject)=>{const names=[...db.objectStoreNames].sort(),tx=db.transaction(names,'readonly'),rows=new Map();for(const name of names){const request=tx.objectStore(name).getAll();request.onsuccess=()=>rows.set(name,request.result);}tx.oncomplete=()=>resolve(JSON.stringify(names.map(name=>[name,rows.get(name)])));tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
