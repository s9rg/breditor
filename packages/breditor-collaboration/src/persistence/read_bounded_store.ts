/** Count before cloning values, within the caller's existing transaction.
 * Cardinality and each actual request are bounded; this is not a per-value byte
 * or memory guarantee. The caller still validates every key, byte and identity. */
export function readBoundedStore(store:IDBObjectStore,maximum:number,accept:(row:{keys:IDBValidKey[];values:unknown[]})=>void,abort:(reason:unknown)=>void,refusal:()=>Error):void {
 try{
  if(!Number.isSafeInteger(maximum)||maximum<1||maximum>0xffffffff)throw refusal();
  const count=store.count();count.onsuccess=()=>{
   try{
    const size=count.result;if(!Number.isSafeInteger(size)||size<0||size>maximum)throw refusal();
    if(size===0){accept({keys:[],values:[]});return;}
    const row={keys:[] as IDBValidKey[],values:[] as unknown[]};let left=2;
    const ready=()=>{if(--left)return;try{if(row.keys.length!==size||row.values.length!==size)throw refusal();accept(row);}catch(error){abort(error);}};
    const keys=store.getAllKeys(undefined,maximum),values=store.getAll(undefined,maximum);
    keys.onsuccess=()=>{row.keys=keys.result;ready();};values.onsuccess=()=>{row.values=values.result;ready();};
   }catch(error){abort(error);}
  };
 }catch(error){abort(error);}
}
