/** Archive integrity and genuine native custody laws; not browser/crash or arbitrary-realm security tests. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as api from '../packages/breditor-collaboration/dist/index.js';
import * as rich from '@breditor/experimental-rich-content';
import {environment} from './fixtures/room-participant-inventory/environment.mjs';
import {pixel,pixelAsset,secondPixel,secondAsset} from './fixtures/review-assets/pixels.mjs';
import {deliveryParticipantSession} from './fixtures/independent-delivery-participant/session.mjs';
import {attachDelivery,deliveryDraft,pendingDelivery} from './fixtures/independent-delivery/session.mjs';
import {deliveryFaults} from './fixtures/independent-delivery/storage.mjs';
import {databaseCut} from './fixtures/owned-core-cleanup/environment.mjs';
const runtime=process.env.BREDITOR_DELIVERY_PARTICIPANT_RUNTIME??new URL('../target/promoted-shared-web/',import.meta.url).pathname;
let profile,restoreEnvironment,descriptor,sequence=0;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),bytes=async blob=>Buffer.from(await blob.arrayBuffer());
const deliveryPort=async session=>(await import('../packages/breditor-collaboration/dist/independent_delivery/admission.js')).independentDeliverySessionPort(session);
const nativeReader=async source=>(await import('../packages/breditor-collaboration/dist/native_history_read/registry.js')).capturedNativeHistoryRead(source);
const insert=(core,text)=>core.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text}}]});
before(async()=>{restoreEnvironment=environment();const native=await import(pathToFileURL(runtime+'/breditor_shared.js'));await native.default({module_or_path:readFileSync(runtime+'/breditor_shared_bg.wasm')});profile=native.SharedRichProfile.from_configuration_json(JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:1,schema:{name:'example/independent-participant-laws',version:1},extensions:[]}));descriptor=JSON.parse(profile.descriptor_json());});
after(()=>{profile?.free();restoreEnvironment?.();});
async function fixture({documentSegmented=true,reviewSegmented=true,opaque=false,retained='all',wire=2,scope=0}={}){
 const tag='delivery-participant-law-'+sequence++,root=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')),selected=deliveryParticipantSession(api,profile,root,{documentSegmented,reviewSegmented,opaque,language:1,database:tag,retained,wire,scope}),options=selected.options,session=await api.SharedIndependentDeliverySession.open(options),parts=await attachDelivery(api,session,options),uploads=await rich.RichAssetStore.open(tag+'-uploads');await uploads.ingest(new Blob([pixel],{type:'image/png'}));await uploads.ingest(new Blob([secondPixel],{type:'image/png'}));await uploads.cancel(secondAsset);
 const capture=extra=>api.captureSharedIndependentDeliveryParticipant({participant:tag,principal:'alice',source:{session},assets:uploads,checkAuthority(){},...extra});
 return{tag,options,session,parts,uploads,capture,async close(){uploads.close();await session.discardAndClose();}};
}
const restoreDelivery=(options,recovery,writerRecovery)=>api.SharedIndependentDeliverySession.restoreRecovery({...options,recovery,writerRecovery});
async function ready(f){const result=await f.capture();assert.equal(result.kind,'ready');return result.backup;}
async function rewrite(backup,mutate,{tail=Buffer.alloc(0)}={}){
 const all=await bytes(backup.file()),prefixSize=all.indexOf(10)+1+4,headerSize=all.readUInt32BE(prefixSize-4),header=JSON.parse(all.subarray(prefixSize,prefixSize+headerSize)),body=all.subarray(prefixSize+headerSize);mutate(header);delete header.sha256;header.sha256=sha(JSON.stringify(header));const encoded=Buffer.from(JSON.stringify(header)),prefix=Buffer.from(all.subarray(0,prefixSize));prefix.writeUInt32BE(encoded.length,prefixSize-4);const file=new Blob([prefix,encoded,body,tail]);return{file,selection:{identity:backup.selection().identity,sha256:sha(await bytes(file))}};
}
async function rewriteReview(backup,mutate){
 const all=await bytes(backup.file()),prefixSize=all.indexOf(10)+1+4,headerSize=all.readUInt32BE(prefixSize-4),header=JSON.parse(all.subarray(prefixSize,prefixSize+headerSize)),body=all.subarray(prefixSize+headerSize),parts=[];let offset=0;
 for(const row of header.records){let part=body.subarray(row.offset,row.offset+row.bytes);if(row.kind==='review'){const review=JSON.parse(part);mutate(review);part=Buffer.from(JSON.stringify(review));}parts.push(part);row.offset=offset;row.bytes=part.length;row.sha256=sha(part);offset+=part.length;}
 header.metadata.sourceBytes=offset;for(const asset of header.assets){const part=body.subarray(asset.offset,asset.offset+asset.bytes);parts.push(part);asset.offset=offset;offset+=part.length;}parts.push(body.subarray(header.uploads.offset));header.uploads.offset=offset;delete header.sha256;header.sha256=sha(JSON.stringify(header));const encoded=Buffer.from(JSON.stringify(header)),prefix=Buffer.from(all.subarray(0,prefixSize));prefix.writeUInt32BE(encoded.length,prefixSize-4);const file=new Blob([prefix,encoded,...parts]);return{file,selection:{identity:backup.selection().identity,sha256:sha(await bytes(file))}};
}
test('only genuine independent sessions mint captures; old-family handles and copied DTOs are refused',async()=>{
 const f=await fixture();try{assert.throws(()=>api.captureSharedIndependentDeliverySource({session:{core:f.session.core,exportRecovery:()=>f.session.exportRecovery()}}));assert.throws(()=>api.captureSharedGenerationSource({kind:'local',session:f.session}));assert.throws(()=>api.captureSharedIndependentDeliverySource({session:f.session,kind:'local'}));const capture=api.captureSharedIndependentDeliverySource({session:f.session});try{assert.throws(()=>api.SharedIndependentDeliverySourceCapture.prototype.check.call({metadata:()=>capture.metadata(),check(){}}));}finally{capture.dispose();}}finally{await f.close();}
});
test('direct JavaScript construction cannot mint an independent source with fake leases and a borrowed real core',async()=>{
 const f=await fixture(),exact=f.session.exportRecovery();let checks=0;const fakeLease={assertLive(){checks++;},async close(){}};
 try{assert.throws(()=>{const forged=Reflect.construct(api.SharedIndependentDeliverySession,[{},fakeLease,fakeLease,f.session.core,f.options,exact.identity,null,[],false]),capture=api.captureSharedIndependentDeliverySource({session:forged});try{capture.check();}finally{capture.dispose();}},error=>error.code==='managed_source_construction');assert.equal(checks,0);assert.deepEqual(f.session.exportRecovery(),exact);insert(f.session.core,'Actual owner remains live ');await f.session.flush();}
 finally{await f.close();}
});
test('all exported source owners reject missing or copied runtime construction keys before reading supplied objects',()=>{
 let reads=0;const supplied=new Proxy({}, {get(){reads++;throw Error('must not inspect supplied ownership');}});
 for(const name of ['SharedPersistentSession','SharedReviewPersistentSession','SharedSegmentedPersistentSession','SharedSegmentedRelaySession','SharedIndependentDeliverySession','SharedSuggestionQueue','SharedSuggestionRevisions','SharedDocumentVersions']){
  assert.equal(typeof api[name],'function',name);for(const args of [[],Array(12).fill(supplied),Array(12).fill(Object.freeze({}))])assert.throws(()=>Reflect.construct(api[name],args),error=>error.code==='managed_source_construction',name);
 }assert.equal(reads,0);
});
test('1000 unchanged source guards and actual no-ops do not reserialize either checkpoint',async()=>{
 const f=await fixture(),capture=api.captureSharedIndependentDeliverySource({session:f.session}),core=f.session.core,saved=new Map(['checkpointJson','reviewSegmentedCheckpoint'].map(name=>[name,Object.getOwnPropertyDescriptor(core,name)]));let calls=0;
 try{for(const name of saved.keys())Object.defineProperty(core,name,{configurable:true,value:()=>{calls++;throw Error('not a guard');}});for(let i=0;i<1000;i++)capture.check();core.select(null);capture.check();assert.equal(calls,0);}finally{for(const [name,value]of saved)if(value)Object.defineProperty(core,name,value);else delete core[name];capture.dispose();await f.close();}
});
test('comment, document, independent boundary and version changes invalidate exact source captures',async()=>{
 for(const [documentSegmented,reviewSegmented]of [[false,false],[false,true],[true,false],[true,true]]){const f=await fixture({documentSegmented,reviewSegmented});try{for(const change of [()=>insert(f.session.core,'Native '),()=>f.session.core.dispatchReview({kind:'create_thread',data:{anchorJson:f.session.core.captureReviewAnchor({kind:'document'}),body:'New native comment'}}),...(documentSegmented?[()=>f.session.sealDocumentGeneration('next')]:[]),...(reviewSegmented?[()=>f.session.sealReviewGeneration('next')]:[]),()=>f.session.retainVersion(f.session.core.captureVersion('Native version','alice','1'))]){const capture=api.captureSharedIndependentDeliverySource({session:f.session});try{await change();assert.throws(()=>capture.check(),error=>error.code==='independent_delivery_source_changed');}finally{capture.dispose();}}}finally{await f.close();}}
});
test('capture refuses an editor getter retarget without invoking it, and close disposes only the original core',async()=>{
 const f=await fixture(),owned=f.session.core,capture=api.captureSharedIndependentDeliverySource({session:f.session});let getters=0;try{Object.defineProperty(f.session,'core',{configurable:true,get(){getters++;return {};}});assert.throws(()=>capture.check(),error=>error.code==='independent_delivery_source');await assert.rejects(f.capture());assert.equal(getters,0);await f.session.discardAndClose();assert.throws(()=>owned.view(),error=>error.code==='disposed');assert.equal(getters,0);}finally{capture.dispose();await f.close();}
});
test('public source/export method overrides cannot replace the actual paired native records',async()=>{
 const f=await fixture(),exact=f.session.exportRecovery(),own=Object.getOwnPropertyDescriptor(f.session,'exportRecovery');try{Object.defineProperty(f.session,'exportRecovery',{configurable:true,value:()=>({...exact,documentCheckpoint:'{}',reviewCheckpoint:'{}'})});const capture=api.captureSharedIndependentDeliverySource({session:f.session});try{assert.equal(capture.records()[0].json,exact.source.documentCheckpoint);assert.equal(capture.records()[1].json,exact.source.reviewCheckpoint);}finally{capture.dispose();}const backup=await ready(f);try{assert.deepEqual(backup.sourceRecovery(),exact);}finally{backup.dispose();}}finally{if(own)Object.defineProperty(f.session,'exportRecovery',own);else delete f.session.exportRecovery;await f.close();}
});
test('capture and source proof use canonical methods even when public capture/read/guard methods are replaced',async()=>{
 const f=await fixture(),target=api.SharedIndependentDeliverySourceCapture.prototype,fields=['metadata','records','check'],saved=new Map(fields.map(name=>[name,Object.getOwnPropertyDescriptor(target,name)])),staticCapture=api.SharedIndependentDeliverySourceCapture.capture;let backup;
 try{api.SharedIndependentDeliverySourceCapture.capture=()=>({check(){},metadata:()=>({outcome:{kind:'ready',references:[]}}),records:()=>[]});for(const [name,value]of [['metadata',()=>({outcome:{kind:'ready',references:[]}})],['records',()=>[]],['check',()=>{}]])Object.defineProperty(target,name,{configurable:true,writable:true,value});backup=await ready(f);assert.equal(backup.metadata().bindings.length,1);assert.equal(backup.records().length,6);assert.equal(backup.records()[0].json,f.session.exportRecovery().source.documentCheckpoint);}
 finally{api.SharedIndependentDeliverySourceCapture.capture=staticCapture;for(const [name,value]of saved)Object.defineProperty(target,name,value);backup?.dispose();await f.close();}
});
test('missing opaque referenced bytes stay Pending while unreferenced cancelled upload bytes survive',async()=>{
 const f=await fixture({opaque:true}),before=f.session.exportRecovery(),uploads=await bytes(await f.uploads.exportBackup());try{const result=await f.capture();assert.equal(result.kind,'pending');assert.deepEqual(result.pending,[{kind:'asset',reference:{asset:'opaque-image',generation:f.session.core.retainedAssetReferences().references[0].generation}}]);assert.deepEqual(f.session.exportRecovery(),before);assert.deepEqual(await bytes(await f.uploads.exportBackup()),uploads);}finally{await f.close();}
});
test('opaque bindings require the exact immutable host mapping and admitted raster bytes',async()=>{
 const f=await fixture({opaque:true});let available=true;try{const result=await f.capture({resolveAsset:async reference=>({...reference,identity:'host-verified',blob:new Blob([pixel],{type:'image/png'}),check(){if(!available)throw Error('mapping changed');}})});assert.equal(result.kind,'ready');try{assert.deepEqual(await bytes(result.backup.blob('opaque-image',f.session.core.retainedAssetReferences().references[0].generation)),pixel);}finally{result.backup.dispose();}available=false;await assert.rejects(f.capture({resolveAsset:async reference=>({...reference,identity:'host-verified',blob:new Blob([pixel],{type:'image/png'}),check(){if(!available)throw Error('mapping changed');}})}));}finally{await f.close();}
});
for(const lane of ['document','review'])test('source changes during the final resolver are refused on '+lane+' even for Pending',async()=>{
 const f=await fixture({opaque:true});try{const uploads=await bytes(await f.uploads.exportBackup());await assert.rejects(f.capture({resolveAsset:async()=>{if(lane==='document')insert(f.session.core,'Changed during read ');else f.session.core.dispatchReview({kind:'create_thread',data:{anchorJson:f.session.core.captureReviewAnchor({kind:'document'}),body:'Changed during read'}});return undefined;}}),error=>error.code==='independent_delivery_source_changed');assert.deepEqual(await bytes(await f.uploads.exportBackup()),uploads);}finally{await f.close();}
});
test('revoked authority, async authority, cancellation and source close cannot return a ready capture',async()=>{
 for(const mode of ['revoked','async','cancelled','closed']){const f=await fixture({opaque:true}),abort=new AbortController();let authorized=true;try{await assert.rejects(f.capture({signal:abort.signal,checkAuthority:mode==='async'?async()=>{}:()=>{if(!authorized)throw Error('revoked');},resolveAsset:async reference=>{if(mode==='revoked')authorized=false;if(mode==='cancelled')abort.abort();if(mode==='closed')await f.session.discardAndClose();return{...reference,identity:'host-verified',blob:new Blob([pixel],{type:'image/png'}),check(){}};}}));}finally{await f.close();}}
});
test('portable bytes outlive closed sources and disposed handles cannot be used as proof',async()=>{
 const f=await fixture(),backup=await ready(f),file=backup.file(),selection=backup.selection();try{await f.session.close();backup.dispose();assert.throws(()=>backup.file(),error=>error.code==='independent_delivery_participant_closed');const archive=await api.readSharedIndependentDeliveryParticipant(file,selection);try{assert.equal(archive.sourceRecovery().source.identity.reviewHistory,'segmented-v1');assert.deepEqual(await bytes(archive.uploadBlob(secondAsset)),secondPixel);}finally{archive.dispose();}}finally{backup.dispose();await f.close();}
});
test('wrong digest, changed bytes, wrong selected principal and old generation format are refused',async()=>{
 const f=await fixture(),backup=await ready(f);try{await assert.rejects(api.readSharedIndependentDeliveryParticipant(backup.file(),{...backup.selection(),sha256:'0'.repeat(64)}));const all=await bytes(backup.file());all[all.length-1]^=1;await assert.rejects(api.readSharedIndependentDeliveryParticipant(new Blob([all]),backup.selection()));await assert.rejects(api.readSharedIndependentDeliveryParticipant(backup.file(),{...backup.selection(),identity:{...backup.selection().identity,principal:'bob'}}));await assert.rejects(api.readSharedGenerationAssetBackup(backup.file()));}finally{backup.dispose();await f.close();}
});
for(const [name,mutate]of [
 ['unknown header field',header=>{header.permission='edit';}],
 ['unknown source field',header=>{header.metadata.identity.source.history.review.access='moderate';}],
 ['wrong history family',header=>{header.metadata.identity.source.history.reviewHistory='original';}],
 ['duplicate record index',header=>{header.records[1].kind='document';}],
 ['unknown record kind',header=>{header.records[0].kind='future-kind';}],
 ['record gap',header=>{header.records[1].offset++;}],
 ['payload offset',header=>{header.assets[0].offset++;}],
 ['upload offset',header=>{header.uploads.offset++;}],
 ['changed raster hash',header=>{header.assets[0].contentAsset='sha256:'+'0'.repeat(64);}],
 ['unknown version',header=>{header.formatVersion=2;}],
])test('hash-valid archive still refuses '+name,async()=>{
 const f=await fixture(),backup=await ready(f);try{const changed=await rewrite(backup,mutate);await assert.rejects(api.readSharedIndependentDeliveryParticipant(changed.file,changed.selection));}finally{backup.dispose();await f.close();}
});
test('hash-valid trailing bytes are not silently ignored',async()=>{
 const f=await fixture(),backup=await ready(f);try{const changed=await rewrite(backup,()=>{},{tail:Buffer.from('trailing')});await assert.rejects(api.readSharedIndependentDeliveryParticipant(changed.file,changed.selection));}finally{backup.dispose();await f.close();}
});
test('a hash-valid changed binding is transport data until the genuine native source verifies it',async()=>{
 const f=await fixture(),backup=await ready(f),source=api.captureSharedIndependentDeliverySource({session:f.session});try{const changed=await rewrite(backup,header=>{header.metadata.bindings[0].generation='different-generation';}),archive=await api.readSharedIndependentDeliveryParticipant(changed.file,changed.selection);try{assert.throws(()=>archive.verifySource(source),error=>error.code==='independent_delivery_participant_source');}finally{archive.dispose();}}finally{source.dispose();backup.dispose();await f.close();}
});
test('a transport-valid archive never substitutes for actual native history replay',async()=>{
 const f=await fixture({documentSegmented:false,reviewSegmented:false}),backup=await ready(f);let archive;
 try{const changed=await rewriteReview(backup,review=>{review.history=[{actor:'comments',counter:'1'}];review.cursor=1;});archive=await api.readSharedIndependentDeliveryParticipant(changed.file,changed.selection);await f.session.close();await assert.rejects(restoreDelivery({...f.options,database:f.tag+'-invalid-native'},archive.sourceRecovery(),'host-reacquired'));const actual=await restoreDelivery({...f.options,database:f.tag+'-valid-native'},backup.sourceRecovery(),'host-reacquired');try{assert.deepEqual(actual.exportRecovery(),backup.sourceRecovery());}finally{await actual.close();}}
 finally{archive?.dispose();backup.dispose();await f.close();}
});
test('cold recovery refuses existing destinations and never derives write authority from archive identity',async()=>{
 const f=await fixture(),backup=await ready(f),exact=f.session.exportRecovery();let cold;try{await f.session.close();cold=await restoreDelivery({...f.options,database:f.tag+'-cold',readOnly:true,review:{...f.options.review,access:'read_only'}},backup.sourceRecovery(),'host-reacquired');assert.deepEqual(cold.exportRecovery(),exact);assert.throws(()=>insert(cold.core,'Denied'));assert.throws(()=>cold.core.dispatchReview({kind:'create_thread',data:{anchorJson:cold.core.captureReviewAnchor({kind:'document'}),body:'Denied'}}));await cold.close();await assert.rejects(restoreDelivery({...f.options,database:f.tag+'-cold'},backup.sourceRecovery(),'host-reacquired'),error=>error.code==='independent_history_destination_exists');await assert.rejects(restoreDelivery({...f.options,database:f.tag+'-other'},backup.sourceRecovery(),undefined));}finally{await cold?.discardAndClose();backup.dispose();await f.close();}
});
test('recovered complete uploads must match cancelled state and epochs, not just raster content',async()=>{
 const f=await fixture(),backup=await ready(f),source=api.captureSharedIndependentDeliverySource({session:f.session});let uploads;try{uploads=await rich.RichAssetStore.restoreBackup(f.tag+'-restore-uploads',backup.uploadBackup(),{uploadState:'preserve'});await backup.verifyRecovered(source,uploads);await uploads.retry(secondAsset);await assert.rejects(backup.verifyRecovered(source,uploads),error=>error.code==='independent_delivery_participant_integrity');assert.deepEqual(await bytes(backup.uploadBlob(secondAsset)),secondPixel);}finally{uploads?.close();source.dispose();backup.dispose();await f.close();}
});

test('native-only reads never certify changed queue, revision, version or receipt state',async()=>{
 for(const lane of ['proposal','revision','decision','version','document-receipt','review-receipt']){const f=await fixture();let source;try{const proposal=f.parts.queue.propose('Before capture','1',deliveryDraft('Pending '));await f.parts.queue.flush();source=api.captureSharedIndependentDeliverySource({session:f.session});const read=await nativeReader(source),before=f.session.exportRecovery(),revision=f.session.core.view().revision,records=source.records(),port=await deliveryPort(f.session);
  if(lane==='proposal')f.parts.queue.propose('Later proposal','2',deliveryDraft('Later '));else if(lane==='revision')f.parts.revisions.revise({previousSuggestionId:proposal.id,title:'Later revision',createdAtMs:'2',draft:deliveryDraft('Later ')});else if(lane==='decision')f.parts.queue.queueDecision(proposal.id,'reject','2');else if(lane==='version')f.parts.versions.saveVersion('Later version','2');else if(lane==='document-receipt')await port.persistDocument({accepted:f.session.core.writerClockV2('101'),receipt:null});else await port.persistReview({...f.session.reviewRelayProgress(),accepted:f.session.core.localReviewClock()});
  assert.equal(f.session.core.view().revision,revision);assert.equal(f.session.exportRecovery().source.documentCheckpoint,before.source.documentCheckpoint);assert.equal(read.document.checkpointJson(),before.source.documentCheckpoint,'A native-only read stays a native-only read');assert.throws(()=>read.check());assert.throws(()=>source.check(),error=>error.code==='independent_delivery_source_changed');assert.equal(source.records(),records);const current=api.captureSharedIndependentDeliverySource({session:f.session});try{assert.notDeepEqual(current.records(),records);current.check();}finally{current.dispose();}
 }finally{source?.dispose();await f.close();}}
});

test('pending proposal and revision image dependencies are part of the complete participant',async()=>{
 const f=await fixture();let source,backup;try{const replace=asset=>({scope:'commands',edit:{kind:'commands',data:[{kind:'replace_image',data:{block:'image-block',asset,generation:asset+'-generation'}}]}}),before=f.session.core.documentJson(),proposal=f.parts.queue.propose('Packet-only image','1',replace('proposal-only')),revision=f.parts.revisions.revise({previousSuggestionId:proposal.id,title:'Revision-only image',createdAtMs:'2',draft:replace('revision-only')});await f.parts.revisions.flush();source=api.captureSharedIndependentDeliverySource({session:f.session});assert.equal(source.metadata().outcome.kind,'ready');assert.deepEqual(source.metadata().outcome.references.map(row=>row.asset).sort(),['proposal-only','revision-only',pixelAsset].sort());assert.deepEqual(f.session.core.retainedAssetReferences().references.map(row=>row.asset),[pixelAsset]);assert.equal((await f.capture()).kind,'pending');
  const result=await f.capture({resolveAsset:async reference=>({...reference,identity:'host-verified',blob:new Blob([secondPixel],{type:'image/png'}),check(){}})});assert.equal(result.kind,'ready');backup=result.backup;assert.equal(backup.metadata().bindings.length,3);assert.deepEqual(await bytes(backup.blob('proposal-only','proposal-only-generation')),secondPixel);assert.deepEqual(await bytes(backup.blob('revision-only','revision-only-generation')),secondPixel);assert.equal(backup.sourceRecovery().retained.revisions.retained[0].packet,f.parts.revisions.packet(revision.id));assert.equal(f.session.core.documentJson(),before);backup.verifySource(source);
 }finally{backup?.dispose();source?.dispose();await f.close();}
});

test('unavailable native proposal sources remain Pending until the actual peer frame arrives',async()=>{
 const f=await fixture();let peer,source;try{peer=new api.SharedRichEditor(profile.join_frame('room','202',f.session.core.updateFrame()));insert(peer,'Foreign source ');const packet=peer.captureSuggestion('Foreign proposal','bob','1',deliveryDraft('Proposed '));await f.parts.queue.cacheVerifiedProposal(packet,{sequence:'1',suggestion:f.session.core.readSuggestion(packet)});source=api.captureSharedIndependentDeliverySource({session:f.session});assert.equal(source.metadata().outcome.kind,'pending');assert.ok(source.metadata().outcome.pending.some(row=>row.kind==='source'&&row.missing.length));assert.equal((await f.capture()).kind,'pending');await f.session.core.receiveFrame(peer.updateFrame());assert.throws(()=>source.check());const ready=await f.capture();assert.equal(ready.kind,'ready');ready.backup.dispose();}
 finally{source?.dispose();peer?.dispose();await f.close();}
});

for(const lane of ['proposal','revision','version','receipt'])test('final resolver rechecks complete '+lane+' work before returning Pending',async()=>{
 const f=await fixture({opaque:true});try{const proposal=f.parts.queue.propose('Before resolver','1',deliveryDraft('Before '));await f.parts.queue.flush();const port=await deliveryPort(f.session),native=f.session.exportRecovery().source.documentCheckpoint;await assert.rejects(f.capture({resolveAsset:async()=>{if(lane==='proposal')f.parts.queue.propose('During resolver','2',deliveryDraft('During '));else if(lane==='revision')f.parts.revisions.revise({previousSuggestionId:proposal.id,title:'During resolver',createdAtMs:'2',draft:deliveryDraft('During ')});else if(lane==='version')f.parts.versions.saveVersion('During resolver','2');else await port.persistDocument({accepted:f.session.core.writerClockV2('101'),receipt:null});return undefined;}}),error=>error.code==='independent_delivery_source_changed');assert.equal(f.session.exportRecovery().source.documentCheckpoint,native);}
 finally{await f.close();}
});

for(const mode of ['abort','lost-ack'])test('portable recovery preserves the whole current failed-save cut, '+mode,async()=>{
 const f=await fixture(),faults=deliveryFaults();let backup,cold,coldUploads,source;try{faults.select(f.tag,mode);insert(f.session.core,'Unsaved native ');const proposal=f.parts.queue.propose('Unsaved proposal','1',deliveryDraft('Pending '));f.parts.revisions.revise({previousSuggestionId:proposal.id,title:'Unsaved revision',createdAtMs:'2',draft:deliveryDraft('Child ')});f.parts.versions.saveVersion('Unsaved version','3');f.parts.queue.queueDecision(proposal.id,'reject','4');for(const owner of [f.parts.queue,f.parts.revisions,f.parts.versions])await assert.rejects(owner.flush());const before=await databaseCut(f.tag),current=f.session.exportRecovery();backup=await ready(f);assert.deepEqual(backup.sourceRecovery(),current);assert.equal(await databaseCut(f.tag),before);await f.session.discardAndClose();faults.clear();cold=await restoreDelivery({...f.options,database:f.tag+'-cold'},backup.sourceRecovery(),'host-reacquired');coldUploads=await rich.RichAssetStore.restoreBackup(f.tag+'-cold-uploads',backup.uploadBackup(),{uploadState:'preserve'});source=api.captureSharedIndependentDeliverySource({session:cold});await backup.verifyRecovered(source,coldUploads);assert.deepEqual(cold.exportRecovery(),current);const parts=await attachDelivery(api,cold,f.options);assert.equal(parts.queue.status(proposal.id).intent.retry,true);assert.match(cold.core.documentJson(),/Unsaved native/);assert.equal(await databaseCut(f.tag),before);}
 finally{faults.clear();source?.dispose();backup?.dispose();coldUploads?.close();await cold?.discardAndClose();faults.restore();await f.close();}
});

test('a failed final close still permits a genuine complete readable backup before explicit discard',async()=>{
 const f=await fixture(),faults=deliveryFaults();let backup;try{faults.select(f.tag);f.parts.queue.propose('Keep failed close','1',deliveryDraft('Pending '));await assert.rejects(f.parts.queue.flush());const current=f.session.exportRecovery();await assert.rejects(f.session.close());backup=await ready(f);assert.deepEqual(backup.sourceRecovery(),current);assert.throws(()=>f.parts.queue.propose('No writes after retirement','2',deliveryDraft('No ')));}
 finally{faults.clear();backup?.dispose();faults.restore();await f.close();}
});

test('uncached catalog entries stay Pending and caching the actual packet invalidates the old source',async()=>{
 const {VersionCatalogStore}=await import('../packages/breditor-collaboration/dist/versions/store.js'),open=VersionCatalogStore.open;let store,f,other,source,backup;
 try{VersionCatalogStore.open=async function(...args){store=await open.apply(this,args);return store;};f=await fixture();VersionCatalogStore.open=open;const root=JSON.parse(readFileSync(new URL('../crates/breditor-core/tests/fixtures/rich-local-root.json',import.meta.url),'utf8')),selected=deliveryParticipantSession(api,profile,root,{opaque:true,language:1});other=new api.SharedRichEditor(profile.create(selected.document,'405'));const packet=other.captureVersion('Remote catalog version','bob','1'),entry={sequence:'1',version:f.session.core.readVersion(packet)};other.dispose();other=undefined;await store.adoptCatalog({through:'1',entries:[entry]});source=api.captureSharedIndependentDeliverySource({session:f.session});assert.equal(source.metadata().outcome.kind,'pending');assert.ok(source.metadata().outcome.pending.some(row=>row.kind==='uncached_version'&&row.id===entry.version.id));assert.equal((await f.capture()).kind,'pending');const revision=f.session.core.view().revision;await store.cachePacket(packet,entry);assert.equal(f.session.core.view().revision,revision);assert.throws(()=>source.check(),error=>error.code==='independent_delivery_source_changed');const result=await f.capture({resolveAsset:async reference=>({...reference,identity:'host-verified',blob:new Blob([secondPixel],{type:'image/png'}),check(){}})});assert.equal(result.kind,'ready');backup=result.backup;assert.equal(backup.sourceRecovery().retained.versions.packets.length,1);assert.equal(backup.metadata().bindings.length,2);}
 finally{VersionCatalogStore.open=open;backup?.dispose();source?.dispose();other?.dispose();await f?.close();}
});

test('explicit original wire and unselected retained stores keep their exact portable meanings',async()=>{
 for(const documentSegmented of [false,true])for(const reviewSegmented of [false,true])for(const scope of [0,1])for(const retained of ['none','versions']){const f=await fixture({documentSegmented,reviewSegmented,scope,wire:1,retained});let backup,cold;try{if(f.parts.versions){f.parts.versions.saveVersion('Original-wire queued version','1');await f.parts.versions.flush();}const exact=f.session.exportRecovery();backup=await ready(f);assert.equal(backup.records().length,retained==='none'?3:4);assert.equal(backup.sourceRecovery().retained.suggestions,null);assert.equal(backup.sourceRecovery().retained.revisions,null);assert.equal(backup.sourceRecovery().relay.binding.document.writerTransport,undefined);await f.session.close();cold=await restoreDelivery({...f.options,database:f.tag+'-cold'},backup.sourceRecovery(),'host-reacquired');assert.deepEqual(cold.exportRecovery(),exact);const source=api.captureSharedIndependentDeliverySource({session:cold});try{backup.verifySource(source);}finally{source.dispose();}}
 finally{backup?.dispose();await cold?.discardAndClose();await f.close();}}
});
