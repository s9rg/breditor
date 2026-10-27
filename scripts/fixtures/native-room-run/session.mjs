/** Actual complete preparation, persisted immutable execution and explicit
 * fresh participant policies. No fabricated AST/native history or actor grant. */
import assert from 'node:assert/strict';
import {preparedRetirement,selectedPolicy} from '../native-room-retirement/session.mjs';
import {RoomExecutionArchive} from '../../../packages/breditor-collaboration/dist/native_room_execution/archive.js';
import {prepareRoomExecution} from '../../../packages/breditor-collaboration/dist/native_room_execution/coordinator.js';
export async function preparedRoomRun(fixtures,tag,options={}) {
 const f=await preparedRetirement(fixtures,tag,options);let archive;
 try{const reads={...f.integrity,reads:f.s.input().reads},layout={database:tag+'-target-execution',catalogDatabase:tag+'-target-catalog',operationDatabase:tag+'-target-operation',adoptionDatabase:tag+'-target-adoption',approvalDatabase:tag+'-target-approval',participants:f.data.choice.plan.participants.map(row=>({id:row.id,selectedUploadsDatabase:tag+'-target-selected-'+row.id}))};
  archive=await RoomExecutionArchive.capture({preparation:f.data,layout,decisions:layout.participants.map(row=>({id:row.id,union:[],adoption:[]}))},reads);
  const data=await prepareRoomExecution(f.s.owner,f.s.input(),{retained:f.retained,expected:archive.choice()});assert.deepEqual(data.choice,archive.choice());
  const expected={format:'breditor/native-room-run',formatVersion:1,database:tag+'-run',execution:data.choice},participants=data.choice.plan.preparation.plan.participants.map(row=>selectedPolicy(f.s.f.participants.find(old=>old.id===row.id),row));
  return{f,data,reads,layout,options:{expected,participants},async close(){archive?.dispose();await f.close();}};
 }catch(error){archive?.dispose();await f.close();throw error;}
}
export async function rawRows(name,table){const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction(table,'readonly'),q=tx.objectStore(table).getAll();tx.oncomplete=()=>resolve(q.result);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
