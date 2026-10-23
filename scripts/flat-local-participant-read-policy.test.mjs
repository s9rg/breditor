/** Fresh execution policy is closed, bounded and reserved before callbacks. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as OldParent} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {OperationalFlatLocalParticipant as Parent} from '../packages/breditor-collaboration/dist/flat_local_operation/participant.js';import {flatLocalJournalBinding} from '../packages/breditor-collaboration/dist/flat_local_operation/journal.js';import {independentHistoryNative} from '../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';import {flatLocalFixture} from './fixtures/flat-local-operation/session.mjs';
const runtime=process.env.BREDITOR_FLAT_LOCAL_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
const options=f=>({...f.options,cohort:{parentDatabase:f.original.value.f.tag+'-flat-parent',uploadsDatabase:f.original.value.f.tag+'-flat-uploads'}});
test('invalid or writable fresh reader factories refuse before authority without leaking read capacity',async()=>{
 const f=await flatLocalFixture(host);let p,parts,scope,calls=0;
 try{p=await Parent.begin(f.file,options(f));parts=await p.intoParts();const source=parts.source.session,binding=flatLocalJournalBinding(independentHistoryNative(source).localOperation),factory=f.original.value.readOptions.session;
  for(let round=0;round<3;round++)for(const invalid of [null,false,{...factory,readOnly:false},{...factory,review:{...factory.review,access:'moderate'}}]){let unexpected;try{assert.throws(()=>{unexpected=binding.borrowRead(source,()=>{calls++;},undefined,invalid);});}finally{unexpected?.release();}}assert.equal(calls,0);scope=binding.borrowRead(source,()=>{},undefined,factory);assert.deepEqual(scope.readSource(),f.live);await scope.readSnapshot();
 }finally{scope?.release();await parts?.source.session.discardAndClose();parts?.uploads.close();await p?.discardAndClose();await f.close();}
});
test('fresh factory getter reentry meets an already reserved bounded read scope',async()=>{
 const f=await flatLocalFixture(host);let p,parts,denied=0;const scopes=[];
 try{p=await Parent.begin(f.file,options(f));parts=await p.intoParts();const source=parts.source.session,binding=flatLocalJournalBinding(independentHistoryNative(source).localOperation),factory=f.original.value.readOptions.session,fresh={...factory,get documentHistory(){try{scopes.push(binding.borrowRead(source,()=>{},undefined,fresh));}catch(error){assert.equal(error.code,'flat_local_input_busy');denied++;}return factory.documentHistory;}};scopes.push(binding.borrowRead(source,()=>{},undefined,fresh));assert.equal(scopes.length,8);assert.equal(denied,1);let finished=false;const closing=source.close().then(()=>{finished=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);for(const scope of scopes)scope.release();await closing;assert.equal(finished,true);
 }finally{for(const scope of scopes)scope.release();await parts?.source.session.discardAndClose();parts?.uploads.close();await p?.discardAndClose();await f.close();}
});
