/** Closed private ownership, current permissions and no implicit network work. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as OldParent} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';import {captureLocalOperationBackup as capture} from '../packages/breditor-collaboration/dist/independent_local_operation/portable_capture.js';
import {OperationalRestoredLocalParticipant as Parent} from '../packages/breditor-collaboration/dist/restored_local_operation/participant.js';import {RestoredLocalOperationJournal as Journal} from '../packages/breditor-collaboration/dist/restored_local_operation/journal.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';import {restoredLocalFixture} from './fixtures/restored-local-operation/session.mjs';
import {change} from './fixtures/independent-delivery-recovery/storage.mjs';
const runtime=process.env.BREDITOR_RESTORED_LOCAL_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname,bytes=async file=>Buffer.from(await file.arrayBuffer());let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
const options=f=>({...f.options,cohort:{parentDatabase:f.value.f.tag+'-restored-parent',uploadsDatabase:f.value.f.tag+'-restored-uploads'}});
test('private complete ownership requires a genuine reserved cohort, not a readiness field',async()=>{
 for(const name of ['OperationalRestoredLocalParticipant','RestoredLocalParticipantOpening','RestoredLocalParticipantUploads','RestoredLocalParticipantWitness'])assert.equal(name in api,false);assert.throws(()=>Reflect.construct(Parent,[]));
 const f=await restoredLocalFixture(host,capture);let calls=0;
 try{const o=options(f),before=await indexedDB.databases();for(const invalid of [{...o,ready:true},{...o,cohort:{...o.cohort,sourceDatabase:'extra'}},{...o,cohort:{...o.cohort,uploadsDatabase:o.database}}])await assert.rejects(Parent.begin(f.file,{...invalid,checkAuthority(){calls++;}}));await assert.rejects(Journal.begin(f.file,{...o,checkAuthority(){calls++;}}),error=>error.code==='restored_local_operation_parent_required');assert.equal(calls,0);assert.deepEqual(await indexedDB.databases(),before);}
 finally{await f.close();}
});
test('fresh host read-only document and comment permissions survive complete handoff',async()=>{
 const f=await restoredLocalFixture(host,capture);let p,parts;
 try{const o=options(f);p=await Parent.begin(f.file,{...o,sourceFactory:{...o.sourceFactory,readOnly:true,review:{...o.sourceFactory.review,access:'read_only'}}});parts=await p.intoParts();assert.equal(parts.source.session.core.view().readOnly,true);assert.throws(()=>parts.source.session.core.undo());assert.throws(()=>parts.source.session.core.undoReview());assert.deepEqual(parts.source.session.exportRecovery(),f.value.live);assert.deepEqual(await bytes(await parts.uploads.exportBackup()),f.value.uploads);assert.deepEqual(await bytes(parts.input.file()),await bytes(f.file));}
 finally{await parts?.source.session.discardAndClose();parts?.uploads.close();await p?.discardAndClose();await f.close();}
});
test('complete native/upload restoration performs no network upload or server activation',async()=>{
 const f=await restoredLocalFixture(host,capture),saved=Object.getOwnPropertyDescriptor(globalThis,'fetch'),localFetch=globalThis.fetch;let p,parts,calls=0;
 try{Object.defineProperty(globalThis,'fetch',{configurable:true,value(resource,...rest){const url=typeof resource==='string'?resource:resource?.url??String(resource);if(url.startsWith('blob:')||url.startsWith('data:'))return localFetch.call(this,resource,...rest);calls++;throw Error('Restore does not select a network endpoint');}});p=await Parent.begin(f.file,options(f));await p.check();parts=await p.intoParts();assert.deepEqual(await bytes(await parts.uploads.exportBackup()),f.value.uploads);assert.equal(calls,0);}
 finally{if(saved)Object.defineProperty(globalThis,'fetch',saved);else delete globalThis.fetch;await parts?.source.session.discardAndClose();parts?.uploads.close();await p?.discardAndClose();await f.close();}
});
test('valid uploaded metadata cannot replace an incoming immutable storage receipt',async()=>{
 const f=await restoredLocalFixture(host,capture,{archiveOnly:false,uploadedOriginal:true});let p;
 try{const o=options(f);p=await Parent.begin(f.file,o);await change(o.cohort.uploadsDatabase,'assets',store=>{const request=store.get(f.value.f.reference.asset);request.onsuccess=()=>{assert.equal(request.result.status,'uploaded');store.put({...request.result,storageRef:'different-valid-storage-receipt'});};});await assert.rejects(p.check(),error=>error.code==='restored_local_uploads_diverged');await assert.rejects(p.intoParts(),error=>error.code==='restored_local_uploads_diverged');assert.deepEqual(p.readableSource(),f.value.live);}
 finally{await p?.discardAndClose();await f.close();}
});
