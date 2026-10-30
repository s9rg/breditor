/** Actual dependency DATA, not provider reconciliation. All four genuine independent native source
 * layouts use the pinned normal Wasm. No upload or server receipt is inferred. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as native from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import {independentHistoryNative} from '../packages/breditor-collaboration/dist/independent_history/native_port.js';
import {readLocalMetadataRecordAssetReferences as read} from '../packages/breditor-collaboration/dist/selected_local_metadata_assets/record_references.js';
import {localChoice,emptyRelay} from '../packages/breditor-collaboration/dist/selected_local_review_delivery/policy.js';
import {metadataBinding,metadataChoice,metadataRecordsDigest,metadataJson} from '../packages/breditor-collaboration/dist/selected_local_metadata_delivery/policy.js';
import {emptyDeliveryRetainedRecords} from '../packages/breditor-collaboration/dist/delivery_state/retained.js';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {nativeProfile,cleanupSession} from './fixtures/owned-core-cleanup/session.mjs';
await native.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
const evidence=[];
test.after(()=>{const root=fileURLToPath(new URL('../',import.meta.url));mkdirSync(resolve(root,'target'),{recursive:true});writeFileSync(resolve(root,'target/local-metadata-assets-record-evidence.json'),JSON.stringify({format:'breditor/local-metadata-assets-record-evidence',formatVersion:1,kind:'native-dependency-data-only',cases:evidence},null,2)+'\n');});
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const replace=asset=>({kind:'replace_image',data:{block:'image-block',asset,generation:asset+'-generation'}}),draft=asset=>({scope:'commands',edit:{kind:'commands',data:[replace(asset)]}});
async function fixture(family='independent-both',mask=0){
 const reset=environment(),profile=nativeProfile(native,3,true),selected=cleanupSession(api,profile,{family,mask,language:3,database:'next-metadata-assets-source'}),descriptor=JSON.parse(profile.descriptor_json());let session;
 const root=canonical(JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8'))),document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root});
 try{
  session=await api.SharedIndependentHistoryPersistentSession.open({...selected.options,create:()=>profile.create(document,'101')});const core=session.core;
  core.dispatch({commands:[replace('retained-redo')]});assert.equal(core.undo(),true);
  const version=core.captureVersion('Source version','alice','1');await session.retainVersion(version);
  const proposal=core.captureSuggestion('Local image proposal','alice','2',{scope:'commands',edit:{kind:'commands',data:[replace('proposal-intermediate'),replace('proposal-final'),{kind:'delete_block',data:{block:'image-block'}}]}}),revision=core.captureSuggestionRevision(proposal,'Local image revision','3',draft('revision-only'));await session.flush();
  const source=independentHistoryNative(session).persisted(),parent=localChoice({format:'breditor/selected-local-review-delivery',formatVersion:1,database:'next-metadata-assets-parent',before:{format:'breditor/selected-room-current-selection',formatVersion:1,bytes:1,sha256:'a'.repeat(64)},lanes:[{id:'local',family:'independent-local',source:source.identity,binding:{endpoint:'ws://127.0.0.1:1/ws',principal:'alice',room:'room',actor:source.identity.review.actor,documentWriter:source.identity.native.writer,binding:'b'.repeat(64),writerTransport:'atomic-v2'}}]}),binding=metadataBinding({suggestions:{identity:{endpoint:parent.lanes[0].binding.endpoint,principal:'alice',room:'room',documentWriter:'101',effectWriter:'900',binding:'a'.repeat(64),writerTransport:'atomic-v2'},ownedHistory:mask&2?'reviewed-v1':null},revisions:{binding:'c'.repeat(64)},versions:{endpoint:parent.lanes[0].binding.endpoint,principal:'alice',room:'room',documentWriter:'101',binding:'d'.repeat(64),writerTransport:'atomic-v2'}},parent.lanes[0]),records=emptyDeliveryRetainedRecords(binding);
  records.suggestions.retained=[{packet:proposal,origin:'local',publish:true,publication:null,intent:null,decision:null}];records.revisions.retained=[{previousPacket:proposal,packet:revision,retry:true,receipt:null,conflict:null}];records.versions.packets=[{packet:version,origin:'local',publish:true,accepted:null}];
  const choice=metadataChoice({format:'breditor/selected-local-metadata-delivery',formatVersion:1,database:'next-metadata-assets-journal',parent,lanes:[{id:'local',binding,initial:await metadataRecordsDigest(records,binding)}]}),state={format:'breditor/selected-local-metadata-delivery-state',formatVersion:1,choice,revision:1,lanes:[{id:'local',source,relay:emptyRelay(parent.lanes[0].binding),records}]};
  return{session,core,profile,document,state,records,async fresh(){await session.flush();state.lanes[0].source=independentHistoryNative(session).persisted();return state;},async close(){await session.discardAndClose();profile.free();reset();}};
 }catch(error){await session?.discardAndClose();profile.free();reset();throw error;}
}
for(const family of ['independent-original','independent-document','independent-review','independent-both'])for(const mask of [0,2])test(family+' owned='+!!mask+': includes native Undo/Redo and every intermediate/deleted proposal/revision image',async()=>{
 const f=await fixture(family,mask);
 try{const document=f.core.documentJson(),checkpoint=f.core.checkpointJson(),record=metadataJson(f.state),result=await read(f.core,f.state,'local',()=>{});assert.equal(result.outcome.kind,'ready');assert.deepEqual(result.outcome.references.map(row=>row.asset).sort(),['asset','proposal-final','proposal-intermediate','retained-redo','revision-only']);assert.equal(result.packets.length,3,'The same original version in source and catalog is read once');assert.equal(Object.isFrozen(result),true);assert.equal(Object.isFrozen(result.outcome.references[0]),true);assert.equal(result.state.revision,1);assert.equal(result.state.bytes,Buffer.byteLength(record));assert.equal(f.core.documentJson(),document);assert.equal(f.core.checkpointJson(),checkpoint);assert.equal(metadataJson(f.state),record);evidence.push({family,ownedHistory:!!mask,state:JSON.parse(record),read:result,nativeUnchanged:true});}finally{await f.close();}
});
test('uncached catalog entries stay Pending even if a packet exists in source versions; caching completes the exact set',async()=>{
 const f=await fixture();let peer;
 try{const root=canonical(JSON.parse(f.document));const visit=node=>{if(node.type==='breditor/image'){node.properties['breditor/asset-id']='source-version-only';node.properties['breditor/asset-generation']='source-version-only-generation';}for(const child of node.children??[])visit(child);};visit(root.root);peer=new api.SharedRichEditor(f.profile.create(JSON.stringify(root),'202'));const packet=peer.captureVersion('Foreign immutable snapshot','bob','4'),entry={sequence:'1',version:f.core.readVersion(packet)};await f.session.retainVersion(packet);f.records.versions.catalog={through:'1',entries:[entry]};await f.fresh();const pending=await read(f.core,f.state,'local',()=>{});assert.equal(pending.outcome.kind,'pending');assert.equal('references'in pending.outcome,false);assert.ok(pending.outcome.pending.some(row=>row.kind==='uncached_version'&&row.id===entry.version.id));f.records.versions.packets.push({packet,origin:'remote',publish:false,accepted:entry});const ready=await read(f.core,f.state,'local',()=>{});assert.equal(ready.outcome.kind,'ready');assert.ok(ready.outcome.references.some(row=>row.asset==='source-version-only'));assert.notEqual(ready.state.sha256,pending.state.sha256);}finally{peer?.dispose();await f.close();}
});
test('a remote proposal with a genuinely missing native source stays Pending until the actual update arrives',async()=>{
 const f=await fixture();let peer;
 try{peer=new api.SharedRichEditor(f.profile.join_frame('room','202',f.core.updateFrame()));peer.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'Remote source not yet delivered '}}]});const packet=peer.captureSuggestion('Remote packet data only','bob','4',draft('pending-remote')),info=f.core.readSuggestion(packet);f.records.suggestions.retained.push({packet,origin:'remote',publish:false,publication:{sequence:'1',suggestion:info},intent:null,decision:null});const pending=await read(f.core,f.state,'local',()=>{});assert.equal(pending.outcome.kind,'pending');assert.ok(pending.outcome.pending.some(row=>row.kind==='source'&&row.missing.some(item=>item.writer==='202')));assert.equal('references'in pending.outcome,false);await f.core.receiveFrame(peer.updateFrame());await f.fresh();const ready=await read(f.core,f.state,'local',()=>{});assert.equal(ready.outcome.kind,'ready');assert.ok(ready.outcome.references.some(row=>row.asset==='pending-remote'));}finally{peer?.dispose();await f.close();}
});
test('the native owner must match both exact recorded journals, not merely the same writer identity',async()=>{
 const f=await fixture();try{f.core.dispatchReview({kind:'create_thread',data:{anchorJson:f.core.captureReviewAnchor({kind:'document'}),body:'Comment after recorded cut'}});await assert.rejects(read(f.core,f.state,'local',()=>{}),e=>e.code==='local_metadata_assets_source');}finally{await f.close();}
});
test('comment-only mutation inside authority checking invalidates the native read stamp',async()=>{
 const f=await fixture();let calls=0;try{const document=f.core.documentJson();await assert.rejects(read(f.core,f.state,'local',()=>{if(++calls===2)f.core.dispatchReview({kind:'create_thread',data:{anchorJson:f.core.captureReviewAnchor({kind:'document'}),body:'Comment during read'}});}),e=>e.code==='local_metadata_assets_changed');assert.ok(calls>=2);assert.equal(f.core.documentJson(),document);}finally{await f.close();}
});
test('input records are detached before the first await and do not run getter/toJSON hooks',async()=>{
 const f=await fixture();try{const original=structuredClone(f.state),expected=await read(f.core,original,'local',()=>{}),input=structuredClone(original),running=read(f.core,input,'local',()=>{});input.lanes[0].records.suggestions.retained=[];assert.deepEqual(await running,expected);let calls=0;const getter=structuredClone(original);Object.defineProperty(getter,'choice',{get(){calls++;return original.choice;},enumerable:true});await assert.rejects(read(f.core,getter,'local',()=>{}));assert.equal(calls,0);await assert.rejects(read(f.core,{...original,toJSON(){calls++;return original;}},'local',()=>{}));assert.equal(calls,0);}finally{await f.close();}
});
test('unknown lanes or a lookalike native owner cannot produce a dependency read',async()=>{
 const f=await fixture();try{await assert.rejects(read(f.core,f.state,'other',()=>{}),e=>e.code==='local_metadata_assets_policy');await assert.rejects(read({},f.state,'local',()=>{}));}finally{await f.close();}
});

test('authority must finish synchronously and cannot succeed by returning a boolean or promise',async()=>{
 const f=await fixture();try{for(const guard of [()=>true,()=>Promise.resolve(),()=>Promise.reject(Error('Deferred permission refusal'))])await assert.rejects(read(f.core,f.state,'local',guard),e=>e.code==='participant_authority');await new Promise(resolve=>setImmediate(resolve));}finally{await f.close();}
});
