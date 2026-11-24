/** Internal bounded queue shared by separately declared local storage families. */
export class LocalCheckpointDatabase {
 #db:IDBDatabase;#tail:Promise<void>=Promise.resolve();#closed=false;#pendingBytes=0;#pendingWrites=0;
 readonly maxBytes:number;
 private constructor(db:IDBDatabase,maxBytes:number){this.#db=db;this.maxBytes=maxBytes;db.onversionchange=()=>this.close();}
 static async open(name:string,maxBytes=16*1024*1024):Promise<LocalCheckpointDatabase>{
  if(!name||name.length>200||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>16*1024*1024)throw Error("Invalid local session storage configuration");
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
   const request=indexedDB.open(name,1);let blocked=false;
   request.onupgradeneeded=()=>{request.result.createObjectStore("checkpoint");};
   request.onerror=()=>reject(request.error??Error("Cannot open local session storage"));
   request.onblocked=()=>{blocked=true;reject(Error("Local session upgrade is blocked"));};
   request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};
  });return new LocalCheckpointDatabase(db,maxBytes);
 }
 assertLive():void{if(this.#closed)throw Error("Local session storage is closed");}
 async load(key:string):Promise<unknown[]>{
  this.assertLive();
  // A failed write still leaves a durable record to read. Save and flush report that failure.
  await this.#tail.catch(()=>{});
  this.assertLive();
  return new Promise((resolve,reject)=>{
   const tx=this.#db.transaction("checkpoint","readonly"),request=tx.objectStore("checkpoint").getAll(key,1);
   tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error??Error("Local checkpoint read failed"));
  });
 }
 /** Bytes measure the exact native payload, not structured-clone record metadata. */
 write(key:string,value:unknown,bytes:number,checkExisting:(value:unknown)=>void):Promise<void>{
  this.assertLive();if(bytes>this.maxBytes)throw Error("Local checkpoint exceeds its byte budget");
  if(this.#pendingWrites>=64||this.#pendingBytes+bytes>32*1024*1024)throw Error("Local checkpoint write queue exceeds its budget");
  this.#pendingWrites++;this.#pendingBytes+=bytes;
  const write=this.#tail.catch(()=>{}).then(()=>{this.assertLive();return new Promise<void>((resolve,reject)=>{
   const tx=this.#db.transaction("checkpoint","readwrite"),store=tx.objectStore("checkpoint");
   let failure:unknown;
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure??tx.error??Error("Local checkpoint write failed"));
   try{
    const request=store.getAll(key,1);
    request.onsuccess=()=>{try{
     // Check presence inside the write transaction, including a stored undefined.
     if(request.result.length)checkExisting(request.result[0]);
     store.put(value,key);
    }catch(error){failure=error;tx.abort();}};
   }catch(error){failure=error;tx.abort();}
  });});
  const tracked=write.finally(()=>{this.#pendingWrites--;this.#pendingBytes-=bytes;});this.#tail=tracked;return tracked;
 }
 flush():Promise<void>{this.assertLive();return this.#tail;}
 close():void{if(this.#closed)return;this.#closed=true;this.#db.close();}
}
