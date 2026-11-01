import {checkSavedReadDisposal} from './fixtures/local-metadata/saved-packet-read-disposal.mjs';
import {incompletePacketRasterData} from './fixtures/local-metadata/complete-inspection-cases.mjs';
import {readSavedPacketReplayFixture} from './fixtures/local-metadata/saved-packet-replay.mjs';
/** Diagnostic on exact saved bytes from a previously qualified genuine seven-family owner.
 * No editable actor, operational parent, storage or network service is reconstructed. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {PacketRasterFixtureImage} from './fixtures/local-metadata/packet-raster.mjs';
import {LoadedNativeReconstructionCurrent as Loaded} from '../packages/breditor-collaboration/dist/selected_native_reconstruction/loaded_current.js';
import {MetadataPacketBodyStore} from '../packages/breditor-collaboration/dist/metadata_packet_retention/body_store.js';
import {prepareArchiveIntegrity} from '../packages/breditor-collaboration/dist/archive_integrity/context.js';
import {encodeMetadataPacketArchive} from '../packages/breditor-collaboration/dist/metadata_packet_retention/archive.js';
import {packetImageDraft} from './fixtures/local-metadata/packet-raster.mjs';
import {MetadataPacketArchive} from '../packages/breditor-collaboration/dist/metadata_packet_retention/archive.js';
import {SharedRichEditor} from '../packages/breditor-collaboration/dist/core.js';
import {sourceCoreMethods as native,sourceNativeRecoveryRead} from '../packages/breditor-collaboration/dist/source_native_read.js';
import {visitRetainedPacketNative} from '../packages/breditor-collaboration/dist/metadata_packet_replay/visit.js';
import {inspectArchivedMetadataPacketOccurrences} from '../packages/breditor-collaboration/dist/metadata_packet_replay/occurrences.js';
import {replayRetainedMetadataPacketReferences} from '../packages/breditor-collaboration/dist/metadata_packet_replay/references.js';
import {readRetainedMetadataPacketReferences} from '../packages/breditor-collaboration/dist/metadata_packet_retention/native_references.js';
import * as wasm from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
const evidence=fs.mkdtempSync(new URL('../target/saved-packet-native-replay-evidence-',import.meta.url).pathname);
await wasm.default({module_or_path:fs.readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
test('saved seven-family Native readers reproduce original packet references without storage or old network access',{timeout:180000},async()=>{
 const Image=Object.getOwnPropertyDescriptor(globalThis,'Image'),idb=Object.getOwnPropertyDescriptor(globalThis,'indexedDB'),originalFetch=globalThis.fetch;let source,archive,profile,probe;const escaped=[],visited=[];
 Object.defineProperty(globalThis,'Image',{configurable:true,value:PacketRasterFixtureImage});Object.defineProperty(globalThis,'indexedDB',{configurable:true,get(){throw Error('Readonly saved Native replay must not access storage');}});globalThis.fetch=(url,options)=>{assert.equal(String(url).startsWith('blob:'),true,'Saved bindings must not cause old network access');return originalFetch(url,options);};
 try{
  const {bundle,fixture}=readSavedPacketReplayFixture(),options={wasm,checkAuthority(){}};
  profile=wasm.SharedRichProfile.from_standard_configuration_json_v3(fixture.configuration);probe=new SharedRichEditor(profile.restore('room',fixture.clients[0].documentCheckpoint),{richLanguage:3});probe.setReadOnly(true);const descriptor=JSON.stringify(sourceNativeRecoveryRead(probe).descriptor());probe.dispose();probe=undefined;
  source=await Loaded.read(bundle.packets.references.parent.parent.current,options);archive=await MetadataPacketArchive.read(bundle.packets.packets,{bytes:bundle.packets.references.references.bytes,sha256:bundle.packets.references.references.sha256},options);
  const clientIndex={original:0,generation:1,'independent-local':2,'independent-delivery':3,'restored-graph':4,'local-operation-snapshot':5,'local-operation-flat':6};
  const sources=source.catalog().participants.map(entry=>{
   const client=fixture.clients[clientIndex[entry.family]],identity=(entry.selection.identity??entry.selection.original.identity).source;
   if(entry.family==='original'){assert.equal(identity.writer,client.writer);return{id:entry.id,descriptor,read:{restore:checkpoint=>profile.restore('room',checkpoint)}};}
   if(entry.family==='generation'){assert.equal(identity.native.writer,client.writer);return{id:entry.id,descriptor,read:{restoreSegmented:checkpoint=>profile.restore_segmented('room',checkpoint)}};}
   const history=identity.history??identity;assert.equal(history.native.writer,client.writer);assert.equal(history.review.actor,client.actor);assert.equal(history.documentHistory,'segmented-v1');assert.equal(history.reviewHistory,'segmented-v1');
   const session={room:'room',writer:client.writer,richLanguage:3,history:'explicit',rangeEditing:'original',selectionEditing:'original',searchHistory:null,reviewedHistory:null,readOnly:true,review:{actor:client.actor,principal:client.principal,access:'read_only'},documentHistory:{kind:'segmented-v1',initialGenerations:{root:'root',active:'one'},restoreSegmented:checkpoint=>profile.restore_segmented('room',checkpoint)},reviewHistory:{kind:'segmented-v1',initialGenerations:{root:'root',active:'one'}},...(identity.binding?{binding:identity.binding,retained:identity.retained}:{})};
   return{id:entry.id,descriptor,read:{session}};
  });
  assert.equal(sources.length,7);
  for(const item of sources){await visitRetainedPacketNative(source,item,async alias=>{assert.equal(alias.participant,item.id);assert.equal(alias.core.view().readOnly,true);alias.check();visited.push(item.id);escaped.push(alias);return native.retainedAssetReferences.call(alias.core).document;});assert.throws(()=>escaped.at(-1).check());assert.throws(()=>escaped.at(-1).core.view());}
  const actual=await replayRetainedMetadataPacketReferences(source,archive,sources,{},options.checkAuthority);assert.deepEqual(actual,bundle.packets.requirements,'Original Native reference/Pending outcome must be reproduced literally');
  const snapshot=JSON.parse(await bundle.packets.references.parent.metadata.file.text()),occurrences=await inspectArchivedMetadataPacketOccurrences(source,archive,snapshot,sources,bundle.packets.containment,options,{},options.checkAuthority);assert.equal(occurrences.localOccurrences,82);assert.ok(occurrences.receiptPoints>7);
  const originalHeader=archive.header(),omittedFiles=await encodeMetadataPacketArchive({...originalHeader,local:originalHeader.local.slice(1)},archive.files().chunks,options),omitted=await MetadataPacketArchive.read(omittedFiles,originalHeader.parent,options);
  try{await assert.rejects(inspectArchivedMetadataPacketOccurrences(source,omitted,snapshot,sources,bundle.packets.containment,options,{},options.checkAuthority));}finally{omitted.dispose();}
  const selected=archive.header(),parents=new Map();for(const row of selected.local)if(row.previousBody!==null)parents.set(row.body,row.previousBody);const serverSuggestions=new Map(selected.server.filter(row=>row.kind==='suggestion').map(row=>[row.id,row.body]));for(const row of selected.server)if(row.kind==='revision'){const body=selected.bodies.find(item=>item.key===row.body);parents.set(row.body,serverSuggestions.get(body.native.previousSuggestionId));}
  const held=[];async function oracle(i){if(i===sources.length)return readRetainedMetadataPacketReferences(held,{bodies:()=>selected.bodies,async text(key){return(await archive.body(key)).text;}},parents,options.checkAuthority);return visitRetainedPacketNative(source,sources[i],async alias=>{held.push(alias);try{return await oracle(i+1);}finally{held.pop();}});}
  const prior=await oracle(0);assert.deepEqual(actual,prior,'The sequential saved-source algorithm must match the original genuine Native read');
  for(const alias of escaped)assert.throws(()=>alias.check());
  const wrong=sources.find(item=>item.id==='independent-local');let calls=0;await assert.rejects(visitRetainedPacketNative(source,{...wrong,read:{session:{...wrong.read.session,readOnly:false}}},async()=>{calls++;}));assert.equal(calls,0);
  let ended;await assert.rejects(visitRetainedPacketNative(source,sources[0],async alias=>{ended=alias;throw Error('Controlled saved read visitor failure');}),/Controlled saved read visitor failure/);assert.throws(()=>ended.check());
  let checkpoint,highest=0n;
  for(const item of sources)await visitRetainedPacketNative(source,item,async alias=>{const clock=BigInt(alias.core.writerClockV2('2').through);if(clock>highest)highest=clock;if(item.id==='original')checkpoint=alias.core.checkpointJson();});
  const privateAuthor=new SharedRichEditor(profile.restore('room',checkpoint),{richLanguage:3});let pendingArchive;
  try{
   privateAuthor.setReadOnly(false);privateAuthor.dispatch({commands:[{kind:'insert_text',data:{block:'p',offset:0,text:'A'.repeat(512)}}]});assert.ok(BigInt(privateAuthor.writerClockV2('2').through)>highest);
   let image;const walk=n=>{if(!image&&n.type==='breditor/image')image=n;for(const child of n.children??[])walk(child);};walk(JSON.parse(privateAuthor.documentJson()).root);assert.ok(image);
   const packet=privateAuthor.captureSuggestion('Private Native diagnostic source beyond all archived heads','alice','1000000',packetImageDraft(privateAuthor,image.properties['breditor/asset-id'])),store=new MetadataPacketBodyStore(prepareArchiveIntegrity(options),options.checkAuthority),keys=new Map();
   for(const row of selected.bodies){const value=await archive.body(row.key),parent=parents.get(row.key),before=parent===undefined?undefined:(await archive.body(parent)).text,copy=await store.retain(row.kind,value.text,privateAuthor,before);assert.equal(copy.key,row.key);keys.set(row.key,copy.key);}
   const extra=await store.retain('suggestion',packet,privateAuthor),chunks=await store.finish(),local=[...selected.local,{participant:'original',point:'diagnostic-unseen-source',store:'suggestions',index:0,body:extra.key,previousBody:null}],files=await encodeMetadataPacketArchive({...selected,bodies:store.bodies(),local,chunks:chunks.map(({bytes,sha256})=>({bytes,sha256}))},chunks,options);pendingArchive=await MetadataPacketArchive.read(files,selected.parent,options);
   const missing=await replayRetainedMetadataPacketReferences(source,pendingArchive,sources,{},options.checkAuthority);assert.equal(missing.pending.length,1);assert.equal(missing.pending[0].body,extra.key);assert.deepEqual(missing.pending[0].attempts.map(row=>row.participant),sources.map(row=>row.id));assert.ok(missing.pending[0].attempts.every(row=>row.missing.some(end=>end.writer==='2')));assert.deepEqual(missing.references,actual.references);
   async function missingOracle(i){if(i===sources.length)return readRetainedMetadataPacketReferences(held,{bodies:()=>pendingArchive.header().bodies,async text(key){return(await pendingArchive.body(key)).text;}},parents,options.checkAuthority);return visitRetainedPacketNative(source,sources[i],async alias=>{held.push(alias);try{return await missingOracle(i+1);}finally{held.pop();}});}
   assert.deepEqual(missing,await missingOracle(0),'The original complete Pending matrix must survive exact saved-client replay');
  }finally{pendingArchive?.dispose();privateAuthor.dispose();}
  const incompleteRasters=await incompletePacketRasterData(bundle,options);assert.notEqual(incompleteRasters.manifest.sha256,bundle.assets.files.manifest.sha256);
  const disposal=await checkSavedReadDisposal({bundle,profile,options,sources});
  const report={format:'breditor/saved-native-packet-replay-diagnostic',participants:visited,bodyCount:selected.bodies.length,serverBodyCount:selected.server.length,localOccurrences:selected.local.length,references:actual.references.length,pending:actual.pending.length,exactOriginalOutcome:true,originalAlgorithmEqual:true,privateUnseenSourcePendingPreserved:true,allLocalOccurrencesCompared:true,rehashedOccurrenceOmissionRefused:true,receiptPoints:occurrences.receiptPoints,allAliasesClosed:true,incompleteRasterFrameAdmitted:true,disposal,oldNetworkCalls:0,storageCalls:0,operationalOwnerCreated:false};fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');console.log('SAVED_NATIVE_REPLAY '+JSON.stringify(report));
 }finally{archive?.dispose();source?.dispose();probe?.dispose();profile?.free();globalThis.fetch=originalFetch;if(Image)Object.defineProperty(globalThis,'Image',Image);else delete globalThis.Image;if(idb)Object.defineProperty(globalThis,'indexedDB',idb);else delete globalThis.indexedDB;}
});
