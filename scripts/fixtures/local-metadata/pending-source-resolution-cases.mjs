/** Substantive owner refusals on valid, rehashed DATA. None supplies an owner,
 * ACK or packet-source authority; the actual Native/server replay must decide. */
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {ServerPacketAssetArchive,encodeServerPacketAssets} from '../../../packages/breditor-collaboration/dist/server_packet_recovery/asset_archive.js';
import {prepareGenerationAssetRequest} from '../../../packages/breditor-collaboration/dist/generation_recovery_control/asset_requirements.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function checkResolvedSourceRefusals({metadata,bundle,reader,wrongReader,options,unchanged}){
 const refuse=async value=>{await assert.rejects(metadata.inspectResolvedServerPacketRecovery(value,reader));unchanged();};
 await refuse({...bundle,claimedOwner:true});await assert.rejects(metadata.inspectResolvedServerPacketRecovery(bundle,{...reader}));unchanged();
 const resolution=JSON.parse(await bundle.resolution.file.text());assert.ok(resolution.covered.length>0);
 async function edited(value){const file=new Blob([JSON.stringify(value)],{type:bundle.resolution.file.type});return{...bundle,resolution:{file,bytes:file.size,sha256:sha(Buffer.from(await file.arrayBuffer()))}};}
 await refuse(await edited({...resolution,covered:resolution.covered.slice(1)}));
 assert.equal(resolution.outcome.kind,'ready');assert.ok(resolution.outcome.references.length>1);await refuse(await edited({...resolution,outcome:{kind:'ready',references:resolution.outcome.references.slice(1)}}));
 await refuse({...bundle,resolution:{...bundle.resolution,file:new Blob(['different resolution bytes'],{type:bundle.resolution.file.type})}});
 let archive,omitted;
 const original=bundle.original,parent={references:{bytes:original.packets.references.references.bytes,sha256:original.packets.references.references.sha256},packets:{bytes:original.packets.packets.manifest.bytes,sha256:original.packets.packets.manifest.sha256},dependencies:{bytes:original.dependencies.bytes,sha256:original.dependencies.sha256}};
 try{
  archive=await ServerPacketAssetArchive.read(bundle.assets.files,parent,options);const h=archive.header(),asset=h.payloads[0].asset,key=ref=>JSON.stringify([ref.asset,ref.generation]),hidden=new Set(h.provider.resolutions.filter(row=>row.contentAsset===asset).map(row=>key(row.reference))),requirements={references:h.requirements.references.filter(row=>row.asset!==asset&&!hidden.has(key(row))),uploads:h.requirements.uploads.filter(id=>id!==asset)},request=await prepareGenerationAssetRequest(h.control,requirements),provider={...h.provider,requestSha256:request.sha256,resolutions:h.provider.resolutions.filter(row=>row.contentAsset!==asset),assets:h.provider.assets.filter(row=>row.asset!==asset),missing:h.provider.missing.filter(row=>row.kind==='uploadBytes'?row.asset!==asset:row.reference.asset!==asset&&!hidden.has(key(row.reference)))},payloads=h.payloads.filter(row=>row.asset!==asset).map(({offset:_,...info})=>({info,blob:archive.payload(info.asset)})),{payloads:_,chunks:__,...base}=h;
  const files=await encodeServerPacketAssets({...base,requirements:request.requirements,local:h.local.filter(row=>row.asset!==asset),provider},payloads,options);omitted=await ServerPacketAssetArchive.read(files,parent,options);assert.equal(omitted.header().payloads.length,h.payloads.length-1);await refuse({...bundle,assets:{kind:'retained',files}});
 }finally{omitted?.dispose();archive?.dispose();}
 await assert.rejects(metadata.inspectResolvedServerPacketRecovery(bundle,wrongReader));unchanged();
 let nested,armed=true,calls=0;class ReentrantFile extends Blob{get type(){if(armed){armed=false;calls++;nested=metadata.inspectResolvedServerPacketRecovery(bundle,reader);void nested.catch(()=>{});}return super.type;}}
 const reentrant={...bundle,resolution:{...bundle.resolution,file:new ReentrantFile([bundle.resolution.file],{type:bundle.resolution.file.type})}},result=await metadata.inspectResolvedServerPacketRecovery(reentrant,reader);assert.equal(result.rasters.kind,'retained');assert.equal(calls,1);await assert.rejects(nested,error=>error.code==='local_metadata_delivery_busy');unchanged();
 return{closedEnvelope:true,genuineHostRequired:true,rehashedCoveredOccurrenceOmissionRefused:true,rehashedReferenceOmissionRefused:true,resolutionFileHashChecked:true,rehashedRasterOmissionRefused:true,olderGenuineServerRefused:true,reentryExcluded:true};
}
