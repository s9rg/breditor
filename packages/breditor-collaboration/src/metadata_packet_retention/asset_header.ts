/** Recorded provider/local consistency only. Actual source upload inventories
 * and Native requirements must be recomputed by metadata-owner inspection. */
import {checkRichAssetLimits,type AssetLimits} from '@breditor/experimental-rich-content';
import {fields,integer,rows,hash} from '../physical_room_record_cut/policy.js';
import {generationControlSelection} from '../generation_recovery_control/identity.js';
import {generationAssetContent,prepareGenerationAssetRequest} from '../generation_recovery_control/asset_requirements.js';
import {readGenerationAssetReceipt} from '../generation_recovery_control/asset_response.js';
import {localMetadataRecoverableRequirements} from '../selected_local_metadata_assets/recoverable_requirements.js';
import type {LocalMetadataRasterInfo} from '../selected_local_metadata_assets/materialization_contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {MAX_METADATA_PACKET_CHUNK_BYTES,type MetadataPacketAssetHeader} from './contract.js';
import {fail,same} from './policy.js';
export async function metadataPacketAssetHeader(input:unknown,providedLimits:Partial<AssetLimits>,check:()=>void):Promise<MetadataPacketAssetHeader>{
 const limits=checkRichAssetLimits(providedLimits),r=fields(input,['format','formatVersion','scope','parent','control','requirements','local','provider','payloads','chunks']);
 if(r['format']!=='breditor/original-metadata-packet-assets'||r['formatVersion']!==1||r['scope']!=='complete-base-packet-and-whole-upload-raster-union')throw fail();
 const parent=fields(r['parent'],['references','packets']);const selection=(input:unknown)=>{const p=fields(input,['bytes','sha256']);return{bytes:integer(p['bytes'],1024*1024*1024,1),sha256:hash(p['sha256'])};};
 const info=(input:unknown):LocalMetadataRasterInfo=>{const p=fields(input,['asset','mime','bytes','width','height']),asset=generationAssetContent(p['asset']),mime=p['mime'],bytes=integer(p['bytes'],limits.maxFileBytes,1),width=integer(p['width'],limits.maxDimension,1),height=integer(p['height'],limits.maxDimension,1);if(!['image/png','image/jpeg','image/webp'].includes(mime as string)||width*height>limits.maxPixels)throw fail();return{asset,mime:mime as LocalMetadataRasterInfo['mime'],bytes,width,height};};
 let last='';const local=rows(r['local'],100000).map(value=>{const row=info(value);if(row.asset<=last)throw fail();last=row.asset;return row;}),control=generationControlSelection(r['control']);
 const request=await prepareGenerationAssetRequest(control,r['requirements'] as MetadataPacketAssetHeader['requirements']);check();if(!same(request.requirements,r['requirements'])||!same(request.requirements.uploads,local.map(row=>row.asset)))throw fail();
 const provider=readGenerationAssetReceipt(JSON.stringify(r['provider']),control,request.sha256,request.requirements),union=localMetadataRecoverableRequirements(request.requirements.references,new Map(local.map(row=>[row.asset,row])),provider);
 if(union.unresolved.length||union.unavailable.length)throw fail();let offset=0;
 const payloads=rows(r['payloads'],100000).map(value=>{const p=fields(value,['asset','mime','bytes','width','height','offset']),row=info({asset:p['asset'],mime:p['mime'],bytes:p['bytes'],width:p['width'],height:p['height']});if(integer(p['offset'],limits.maxStoredBytes)!==offset)throw fail();const result={...row,offset};offset+=row.bytes;if(offset>limits.maxStoredBytes)throw fail('metadata_packet_retention_budget');return result;});
 if(!same(payloads.map(({offset:_,...row})=>row),union.payloads))throw fail();
 const chunks=rows(r['chunks'],Math.ceil(limits.maxStoredBytes/MAX_METADATA_PACKET_CHUNK_BYTES)).map((raw,index,all)=>{const p=fields(raw,['bytes','sha256']),bytes=integer(p['bytes'],MAX_METADATA_PACKET_CHUNK_BYTES,1);if(index<all.length-1&&bytes!==MAX_METADATA_PACKET_CHUNK_BYTES)throw fail();return{bytes,sha256:hash(p['sha256'])};});
 if(chunks.reduce((n,row)=>n+row.bytes,0)!==offset)throw fail();check();
 return frozen({format:'breditor/original-metadata-packet-assets',formatVersion:1,scope:'complete-base-packet-and-whole-upload-raster-union',parent:{references:selection(parent['references']),packets:selection(parent['packets'])},control,requirements:request.requirements,local,provider,payloads,chunks});
}
