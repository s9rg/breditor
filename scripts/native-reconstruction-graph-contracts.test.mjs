/** Closed, native-admitted graph DATA never grants save/author/server authority.
 * Reframed semantic failures leave both old source and journal unchanged. */
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import {join} from 'node:path';import {createHash} from 'node:crypto';
import legacy from './fixtures/native-reconstruction/graph-legacy.json' with {type:'json'};
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {completeControlFixtures} from './fixtures/physical-recovery-control/complete-fixtures.mjs';
import {acceptedControlTransport} from './fixtures/physical-recovery-control/accepted-transport.mjs';
import {graphOlderDisk} from './fixtures/native-reconstruction/graph-older-disk.mjs';
import {sourceSnapshot} from './fixtures/native-reconstruction/older-disk.mjs';
import {reframeReconstructionRecords} from './fixtures/native-reconstruction/reframe.mjs';
import {LoadedNativeReconstructionCurrent as Loaded} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {buildGraphReconstructionRecipe as build} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/graph_recipe.js';
import {inspectGraphNativeReconstruction as inspect} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/inspect_graph.js';
import {replayPortableRecovery} from '../packages/breditor-collaboration/dist/independent_operation/portable_replay.js';
import {readGraphEnvelope} from '../packages/breditor-collaboration/dist/restored_graph/graph_envelope.js';
import {appendRestoredGraphFrame} from '../packages/breditor-collaboration/dist/restored_graph/append_frame.js';
import {saveEvidence} from './candidate-release/evidence.mjs';
import {setImmediate as turn} from 'node:timers/promises';
let fixtures,transport,f,oldSource,oldJournal,names;
before(async()=>{fixtures=await completeControlFixtures(new URL('../',import.meta.url).pathname);transport=acceptedControlTransport(fixtures.manifest);f=await graphOlderDisk(fixtures,'graph-reconstruction-contracts',{documentSegmented:false,reviewSegmented:false});oldSource=await sourceSnapshot(f.database);oldJournal=await sourceSnapshot(f.journal);names=(await indexedDB.databases()).map(row=>row.name).sort();});
after(async()=>{await f?.close();transport?.restore();await fixtures?.close();if(fixtures){const rows=[];for(const item of fixtures.manifest.cases){let code;try{await fetch(item.endpoint,{signal:AbortSignal.timeout(2000)});}catch(error){code=error.cause?.code;}rows.push({endpoint:item.endpoint,closed:code==='ECONNREFUSED'});}saveEvidence(join(fixtures.directory,'native-reconstruction-graph-contract-endpoints-closed.json'),{rows});assert.ok(rows.every(row=>row.closed));}});
const options=()=>({id:'restored-graph',session:f.factory,descriptor:f.descriptor});
async function unchanged(){assert.deepEqual((await indexedDB.databases()).map(row=>row.name).sort(),names);assert.deepEqual(await sourceSnapshot(f.database),oldSource);assert.deepEqual(await sourceSnapshot(f.journal),oldJournal);}
async function candidate(mutate){const file=await reframeReconstructionRecords(f.loaded,fixtures.native,'restored-graph',mutate),loaded=await Loaded.read(file,{wasm:fixtures.native,checkAuthority(){}});assert.notDeepEqual(file.selection,f.retained.selection);return{file,loaded};}
async function admitted(input){const value=(await input.records('restored-graph')).source.live,replica=await replayPortableRecovery({...f.factory,database:'graph-readonly-unused',create(){throw Error('No fallback');}},value,input.check);try{replica.check();}finally{replica.dispose();}}
for(const [label,mutations] of [
 ['literal parent, input and operation identity',[
  (s,p)=>{p.parent.parent.plan+=' ';},(s,p)=>{p.parent.file.sha256='0'.repeat(64);},(s,p)=>{p.parent.input.kind='snapshot-v1';},s=>{s.input.fileSha256='0'.repeat(64);},s=>{s.identity.sourceDatabase+='-changed';},
 ]],
 ['complete current, pending and journal cuts',[
  s=>{s.snapshot.observed='0'.repeat(64);},s=>{s.snapshot.current.head+=' ';},s=>{s.snapshot.pending.files.push({lane:'document',generation:'not-real',kind:'root',sha256:'0'.repeat(64),json:'{}'});},s=>{s.snapshot.retained[0].id='0'.repeat(64);},s=>{s.snapshot.retained.push(structuredClone(s.snapshot.retained[0]));},s=>{s.snapshot.journal.completed=0;},s=>{s.snapshot.journal.intent.sequence='0';},
 ]],
 ['complete LIVE identity, bindings and closed wrapper',[
  s=>{s.live.source.identity.review.actor+='-changed';},s=>{s.live.retainedBinding.versions=null;},s=>{s.live.unrecognized=true;},
 ]],
 ['actual retained reference sets',[
  s=>{s.retainedReferences[0].id='0'.repeat(64);},s=>{s.retainedReferences[0].references.push({asset:'not-a-real-asset',generation:'not-real'});},s=>{s.retainedReferences=[];},
 ]],
])test('graph reconstruction rechecks '+label+' after complete frame admission',async()=>{
 for(const mutate of mutations){let value;try{value=await candidate(mutate);await assert.rejects(build(value.loaded,options()));await unchanged();}finally{value?.loaded.dispose();}}
});
for(const [label,mutate] of [
 ['dropped',s=>{assert.ok(s.live.source.versions.length>=2);s.live.source.versions=[];}],
 ['reordered',s=>{assert.ok(s.live.source.versions.length>=2);s.live.source.versions.reverse();}],
])test('graph reconstruction refuses '+label+' immutable versions despite native admission',async()=>{
 let value;try{value=await candidate(mutate);await admitted(value.loaded);await assert.rejects(build(value.loaded,options()));await unchanged();}finally{value?.loaded.dispose();}
});
for(const [label,mutate] of [
 ['dropped nonempty suggestion and revision queues',s=>{assert.ok(s.live.retained.suggestions.retained.length);assert.ok(s.live.retained.revisions.retained.length);s.live.retained.suggestions.retained=[];s.live.retained.revisions.retained=[];}],
 ['changed queued suggestion decision',s=>{const row=s.live.retained.suggestions.retained.find(row=>row.intent?.requested==='reject');assert.ok(row);row.intent.requested='accept';}],
 ['changed retained revision retry intent',s=>{assert.ok(s.live.retained.revisions.retained.length);const row=s.live.retained.revisions.retained[0];row.retry=!row.retry;}],
 ['dropped nonempty queued version packets',s=>{assert.ok(s.live.retained.versions.packets.length);s.live.retained.versions.packets=[];}],
])test('graph reconstruction requires merge for '+label+' despite native admission',async()=>{
 let value;try{value=await candidate(mutate);await admitted(value.loaded);await assert.rejects(inspect(f.s.owner,f.s.input(),{id:'restored-graph',retained:value.file}),error=>error.code==='native_reconstruction_requires_merge');await unchanged();}finally{value?.loaded.dispose();}
});
test('graph read factories and native descriptors stay explicit and readonly',async()=>{
 let calls=0;const history=f.factory.documentHistory,name=history.kind==='original'?'restoreOriginal':'restoreSegmented',factory={...f.factory,documentHistory:{...history,[name](){calls++;throw Error('Invalid policy must refuse before native');}}};
 for(const session of [{...factory,readOnly:false},{...factory,review:{...factory.review,access:'comment'}}])await assert.rejects(build(f.loaded,{...options(),session}),error=>error.code==='independent_delivery_recovery_policy');assert.equal(calls,0);
 await assert.rejects(build(f.loaded,{...options(),descriptor:'different native profile'}),error=>error.code==='native_reconstruction_policy');await unchanged();
});
for(const kind of ['input-dispose','asset-abort'])test('graph '+kind+' releases held native factory and frees its late raw owner exactly once',async()=>{
 const controller=new AbortController(),input=await Loaded.read(f.retained,{wasm:fixtures.native,checkAuthority(){}}),history=f.factory.documentHistory,name=history.kind==='original'?'restoreOriginal':'restoreSegmented';let release,entered,raw,checkpoint,freed=0,first=true,building;
 const native=new Promise(done=>release=done),started=new Promise(done=>entered=done);
 try{
  const session={...f.factory,documentHistory:{...history,[name](value){if(!first)return history[name].call(history,value);first=false;checkpoint=value;entered();return native;}}};
  building=build(input,{...options(),session,assets:{signal:controller.signal}});await Promise.race([started,building.then(()=>assert.fail('Expected held native read'),error=>{throw error;})]);
  if(kind==='input-dispose')input.dispose();else controller.abort();
  const outcome=await Promise.race([building.then(()=>({kind:'ready'}),error=>({kind:'rejected',error})),turn().then(()=>({kind:'pending'}))]);assert.equal(outcome.kind,'rejected','Cancellation must not wait for the native host');assert.equal(outcome.error.code,kind==='input-dispose'?'native_reconstruction_closed':'native_reconstruction_aborted');
  raw=await history[name].call(history,checkpoint);const free=raw.free.bind(raw);raw.free=()=>{freed++;return free();};release(raw);await turn();assert.equal(freed,1);await unchanged();
 }finally{if(!raw&&checkpoint)release(await history[name].call(history,checkpoint));await building?.catch(()=>{});input.dispose();}
});
test('graph append preserves pinned genuine pre-refactor bytes and caller failure boundaries',async()=>{
 assert.equal(legacy.format,'breditor/test-legacy-restored-graph');const bytes=Buffer.from(legacy.base64,'base64');assert.equal(bytes.length,legacy.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),legacy.sha256);
 const limits=checkRichAssetLimits(),envelope=await readGraphEnvelope(new Blob([bytes]),legacy.selection,limits),root=envelope.header.nodes.find(row=>row.kind==='lineage-v2'&&row.node.manifestSha256===envelope.header.root);assert.equal(root.node.previous.kind,'lineage-v2');
 const previous=await envelope.reconstruct(root.node.previous),base=await readGraphEnvelope(previous,{original:legacy.selection.original,manifestSha256:root.node.previous.manifestSha256},limits),view=envelope.views.get('state-v2:'+root.node.state);assert.equal(view.kind,'state-v2');
 const input={reference:root.node.previous,states:base.header.states,nodes:base.header.nodes,payloads:base.payloads},frame={file:view.file,header:view.header,selection:view.selection,payloads:view.header.parts.map(row=>envelope.payloads.get(row.sha256))};
 const encoded=await appendRestoredGraphFrame(input,frame,()=>{});assert.deepEqual(Buffer.from(await encoded.file.arrayBuffer()),bytes);assert.deepEqual(encoded.selection,legacy.selection);
 await appendRestoredGraphFrame(input,frame,()=>{throw undefined;}).then(()=>assert.fail('Dropped caller rejection'),reason=>assert.equal(reason,undefined));
 assert.deepEqual(Buffer.from(await(await envelope.reconstruct(root.node.previous)).arrayBuffer()),Buffer.from(await previous.arrayBuffer()));await unchanged();
});
