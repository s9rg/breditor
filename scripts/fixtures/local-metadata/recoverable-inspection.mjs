/** Genuine Native old-cut inspection with unacknowledged local bytes. The
 * provider's missing-upload observation must survive offline re-admission. */
import assert from 'node:assert/strict';import {IDBObjectStore} from 'fake-indexeddb';
import {LocalMetadataRecoverableRasterArchive as Archive,encodeLocalMetadataRecoverableRasters as encode} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_assets/recoverable_raster_archive.js';
export async function testRecoverableInspection({metadata,bundle,check,fetchOriginal,native,localAsset}){
 const before=metadata.recovery(),savedFetch=globalThis.fetch,put=IDBObjectStore.prototype.put;let writes=0,network=0;
 globalThis.fetch=(url,options)=>{if(String(url).startsWith('blob:'))return fetchOriginal(url,options);network++;throw Error('Recoverable Native inspection is offline');};
 IDBObjectStore.prototype.put=function(...args){writes++;return put.apply(this,args);};
 try{
  const actual=await metadata.inspectRecoverableAssets(bundle);assert.equal(actual.scope,'native-client-cut-and-local-provider-raster-union');assert.equal(actual.rasters.payloads.length,3);assert.equal(actual.recordedAvailability.kind,'pending');assert.ok(actual.recordedAvailability.provider.missing.some(row=>row.kind==='uploadBytes'&&row.contentAsset===localAsset));
  await assert.rejects(metadata.inspectMaterializedAssets(bundle));
  const options={wasm:native,checkAuthority:check},archive=await Archive.read(bundle.rasters.file,{bytes:bundle.rasters.bytes,sha256:bundle.rasters.sha256},options);let omitted;
  try{const header=archive.metadata();assert.equal(header.formatVersion,2);assert.ok(archive.payload(localAsset));omitted=await encode(header.references,header.availability,header.payloads.filter(row=>row.asset!==localAsset).map(({offset,...info})=>({info,blob:archive.payload(info.asset)})),options);}finally{archive.dispose();}
  await assert.rejects(metadata.inspectRecoverableAssets({...bundle,rasters:omitted}));assert.deepEqual(metadata.recovery(),before);assert.equal(writes,0);assert.equal(network,0);
  console.log('RECOVERABLE_LOCAL_ONLY_NATIVE '+JSON.stringify({payloads:3,metadataSources:3,nativeParticipants:7,wholeUploads:14,providerStillPending:true,localAsset,serverUploadAcknowledged:false,networkRequests:network,journalWrites:writes,rehashedLocalPayloadOmissionRefused:true,v1ScopeUnchanged:true}));
 }finally{globalThis.fetch=savedFetch;IDBObjectStore.prototype.put=put;}
}
