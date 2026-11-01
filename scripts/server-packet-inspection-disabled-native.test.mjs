/** A real older native profile has enabled versions and disabled suggestion
 * lanes. Disabled DATA must match the genuine server's configured state. */
import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,symlinkSync,readFileSync} from 'node:fs';import {join,resolve} from 'node:path';
import {selectedDeliveryNativeHost} from './fixtures/selected-delivery/native-host.mjs';
import {SharedServerLogGenerationRecoveryHost as Host} from '../packages/breditor-collaboration/dist/generation_recovery_control/host.js';
import {captureSelectedServerMetadata} from '../packages/breditor-collaboration/dist/server_metadata_read/collect.js';
import {prepareMetadataRequest} from '../packages/breditor-collaboration/dist/server_metadata_read/request.js';
import {MetadataPacketArchive,encodeMetadataPacketArchive} from '../packages/breditor-collaboration/dist/metadata_packet_retention/archive.js';
import {inspectOriginalServerPacketCatalog} from '../packages/breditor-collaboration/dist/server_packet_recovery/inspect_server_packets.js';
import {prepareArchiveIntegrity} from '../packages/breditor-collaboration/dist/archive_integrity/context.js';
import * as wasm from '../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
const root=resolve(new URL('../',import.meta.url).pathname);
await wasm.default({module_or_path:readFileSync(new URL('../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm',import.meta.url))});
test('actual version-only Native reconstruction admits disabled features and refuses a checksum-valid catalog hiding an enabled lane',{timeout:180000},async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=(url,options={})=>{const headers=new Headers(options.headers);headers.set('Origin','http://127.0.0.1:4187');return originalFetch(url,{...options,headers});};let fixture,reader,replayed,archive,omitted;
 try{
  const directory=mkdtempSync(join(root,'target/disabled-packet-inspection-fixture-')),examples=join(directory,'target/owned-history-relay-native/release/examples');mkdirSync(examples,{recursive:true});
  symlinkSync(join(root,'target/server-packet-inspection-native/release/examples/selected_suggestion_delivery_functional'),join(examples,'selected_delivery_functional'));
  fixture=await selectedDeliveryNativeHost(directory,{language:2,standard:true,atomic:false});const selected=fixture.initial;
  const open=item=>Host.open({endpoint:item.endpoint,expected:item.selection,principal:'operator',getToken:()=>fixture.operatorToken(item),checkAuthority(){}});reader=await open(selected);
  const query={versions:{kind:'start'},suggestions:{kind:'disabled'},revisions:{kind:'disabled'}},catalog=await captureSelectedServerMetadata(reader,query);assert.equal(catalog.pages[0].metadata.versions.kind,'page');assert.equal(catalog.pages[0].metadata.suggestions.kind,'disabled');assert.equal(catalog.pages[0].metadata.revisions.kind,'disabled');
  const actual=await fixture.reconstruct(selected);replayed=await open(actual);const options={wasm,checkAuthority(){}},parent={bytes:2,sha256:await prepareArchiveIntegrity(options).digest(new Blob(['{}']))};
  const header={format:'breditor/original-metadata-packet-retention',formatVersion:1,scope:'exact-first-server-and-original-local-metadata-packet-strings',parent,catalog,bodies:[],server:[],local:[],chunks:[]},files=await encodeMetadataPacketArchive(header,[],options);archive=await MetadataPacketArchive.read(files,parent,options);
  assert.deepEqual(await inspectOriginalServerPacketCatalog(archive,replayed,undefined,()=>{}),{pages:1,serverBodies:0});
  const disabled={versions:{kind:'disabled'},suggestions:{kind:'disabled'},revisions:{kind:'disabled'}},request=await prepareMetadataRequest('server-log-generation-recovery',catalog.selection,disabled),page={...catalog.pages[0],requestSha256:request.sha256,metadata:disabled},hidden={...catalog,pages:[page],terminal:{versions:null,suggestions:null,revisions:null}},bad=await encodeMetadataPacketArchive({...header,catalog:hidden},[],options);omitted=await MetadataPacketArchive.read(bad,parent,options);
  await assert.rejects(inspectOriginalServerPacketCatalog(omitted,replayed,undefined,()=>{}));await replayed.check();
 }finally{omitted?.dispose();archive?.dispose();reader?.close();replayed?.close();globalThis.fetch=originalFetch;await fixture?.stop();}
});
