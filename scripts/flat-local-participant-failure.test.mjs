/** Exact cold retry at native/upload/parent publication boundaries. These are
 * synthetic terminal transactions, not physical crash-durability evidence. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {IDBObjectStore} from 'fake-indexeddb';
import * as api from '../packages/breditor-collaboration/dist/index.js';import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as OldParent} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';import {flatLocalFixture} from './fixtures/flat-local-operation/session.mjs';import {recoveryFaults,databaseValues} from './fixtures/independent-delivery-recovery/storage.mjs';
import {OperationalFlatLocalParticipant as Parent} from '../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
const runtime=process.env.BREDITOR_FLAT_LOCAL_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname,bytes=async file=>Buffer.from(await file.arrayBuffer());let host;const options=f=>({...f.options,cohort:{parentDatabase:f.original.value.f.tag+'-flat-parent',uploadsDatabase:f.original.value.f.tag+'-flat-uploads'}});
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});after(()=>host?.free());
for(const boundary of [
 {name:'upload insert abort',target:'uploads',store:'assets',number:1,kind:'abort',phase:'preparing'},
 {name:'prepared phase abort',target:'parent',store:'flat_local_participant_state',number:1,kind:'abort',phase:'preparing'},
 {name:'prepared phase committed completion lost',target:'parent',store:'flat_local_participant_state',number:1,kind:'lost-ack',phase:'prepared'},
 {name:'journal prepare abort',target:'journal',store:'flat_local_input_intent',number:1,kind:'abort',phase:'prepared'},
 {name:'journal prepare committed completion lost',target:'journal',store:'flat_local_input_intent',number:1,kind:'lost-ack',phase:'prepared'},
 {name:'native save abort',target:'source',store:'local_operation_history_heads',number:1,kind:'abort',phase:'prepared'},
 {name:'native save committed completion lost',target:'source',store:'local_operation_history_heads',number:1,kind:'lost-ack',phase:'prepared'},
 {name:'native acknowledgement abort',target:'journal',store:'flat_local_input_intent',number:2,kind:'abort',phase:'prepared'},
 {name:'native acknowledgement committed completion lost',target:'journal',store:'flat_local_input_intent',number:2,kind:'lost-ack',phase:'prepared'},
 {name:'operational phase abort',target:'parent',store:'flat_local_participant_state',number:2,kind:'abort',phase:'prepared'},
 {name:'operational phase committed completion lost',target:'parent',store:'flat_local_participant_state',number:2,kind:'lost-ack',phase:'operational'},
])test('actual parent cold resumes after '+boundary.name,async()=>{
 const f=await flatLocalFixture(host),faults=recoveryFaults();let p,parts;
 try{const o=options(f),target={parent:o.cohort.parentDatabase,journal:o.database,source:o.sourceDatabase,uploads:o.cohort.uploadsDatabase}[boundary.target];faults.select(target,boundary.store,boundary.number,boundary.kind);await assert.rejects(Parent.begin(f.file,o));faults.clear();assert.equal(faults.observed.some(row=>row.database===target),true);assert.equal((await databaseValues(o.cohort.parentDatabase)).flat_local_participant_state.values[0].phase,boundary.phase);p=await Parent.resume(o);assert.deepEqual(p.readableSource(),f.live);assert.deepEqual(await bytes(p.file()),await bytes(f.file));parts=await p.intoParts();assert.deepEqual(await bytes(await parts.uploads.exportBackup()),await bytes(f.whole));assert.equal(parts.source.session.state().status,'saved');}
 finally{faults.clear();faults.restore();await parts?.source.session.discardAndClose();parts?.uploads.close();await p?.discardAndClose();await f.close();}
});
for(const stage of ['parent','journal'])test(`actual ${stage} input-row success cancellation keeps only its committed predecessor`,async()=>{
 const f=await flatLocalFixture(host),controller=new AbortController(),add=IDBObjectStore.prototype.add;let p,hits=0;
 try{const o=options(f),database=stage==='parent'?o.cohort.parentDatabase:o.database,store=stage==='parent'?'flat_local_participant_input':'flat_local_input_incoming';IDBObjectStore.prototype.add=function(...args){const request=add.apply(this,args);if(this.transaction.db.name===database&&this.name===store)request.addEventListener('success',()=>{hits++;controller.abort();},{once:true});return request;};await assert.rejects(Parent.begin(f.file,{...o,signal:controller.signal}));IDBObjectStore.prototype.add=add;assert.equal(hits,1);assert.equal((await indexedDB.databases()).some(row=>row.name===database),false);p=stage==='parent'?await Parent.begin(f.file,o):await Parent.resume(o);assert.deepEqual(p.readableSource(),f.live);await p.check();}
 finally{IDBObjectStore.prototype.add=add;await p?.discardAndClose();await f.close();}
});
