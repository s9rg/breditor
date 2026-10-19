import {existingDatabase} from "./journal.js";
import {recoveryFailure} from "./errors.js";
/** Never opens an old database with a newer schema version or upgrades an existing record. */
export async function requireAbsent(name:string):Promise<void>{const db=await existingDatabase(name);if(db){db.close();throw recoveryFailure("recovery_exists");}}
export async function inspectRecord(name:string,store:string,key:IDBValidKey,expected:unknown):Promise<"empty"|"exact">{
 const db=await existingDatabase(name);if(!db)return"empty";
 try{
  if(db.version!==1||db.objectStoreNames.length!==1||!db.objectStoreNames.contains(store))throw recoveryFailure("recovery_diverged");
  return await new Promise((resolve,reject)=>{let result:"empty"|"exact"="empty",failure:unknown;const tx=db.transaction(store,"readonly"),s=tx.objectStore(store);if(s.keyPath!==null||s.autoIncrement||s.indexNames.length){tx.abort();reject(recoveryFailure("recovery_diverged"));return;}let count:number|undefined,value:unknown,read=false;const check=()=>{if(count===undefined||!read)return;try{if(count===0&&value===undefined)return;if(count!==1||JSON.stringify(value)!==JSON.stringify(expected))throw recoveryFailure("recovery_diverged");result="exact";}catch(e){failure=e;tx.abort();}};
   const r=s.get(key),c=s.count();r.onsuccess=()=>{value=r.result;read=true;check();};c.onsuccess=()=>{count=c.result;check();};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure??recoveryFailure());
  });
 }finally{db.close();}
}
/** Pure shape/presence admission before opening a retained raster owner. Payload checks follow. */
export async function inspectUploads(name:string):Promise<"missing"|"empty"|"retained">{
 const db=await existingDatabase(name);if(!db)return"missing";
 try{if(db.version!==1||[...db.objectStoreNames].sort().join(",")!=="assets,metadata")throw recoveryFailure("recovery_diverged");
  return await new Promise((resolve,reject)=>{const tx=db.transaction(["assets","metadata"],"readonly"),assets=tx.objectStore("assets"),metadata=tx.objectStore("metadata");let count=0,budget:unknown,metaCount=0,failure:unknown;if(assets.keyPath!=="asset"||assets.autoIncrement||assets.indexNames.length||metadata.keyPath!==null||metadata.autoIncrement||metadata.indexNames.length){tx.abort();reject(recoveryFailure("recovery_diverged"));return;}
   assets.count().onsuccess=e=>{count=(e.target as IDBRequest<number>).result;};metadata.get("bytes").onsuccess=e=>{budget=(e.target as IDBRequest).result;};metadata.count().onsuccess=e=>{metaCount=(e.target as IDBRequest<number>).result;};tx.oncomplete=()=>{if(metaCount!==1||!Number.isSafeInteger(budget)||Number(budget)<0||count===0&&budget!==0)reject(recoveryFailure("recovery_diverged"));else resolve(count===0?"empty":"retained");};tx.onabort=()=>reject(failure??recoveryFailure());
  });
 }finally{db.close();}
}
