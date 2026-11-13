import {existingDatabase} from '../participant_recovery/journal.js';
import {settleOwnedTransaction} from '../persistence/settle_owned_transaction.js';
import type {IndependentHistoryCut} from './contract.js';
import type {PairedStoreNames} from './database.js';

export interface ExactHistoryDestination {
 readonly cut:IndependentHistoryCut;
 readonly fail:()=>Error;
}

type StoredRow=Readonly<{key:IDBValidKey;value:string}>;
export interface ExactHistoryRows {
 readonly files:readonly StoredRow[];
 readonly heads:readonly StoredRow[];
 readonly fail:()=>Error;
}

export function pairedDestinationRows(key:readonly [string,string],expected:ExactHistoryDestination):ExactHistoryRows{
 return {files:expected.cut.files.map(file=>({key:[...key,file.lane,file.generation],value:JSON.stringify(file)})),
  heads:[{key:[...key],value:expected.cut.head}],fail:expected.fail};
}

/** Verify the entire dedicated store set in a single transaction snapshot. */
export function inspectHistoryRows(
 tx:IDBTransaction,names:PairedStoreNames,expected:ExactHistoryRows,
 accept:(status:'empty'|'exact')=>void,reject:(error:unknown)=>void,
):void{
 const {fail}=expected;
 try{
  const [filesName,headsName]=names;
  const files=tx.objectStore(filesName),heads=tx.objectStore(headsName);
  if([files,heads].some(store=>store.keyPath!==null||store.autoIncrement||store.indexNames.length))throw fail();
  const fileCount=files.count(),headCount=heads.count();
  const reads=[
   ...expected.files.map(({key,value})=>({value,request:files.get(key)})),
   ...expected.heads.map(({key,value})=>({value,request:heads.get(key)})),
  ];
  const check=()=>{
   try{
    if(fileCount.result===0&&headCount.result===0){accept('empty');return;}
    if(headCount.result!==expected.heads.length||fileCount.result!==expected.files.length||
       reads.some(({value,request})=>request.result!==value))throw fail();
    accept('exact');
   }catch(error){reject(error);}
  };
  // IndexedDB completes the queued requests in order.
  (reads.at(-1)?.request??headCount).onsuccess=check;
 }catch(error){reject(error);}
}

export function inspectPairedDestination(
 tx:IDBTransaction,names:PairedStoreNames,key:readonly [string,string],expected:ExactHistoryDestination,
 accept:(status:'empty'|'exact')=>void,reject:(error:unknown)=>void,
):void{
 inspectHistoryRows(tx,names,pairedDestinationRows(key,expected),accept,reject);
}

export async function readExactHistoryDestination(
 db:IDBDatabase,names:PairedStoreNames,key:readonly [string,string],expected:ExactHistoryDestination,guard:()=>void,
):Promise<'empty'|'exact'>{
 return readExactHistoryRows(db,names,pairedDestinationRows(key,expected),guard);
}

export async function readExactHistoryRows(
 db:IDBDatabase,names:PairedStoreNames,expected:ExactHistoryRows,guard:()=>void,
):Promise<'empty'|'exact'>{
 guard();
 if(db.version!==1||db.objectStoreNames.length!==names.length||!names.every(name=>db.objectStoreNames.contains(name)))
  throw expected.fail();
 const status=await new Promise<'empty'|'exact'>((resolve,reject)=>{
  const tx=db.transaction([...names],'readonly');
  let result:'empty'|'exact'|undefined,failure:unknown;
  const abort=(error:unknown)=>{failure??=error;try{tx.abort();}catch{}};
  settleOwnedTransaction(tx,()=>{if(!result)throw expected.fail();return result;},()=>failure??tx.error??expected.fail(),resolve,reject);
  inspectHistoryRows(tx,names,expected,value=>{result=value;},abort);
 });
 guard();
 return status;
}

export async function inspectExactHistoryDestination(
 database:string,names:PairedStoreNames,key:readonly [string,string],expected:ExactHistoryDestination,guard:()=>void,
):Promise<'missing'|'empty'|'exact'>{
 return inspectExactHistoryRows(database,names,pairedDestinationRows(key,expected),guard);
}
export async function inspectExactHistoryRows(
 database:string,names:PairedStoreNames,expected:ExactHistoryRows,guard:()=>void,
):Promise<'missing'|'empty'|'exact'>{
 guard();
 const db=await existingDatabase(database);
 let changed=false;
 try{
  guard();
  if(!db)return 'missing';
  db.onversionchange=()=>{changed=true;db.close();};
  const result=await readExactHistoryRows(db,names,expected,guard);
  if(changed)throw expected.fail();
  return result;
 }finally{db?.close();}
}
