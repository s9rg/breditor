/** Genuine owner API refusals. Rehashed frames are admitted by the original
 * archive reader first; the owner must reject the missing actual source facts. */
import assert from 'node:assert/strict';
import {MetadataPacketArchive,encodeMetadataPacketArchive} from '../../../packages/breditor-collaboration/dist/metadata_packet_retention/archive.js';
import * as wasm from '../../../packages/breditor-collaboration/dist/runtime/breditor_shared.js';
import {ServerPacketAssetArchive,encodeServerPacketAssets} from '../../../packages/breditor-collaboration/dist/server_packet_recovery/asset_archive.js';
import {prepareGenerationAssetRequest} from '../../../packages/breditor-collaboration/dist/generation_recovery_control/asset_requirements.js';
export async function checkCompleteInspectionRefusals({metadata,scope,unchanged,bundle,reader}){
 await assert.rejects(metadata.inspectServerPacketRecovery({...bundle,claimedOwner:true},reader));unchanged();
 await assert.rejects(metadata.inspectServerPacketRecovery(bundle,{...reader}));unchanged();
 await assert.rejects(metadata.inspectServerPacketRecovery({...bundle,packets:{...bundle.packets,requirements:{...bundle.packets.requirements,references:[]}}},reader));unchanged();
 const primary=bundle.packets.containment.reconciliation.assets.references,duplicate={...primary,references:{...primary.references,file:new Blob(['different nested file'],{type:primary.references.file.type})}};
 await assert.rejects(metadata.inspectServerPacketRecovery({...bundle,packets:{...bundle.packets,containment:{...bundle.packets.containment,reconciliation:{...bundle.packets.containment.reconciliation,assets:{...bundle.packets.containment.reconciliation.assets,references:duplicate}}}}},reader));unchanged();
 const options={wasm,signal:scope.signal,checkAuthority:unchanged},parent={bytes:bundle.packets.references.references.bytes,sha256:bundle.packets.references.references.sha256};let original,omitted;
 try{
  original=await MetadataPacketArchive.read(bundle.packets.packets,parent,options);const header=original.header();assert.ok(header.local.length>1);
  const files=await encodeMetadataPacketArchive({...header,local:header.local.slice(1)},original.files().chunks,options);omitted=await MetadataPacketArchive.read(files,parent,options);assert.equal(omitted.header().local.length,header.local.length-1,'The old byte/archive reader deliberately admits this self-consistent incomplete DATA');
  await assert.rejects(metadata.inspectServerPacketRecovery({...bundle,packets:{...bundle.packets,packets:files}},reader));unchanged();
 }finally{omitted?.dispose();original?.dispose();}
 await checkRasterOmission({metadata,bundle,reader,options,unchanged});
 await assert.rejects(metadata.inspectServerPacketRecovery({...bundle,packets:{...bundle.packets,containment:{...bundle.packets.containment,points:bundle.packets.containment.points.slice(1)}}},reader));unchanged();
 let nested,armed=true,calls=0;class ReentrantFile extends Blob{get type(){if(armed){armed=false;calls++;nested=metadata.inspectServerPacketRecovery(bundle,reader);void nested.catch(()=>{});}return super.type;}}
 const reentrant={...bundle,dependencies:{...bundle.dependencies,file:new ReentrantFile([bundle.dependencies.file],{type:bundle.dependencies.file.type})}},result=await metadata.inspectServerPacketRecovery(reentrant,reader);assert.equal(calls,1);await assert.rejects(nested,error=>error.code==='local_metadata_delivery_busy');assert.equal(result.rasters.kind,'retained');unchanged();
 return {closedEnvelope:true,genuineHostRequired:true,recomputedRequirements:true,duplicateFileHashChecked:true,rehashedOccurrenceOmissionRefused:true,recordedReceiptOmissionRefused:true,rehashedRasterScopeOmissionRefused:true,reentryExcluded:true};
}

/** Construct internally consistent incomplete DATA, never a live provider.
 * The old raster reader admits it. The genuine owner must independently derive
 * the omitted server-only packet image from the saved Native/packet closure. */
export async function incompletePacketRasterData(bundle,options){
 assert.equal(bundle.assets.kind,'retained');const parent={references:{bytes:bundle.packets.references.references.bytes,sha256:bundle.packets.references.references.sha256},packets:{bytes:bundle.packets.packets.manifest.bytes,sha256:bundle.packets.packets.manifest.sha256},dependencies:{bytes:bundle.dependencies.bytes,sha256:bundle.dependencies.sha256}};let original,omitted;
 try{
  original=await ServerPacketAssetArchive.read(bundle.assets.files,parent,options);const header=original.header(),local=new Set(header.local.map(row=>row.asset)),removed=header.payloads.filter(row=>!local.has(row.asset));assert.equal(removed.length,1);const asset=removed[0].asset,key=ref=>JSON.stringify([ref.asset,ref.generation]),hidden=new Set(header.provider.resolutions.filter(row=>row.contentAsset===asset).map(row=>key(row.reference)));
  const requirements={references:header.requirements.references.filter(row=>row.asset!==asset&&!hidden.has(key(row))),uploads:header.requirements.uploads};assert.ok(requirements.references.length<header.requirements.references.length);
  const request=await prepareGenerationAssetRequest(header.control,requirements),resolutions=header.provider.resolutions.filter(row=>row.contentAsset!==asset),provider={...header.provider,requestSha256:request.sha256,resolutions,assets:header.provider.assets.filter(row=>row.asset!==asset),missing:header.provider.missing.filter(row=>row.kind==='uploadBytes'||!hidden.has(key(row.reference))&&row.reference.asset!==asset)};
  const payloads=header.payloads.filter(row=>row.asset!==asset).map(({offset:_,...info})=>({info,blob:original.payload(info.asset)})),{payloads:_,chunks:__,...base}=header,files=await encodeServerPacketAssets({...base,requirements:request.requirements,provider},payloads,options);
  omitted=await ServerPacketAssetArchive.read(files,parent,options);assert.equal(omitted.header().payloads.length,3,'The byte reader deliberately admits the internally consistent incomplete raster DATA');
  return files;
 }finally{omitted?.dispose();original?.dispose();}
}

async function checkRasterOmission({metadata,bundle,reader,options,unchanged}){
 const files=await incompletePacketRasterData(bundle,options);unchanged();
 await assert.rejects(metadata.inspectServerPacketRecovery({...bundle,assets:{kind:'retained',files}},reader));unchanged();
}
