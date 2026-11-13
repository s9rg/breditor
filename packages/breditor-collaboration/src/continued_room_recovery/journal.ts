import {archiveFields} from '../archive_integrity/policy.js';
import {onIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {settleOwnedTransaction} from '../persistence/settle_owned_transaction.js';
import {recoveryFailure as fail} from './destination.js';

const storeName='continued_room_recovery',key='intent',format='breditor/continued-room-recovery-intent';
export interface RecoveryPlan {readonly text:string;readonly steps:number}
export type RecoveryCursor=Readonly<{completed:number;started:boolean}>;
const initial={completed:0,started:false};
const record=(plan:RecoveryPlan,cursor:RecoveryCursor)=>({format,formatVersion:1,plan:plan.text,...cursor});
function validate(input:unknown,plan:RecoveryPlan):RecoveryCursor{
 const row=archiveFields(input,'format,formatVersion,plan,completed,started'),{completed,started}=row;
 if(row['format']!==format||row['formatVersion']!==1||row['plan']!==plan.text||
    typeof completed!=='number'||!Number.isSafeInteger(completed)||completed<0||completed>plan.steps||
    typeof started!=='boolean'||completed===plan.steps&&started)throw fail('diverged');
 return {completed,started};
}
export async function openRecoveryJournal(name:string,plan:RecoveryPlan,begin:boolean,guard:()=>void,signal?:AbortSignal){
 guard();
 if(!begin){
  const db=await existingDatabase(name);
  if(!db)throw fail('missing');
  return db;
 }
 return new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open(name,1);
  let created=false,blocked=false,failure:unknown;
  const abort=(error:unknown)=>{failure??=error;try{request.transaction?.abort();}catch{}};
  const settle=onIndependentRecoveryAbort(signal,()=>abort(fail('aborted')));
  request.onupgradeneeded=()=>{
   try{
    guard();
    if(blocked)throw fail('exists');
    created=true;
    request.result.createObjectStore(storeName).add(record(plan,initial),key);
    guard();
   }catch(error){abort(error);}
  };
  request.onblocked=()=>{blocked=true;settle();reject(fail('exists'));};
  request.onerror=()=>{settle();reject(failure??fail('storage'));};
  request.onsuccess=()=>{
   settle();
   try{guard();if(!created||blocked)throw fail('exists');resolve(request.result);}
   catch(error){request.result.close();reject(error);}
  };
 });
}

export function accessRecoveryJournal(
 db:IDBDatabase,plan:RecoveryPlan,guard:()=>void,signal?:AbortSignal,
 transition?:Readonly<{before:RecoveryCursor;next:RecoveryCursor}>,
):Promise<RecoveryCursor>{
 guard();
 if(db.version!==1||db.objectStoreNames.length!==1||!db.objectStoreNames.contains(storeName))throw fail('diverged');
 if(transition){
  const {before,next}=transition;
  if(before.completed>=plan.steps||(before.started?(next.started||next.completed!==before.completed+1):
     (!next.started||next.completed!==before.completed)))throw fail('diverged');
 }
 return new Promise((resolve,reject)=>{
  const tx=transition?db.transaction(storeName,'readwrite',{durability:'strict'}):db.transaction(storeName,'readonly');
  let failure:unknown,result:RecoveryCursor;
  const abort=(error:unknown)=>{failure??=error;try{tx.abort();}catch{}};
  const settled=onIndependentRecoveryAbort(signal,()=>abort(fail('aborted')));
  settleOwnedTransaction(tx,()=>{settled();return result;},()=>{settled();return failure??fail('storage');},resolve,reject);
  try{
   guard();
   const store=tx.objectStore(storeName);
   if(store.keyPath!==null||store.autoIncrement||store.indexNames.length)throw fail('diverged');
   const count=store.count();
   count.onsuccess=()=>{
    try{
     guard();
     if(count.result!==1)throw fail('diverged');
     const request=store.get(key);
     request.onsuccess=()=>{
      try{
       guard();
       result=validate(request.result,plan);
       if(transition){
        if(JSON.stringify(result)!==JSON.stringify(transition.before))throw fail('diverged');
        result=transition.next;
        store.put(record(plan,result),key);
       }
       guard();
      }catch(error){abort(error);}
     };
    }catch(error){abort(error);}
   };
  }catch(error){abort(error);}
 });
}
