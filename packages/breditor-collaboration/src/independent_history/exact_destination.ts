import {existingDatabase} from '../participant_recovery/journal.js';
import {settleOwnedTransaction} from '../persistence/settle_owned_transaction.js';
import type {IndependentHistoryCut} from './contract.js';
import type {PairedStoreNames} from './database.js';

export interface ExactHistoryDestination {
 readonly cut:IndependentHistoryCut;
 readonly fail:()=>Error;
}

/** A dedicated destination is either empty or contains exactly the selected head and file set.
 * All counts and exact key reads use one snapshot of both stores. The expected cut was
 * already constructed by the family codec, so equality also validates the saved encoding. */
export function inspectPairedDestination(
 tx:IDBTransaction,names:PairedStoreNames,key:readonly [string,string],expected:ExactHistoryDestination,
 accept:(status:'empty'|'exact')=>void,reject:(error:unknown)=>void,
):void{
 const {cut,fail}=expected;
 try{
  const [filesName,headsName]=names;
  const files=tx.objectStore(filesName),heads=tx.objectStore(headsName);
  if([files,heads].some(store=>store.keyPath!==null||store.autoIncrement||store.indexNames.length))throw fail();
  const fileCount=files.count(),headCount=heads.count(),head=heads.get([...key]);
  const reads=cut.files.map(file=>({file,request:files.get([...key,file.lane,file.generation])}));
  const check=()=>{
   try{
    if(fileCount.result===0&&headCount.result===0){accept('empty');return;}
    if(headCount.result!==1||fileCount.result!==cut.files.length||head.result!==cut.head||
       reads.some(({file,request})=>request.result!==JSON.stringify(file)))throw fail();
    accept('exact');
   }catch(error){reject(error);}
  };
  // IndexedDB completes the queued requests in order.
  (reads.at(-1)?.request??head).onsuccess=check;
 }catch(error){reject(error);}
}

export async function readExactHistoryDestination(
 db:IDBDatabase,names:PairedStoreNames,key:readonly [string,string],expected:ExactHistoryDestination,guard:()=>void,
):Promise<'empty'|'exact'>{
 guard();
 if(db.version!==1||db.objectStoreNames.length!==names.length||!names.every(name=>db.objectStoreNames.contains(name)))
  throw expected.fail();
 const status=await new Promise<'empty'|'exact'>((resolve,reject)=>{
  const tx=db.transaction([...names],'readonly');
  let result:'empty'|'exact'|undefined,failure:unknown;
  const abort=(error:unknown)=>{failure??=error;try{tx.abort();}catch{}};
  settleOwnedTransaction(tx,()=>{if(!result)throw expected.fail();return result;},()=>failure??tx.error??expected.fail(),resolve,reject);
  inspectPairedDestination(tx,names,key,expected,value=>{result=value;},abort);
 });
 guard();
 return status;
}

export async function inspectExactHistoryDestination(
 database:string,names:PairedStoreNames,key:readonly [string,string],expected:ExactHistoryDestination,guard:()=>void,
):Promise<'missing'|'empty'|'exact'>{
 guard();
 const db=await existingDatabase(database);
 let changed=false;
 try{
  guard();
  if(!db)return 'missing';
  db.onversionchange=()=>{changed=true;db.close();};
  const result=await readExactHistoryDestination(db,names,key,expected,guard);
  if(changed)throw expected.fail();
  return result;
 }finally{db?.close();}
}
