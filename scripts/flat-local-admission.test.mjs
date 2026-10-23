/** Rehashed malformed input still has to satisfy role/native contracts.
 * Persisted MIME/size corruption refuses before native factory execution. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {OperationalIndependentLocalParticipant as OldParent} from '../packages/breditor-collaboration/dist/independent_local_operation/participant.js';
import {OperationalFlatLocalParticipant as Parent} from '../packages/breditor-collaboration/dist/flat_local_operation/participant.js';
import {FlatLocalOperationJournal as Journal} from '../packages/breditor-collaboration/dist/flat_local_operation/journal.js';
import {FlatLocalProvenance as Graph} from '../packages/breditor-collaboration/dist/flat_local_operation/framing.js';
import {FlatLocalArchive as Archive} from '../packages/breditor-collaboration/dist/flat_local_operation/archive.js';
import {flatLocalFixture} from './fixtures/flat-local-operation/session.mjs';
import {localParticipantUnitHost} from './fixtures/independent-local-operation/participant.mjs';
import {change} from './fixtures/independent-delivery-recovery/storage.mjs';
const runtime=process.env.BREDITOR_FLAT_LOCAL_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;
let host;
before(async()=>{host=await localParticipantUnitHost({api,rich,Participant:OldParent,runtime,fixture:new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url)});});
after(()=>host?.free());
function counted(factory,call){const history=factory.documentHistory,method=history.kind==='original'?'restoreOriginal':'restoreSegmented';return{...factory,documentHistory:{...history,[method](...args){call();return history[method](...args);}}};}
for(const target of['journal','parent'])for(const corruption of['mime','truncated'])test(`${target} retained ${corruption} corruption refuses before native admission`,async()=>{
 const f=await flatLocalFixture(host);let owner,calls=0;
 try{const options={...f.options,sourceFactory:counted(f.options.sourceFactory,()=>{calls++;}),...(target==='parent'?{cohort:{parentDatabase:f.original.value.f.tag+'-flat-parent',uploadsDatabase:f.original.value.f.tag+'-flat-uploads'}}:{})},Class=target==='parent'?Parent:Journal;
  owner=await Class.begin(f.file,options);await owner.close();owner=undefined;
  const database=target==='parent'?options.cohort.parentDatabase:options.database,store=target==='parent'?'flat_local_participant_input':'flat_local_input_incoming',file=corruption==='mime'?new Blob([f.file],{type:'application/octet-stream'}):new Blob(['x'],{type:f.file.type});
  await change(database,store,s=>s.put(file,'incoming'));calls=0;
  await assert.rejects(async()=>{owner=await Class.resume(options);});assert.equal(calls,0);
 }finally{await owner?.discardAndClose?.();await owner?.close();await f.close();}
});
const malformed=[
 ['native review digest spelling',s=>{const row=s.current.files.find(f=>f.lane==='review');assert.ok(row);row.sha256=row.sha256.replace('sha256:','');}],
 ['too many native files',s=>{assert.ok(s.current.files.length);s.current.files=Array.from({length:127},()=>s.current.files[0]);}],
 ['duplicate live document role',s=>{s.live[1]={...s.live[0]};}],
 ['undeclared opaque payload',s=>{s.live.pop();}],
];
for(const[name,mutate]of malformed)test(`rehashed ${name} refuses before any native factory`,async()=>{
 const f=await flatLocalFixture(host);let original,changed,calls=0;
 try{original=await Graph.read(f.file,{manifestSha256:f.backup.selection().manifestSha256});const metadata=original.metadata(),seed=metadata.recipes[0],state=JSON.parse(await original.statePart().text());assert.equal(seed.kind,'snapshot');mutate(state);
  const payload=index=>{const p=metadata.payloads[index];return original.payload(p.sha256,p.bytes);};
  changed=await Graph.seed(payload(seed.prefix),seed.parts.map(payload),seed.mime,new Blob([JSON.stringify(state)]),()=>{},metadata.states[0].additions.map(payload));
  const selected={original:f.backup.selection().original,...changed.selection()},readOptions={...f.original.value.readOptions,session:counted(f.original.value.readOptions.session,()=>{calls++;})};
  await assert.rejects(Archive.read(changed.file(),selected,readOptions));assert.equal(calls,0);assert.deepEqual(f.backup.live(),f.live);
 }finally{changed?.dispose();original?.dispose();await f.close();}
});
