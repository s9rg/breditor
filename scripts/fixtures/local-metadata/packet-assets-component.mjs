
/** Bounded asset storage on real original provider and Native packet facts.
 * Small reference envelopes are component DATA, never operational owners. */
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {dirname,join} from 'node:path';import {createHash} from 'node:crypto';
import {SharedRelayAssets} from '../../../packages/breditor-collaboration/dist/relay/assets.js';
import {SharedServerLogGenerationParticipantInventory as Inventory} from '../../../packages/breditor-collaboration/dist/server_generation_inventory/read.js';
import {prepareLocalMetadataReconciliationInput} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/reconciliation_input.js';
import {MetadataPacketAssetArchive} from '../../../packages/breditor-collaboration/dist/metadata_packet_retention/asset_archive.js';
import {captureMetadataPacketAssets} from '../../../packages/breditor-collaboration/dist/metadata_packet_retention/capture_assets.js';
import {PacketRasterFixtureImage,packetPixel} from './packet-raster.mjs';
import {countPacketReads} from './count-packet-reads.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function testPacketAssetComponents({host,selected,wrapper,core,files,parent,requirements,wasm,signal,integrity}){
 let inventory,transport,archive;const descriptor=Object.getOwnPropertyDescriptor(globalThis,'Image'),oldFetch=globalThis.fetch,cases=[];let cacheCalls=0,downloads=0,missing=false;
 Object.defineProperty(globalThis,'Image',{configurable:true,value:PacketRasterFixtureImage});
 try{
  inventory=await Inventory.read(new Blob([readFileSync(join(dirname(selected.path),'inventory.json'))]),selected.selection.source.participants);
  const input=prepareLocalMetadataReconciliationInput({host:wrapper,inventory}),fixture=host.fixture(host.initial),client=fixture.clients.find(row=>row.principal==='alice'&&!row.observer),auth=await host.authentication(client),asset='sha256:'+sha(packetPixel);
  const info=bytes=>({asset:'sha256:'+sha(bytes),mime:'image/png',bytes:bytes.length,width:1,height:1}),local=[readFileSync(join(host.directory,'seed-a.png')),readFileSync(join(host.directory,'seed-b.png'))].map(info),uploads={assets:new Map(local.map(row=>[row.asset,row])),payloads:new Map(local.map((row,i)=>[row.asset,new Blob([readFileSync(join(host.directory,i?'seed-b.png':'seed-a.png'))],{type:'image/png'})]))};
  const cache={async resolve(){cacheCalls++;throw Error('No held cache read');},async cacheRemote(){cacheCalls++;throw Error('No held cache write');}};
  transport=new SharedRelayAssets({endpoint:host.initial.clientEndpoint,principal:client.principal,getToken:auth.getToken,store:cache});
  globalThis.fetch=async(url,options)=>{const response=await oldFetch(url,options);if(String(url).includes('/assets/'+encodeURIComponent(asset))&&(!options?.method||options.method==='GET')){downloads++;if(missing){await response.body?.cancel();return new Response(null,{status:404});}}return response;};
  const packet={references:{references:parent},packets:files,requirements},nativeBase=core.retainedAssetReferences(),base={outcome:{kind:'ready',references:nativeBase.references}},options={wasm,signal,checkAuthority(){}};
  assert.equal(base.outcome.kind,'ready');assert.ok(requirements.references.some(row=>row.asset===asset&&row.generation==='remote-packet-only-intermediate-g'));
  let result=await captureMetadataPacketAssets(packet,base,uploads,input,transport,options,{},()=>input.check());assert.equal(result.kind,'retained');assert.ok(downloads>0);assert.equal(cacheCalls,0);
  const parentPins={references:parent,packets:{bytes:files.manifest.bytes,sha256:files.manifest.sha256}};
  const opened=await countPacketReads(result.files.manifest.file,()=>MetadataPacketAssetArchive.read(result.files,parentPins,options));
  archive=opened.value;assert.equal(opened.reads,1,"Decode the local raster manifest from its verified bytes");const header=archive.header();assert.ok(header.payloads.some(row=>row.asset===asset));assert.deepEqual(Buffer.from(await archive.payload(asset).arrayBuffer()),packetPixel);assert.ok(header.local.every(row=>row.asset!==asset));cases.push('actual-provider-and-Native-intermediate-only-image-is-retained-without-cache-or-ACK');
  archive.dispose();assert.throws(()=>archive.payload(asset),error=>error.code==='metadata_packet_retention_closed');cases.push('disposed-asset-reader-releases-retained-state');
  const corrupt=Buffer.from(await result.files.chunks[0].file.arrayBuffer());corrupt[0]^=1;await assert.rejects(MetadataPacketAssetArchive.read({...result.files,chunks:[{...result.files.chunks[0],file:new Blob([corrupt])},...result.files.chunks.slice(1)]},parentPins,options));cases.push('corrupt-raster-chunk-refuses');
  const omitted=JSON.parse(await result.files.manifest.file.text());omitted.payloads=omitted.payloads.filter(row=>row.asset!==asset);const replacement=new Blob([JSON.stringify(omitted)]);await assert.rejects(MetadataPacketAssetArchive.read({...result.files,manifest:{file:replacement,bytes:replacement.size,sha256:await integrity.digest(replacement)}},parentPins,options));cases.push('rehashed-missing-packet-only-raster-refuses');
  missing=true;result=await captureMetadataPacketAssets(packet,base,uploads,input,transport,options,{},()=>input.check());missing=false;assert.equal(result.kind,'pending');assert.deepEqual(result.missing,[{kind:'bytes',asset}]);assert.equal(cacheCalls,0);cases.push('authenticated-download-loss-is-Pending-without-ACK-or-cache-mutation');
  console.log('PACKET_ASSETS_COMPONENT_NATIVE '+JSON.stringify({cases,payloads:header.payloads.length,asset,actualNativeRequirements:true,actualProvider:true,downloads,cacheCalls}));
 }finally{globalThis.fetch=oldFetch;archive?.dispose();transport?.dispose();inventory?.dispose();if(descriptor)Object.defineProperty(globalThis,'Image',descriptor);else delete globalThis.Image;}
}
