/** Keep complete seven-family reads bounded without omitting custody or grants. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sevenNativeFixtures} from './fixtures/physical-operation-v3/seven-native.mjs';
import {completeHistoryFixture} from './fixtures/operation-read/history-session.mjs';
import {snapshotReadDatabases} from './fixtures/operation-read/storage-snapshot.mjs';

const fixtures=await sevenNativeFixtures();
for(const [mode,budget] of [['readHistory',8_000_000],['captureRecordCut',12_000_000]]){
 test('complete '+mode+' avoids repeated parent-to-child cohort traversal',async()=>{
  const f=await completeHistoryFixture({fixtures,tag:'history-grant-cost-'+mode});
  try{
   const before=await snapshotReadDatabases();f.endOldJob();const oldCalls=f.oldCalls;
   const descriptor=Object.getOwnPropertyDescriptor;let inspections=0,grants=0,result;
   // Count actual ownership-field work rather than wall time, which depends on
   // the host. The limits leave headroom above the repaired seven-family path
   // and fail the reproduced recursive parent/child traversal.
   Object.getOwnPropertyDescriptor=function(object,key){
    if(key==='core'||key==='options')inspections++;
    return Reflect.apply(descriptor,Object,[object,key]);
   };
   try{result=await f.owner[mode]({reads:f.reads,checkAuthority(){grants++;}});}
   finally{Object.getOwnPropertyDescriptor=descriptor;}
   assert.ok(result);assert.ok(grants>0,'Fresh permission must still run');
   assert.equal(f.oldCalls,oldCalls,'Expired writer grants must stay unused');
   assert.deepEqual(await snapshotReadDatabases(),before,'Read must preserve all committed stores');
   assert.ok(inspections>0,'Observe real ownership inspections');
   assert.ok(inspections<=budget,`${mode}: ${inspections} ownership inspections exceed ${budget}`);
  }finally{await f.close();}
 });
}
