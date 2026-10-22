/** A saved parent phase cannot reconstruct lost acknowledged native ownership.
 * All databases here belong to the isolated Node storage fixture. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as OldParent} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';import {captureLocalOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {open as openDatabase,change,databaseValues} from './fixtures/independent-delivery-recovery/storage.mjs';
import {OperationalRestoredLocalParticipant as Parent} from '../packages/breditor-collaboration/dist/restored_local_operation/participant.js';
const runtime=process.env.BREDITOR_RESTORED_LOCAL_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;const options=f=>({...f.options,cohort:{parentDatabase:f.value.f.tag+'-restored-parent',uploadsDatabase:f.value.f.tag+'-restored-uploads'}});
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
test('an operational parent cannot reinitialize a valid-looking empty native pair and journal',async()=>{
 const f=await restoredLocalFixture(host,capture);let p,recovered;
 try{const o=options(f);p=await Parent.begin(f.file,o);await p.close();await change(o.database,'restored_local_operation_intent',store=>{const request=store.get('state');request.onsuccess=()=>store.put({...request.result,sequence:'0',current:null,pending:null},'state');});await change(o.database,'restored_local_operation_cuts',store=>store.clear());
  const db=await openDatabase(o.sourceDatabase);try{await new Promise((resolve,reject)=>{const tx=db.transaction([...db.objectStoreNames],'readwrite');for(const name of db.objectStoreNames)tx.objectStore(name).clear();tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}
  await assert.rejects(async()=>{recovered=await Parent.resume(o);});assert.equal((await databaseValues(o.sourceDatabase)).local_operation_history_heads.values.length,0);assert.equal((await databaseValues(o.database)).restored_local_operation_cuts.values.length,0);
 }finally{await recovered?.discardAndClose();await p?.discardAndClose();await f.close();}
});
test('missing acknowledged native storage refuses before creating even an empty source schema',async()=>{
 const f=await restoredLocalFixture(host,capture);let p,recovered;
 try{const o=options(f);p=await Parent.begin(f.file,o);await p.close();await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(o.sourceDatabase);request.onsuccess=resolve;request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Fixture native owner was not released'));});
  await assert.rejects(async()=>{recovered=await Parent.resume(o);});assert.equal((await indexedDB.databases()).some(row=>row.name===o.sourceDatabase),false);
 }finally{await recovered?.discardAndClose();await p?.discardAndClose();await f.close();}
});
