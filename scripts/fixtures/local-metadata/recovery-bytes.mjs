/** Real selected server files, Native document publication and independently
 * observed controller continuation. Node storage/raster presentation are the
 * same controlled fixtures; no server byte selections or receipts are faked. */
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {dirname,join} from 'node:path';import {createHash} from 'node:crypto';
import * as api from '../../../packages/breditor-collaboration/dist/index.js';
import {withNativeRelayDelivery} from '../../../packages/breditor-collaboration/dist/relay/native_delivery.js';
import {inspectLocalMetadataRecoveryFiles} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/recovery_bytes_inspection.js';
import {saveAndReloadRecoveryBytes} from './recovery-bytes-files.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function testRecoveryBytes({kind,metadata,scope,sources,fixture,host,initial,initialHost,transport,check,native,fetchOriginal,adapters,contexts,extraHosts,referenceBundles}){
 let selected=initial,controller=initialHost,server,inventory,oldServer,oldInventory;
 const options={wasm:native,checkAuthority:check};
 const readers=async item=>{let server;try{server=await api.SharedServerLogGenerationRoomArchive.read(new Blob([readFileSync(join(dirname(item.path),'server-after.backup'))]),item.selection.source.server,options);return{server,inventory:await api.SharedServerLogGenerationParticipantInventory.read(new Blob([readFileSync(join(dirname(item.path),'inventory.json'))]),item.selection.source.participants)};}catch(error){server?.dispose();throw error;}};
 try{
  if(kind==='advanced'){
   const row=sources.find(row=>row.id==='independent-delivery');assert.equal(row.source.parent.kind,'independent-delivery');const session=row.source.parent.session,writer=session.reviewRelayIdentity().documentWriter,client=fixture.clients.find(value=>value.writer===writer);assert.ok(client);const auth=await host.authentication(client),context=metadata.createDelivery(row.source,'comment');contexts.push(context);
   const sync=api.createSharedIndependentRelaySync(session,withNativeRelayDelivery({identity:auth.document,getToken:auth.getToken,autoConnect:false,requestTimeoutMs:10000},context));adapters.push(sync);await sync.connect();await sync.flush();await context.close();assert.equal(sync.state().status,'closed');
   await assert.rejects(initialHost.check());selected=await host.refreshAfter(initial);assert.ok(Number(selected.selection.source.server.native.source.records)>Number(initial.selection.source.server.native.source.records),'A real document publication must advance the selected Native server');
   const current=await api.SharedServerLogGenerationRecoveryHost.open({endpoint:selected.endpoint,expected:selected.selection,principal:'operator',getToken:()=>host.operatorToken(selected),checkAuthority:check});extraHosts.push(current);
   controller=await api.SharedServerLogGenerationDeliveryRecoveryHost.open({endpoint:selected.deliveryEndpoint,expected:selected.deliverySelection,current,principal:'operator',getToken:()=>host.operatorToken(selected),checkAuthority:check});extraHosts.push(controller);
   const older=await readers(initial);oldServer=older.server;oldInventory=older.inventory;const before=metadata.recovery();await assert.rejects(metadata.captureRecoveryBytes({host:controller,transport,server:oldServer,inventory:oldInventory}));assert.deepEqual(metadata.recovery(),before,'A real but differently selected old server must fail before capture writes');
  }
  const actual=await readers(selected);server=actual.server;inventory=actual.inventory;
  let fakeCalls=0;const beforeInvalid=metadata.recovery();await assert.rejects(metadata.captureRecoveryBytes({host:controller,transport,server:{file(){fakeCalls++;},identity(){fakeCalls++;}},inventory}));assert.equal(fakeCalls,0);assert.deepEqual(metadata.recovery(),beforeInvalid);
  const captured=await metadata.captureRecoveryBytes({host:controller,transport,server,inventory});assert.equal(captured.kind,'ready');const bundle=captured.bundle;referenceBundles.push(['server-recovery',bundle.recoverable.references]);
  assert.deepEqual(bundle.server.identity,selected.selection.source.server);assert.deepEqual(bundle.inventory.identity,selected.selection.source.participants);assert.equal(bundle.server.sha256,sha(readFileSync(join(dirname(selected.path),'server-after.backup'))));assert.equal(bundle.inventory.sha256,sha(readFileSync(join(dirname(selected.path),'inventory.json'))));
  const persisted=await saveAndReloadRecoveryBytes(host.directory,bundle),portable=persisted.bundle,before=metadata.recovery(),savedFetch=globalThis.fetch;let network=0;globalThis.fetch=(url,input)=>{if(String(url).startsWith('blob:'))return fetchOriginal(url,input);network++;throw Error('Recovery-byte inspection is offline');};
  let inspection;
  try{
   inspection=await metadata.inspectRecoveryBytes(portable);assert.equal(inspection.scope,'native-client-cut-and-recorded-server-byte-selection');assert.equal(inspection.recoverable.rasters.payloads.length,3);assert.equal(inspection.recoverable.recordedAvailability.kind,'pending');assert.equal(inspection.recoverable.recordedAvailability.control.kind,kind==='advanced'?'native-continuation':'source');assert.equal('activate'in inspection,false);assert.equal('createDelivery'in inspection,false);
   // The exact function called after genuine Native replay rejects raw and
   // rehashed slot corruption. This is server-file component evidence, not an
   // independent way to manufacture Native-client or activation provenance.
   const bytes=Buffer.from(await bundle.server.file.arrayBuffer());bytes[bytes.length-1]^=1;const file=new Blob([bytes]);await assert.rejects(inspectLocalMetadataRecoveryFiles({...bundle,server:{...bundle.server,file,bytes:file.size,sha256:sha(bytes)}},inspection.recoverable,options,check));
   await assert.rejects(metadata.inspectRecoveryBytes({...bundle,extra:true}));assert.equal(network,0);assert.deepEqual(metadata.recovery(),before);
  }finally{globalThis.fetch=savedFetch;}
  const files=persisted.files,report={kind,server:inspection.server,inventory:inspection.inventory,sourceControl:inspection.recoverable.recordedAvailability.control,bytesComplete:true,serverUploadStillPending:true,networkRequestsDuringInspection:network,rawSlotCorruptionRefused:true,structuralReaderCopyRefusedBeforeCallback:true,actualServerAdvanced:kind==='advanced',inspectedFilesReadBackFromDisk:true};const encoded=Buffer.from(JSON.stringify(report));writeFileSync(join(host.directory,'recovery-bytes-inspection.json'),encoded,{mode:0o600,flag:'wx'});files.push({name:'recovery-bytes-inspection.json',bytes:encoded.length,sha256:sha(encoded)});
  for(const row of files){const bytes=readFileSync(join(host.directory,row.name));assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);}
  console.log('METADATA_RECOVERY_BYTES_NATIVE '+JSON.stringify({directory:host.directory,kind,files,nativeParticipants:7,metadataSources:3,payloads:3,bytesComplete:true,serverUploadStillPending:true,actualServerAdvanced:kind==='advanced',offlineNativeClientInspection:true,recordedServerDataOnly:true,inspectedFilesReadBackFromDisk:true}));scope.check();
 }finally{oldInventory?.dispose();oldServer?.dispose();inventory?.dispose();server?.dispose();}
}
