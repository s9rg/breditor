/** Closed byte framing and raster admission only. No decoded header supplies
 * Native provenance or a current host grant. Metadata-owner inspection is a
 * separate action; this class exposes immutable content-addressed bytes only. */
import {checkRichAssetLimits,inspectRichRaster,type AssetLimits} from '@breditor/experimental-rich-content';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {recordCutBytes} from '../physical_room_record_cut/framing.js';
import {fields,hash,integer,rows} from '../physical_room_record_cut/policy.js';
import {metadataData,metadataJson,equal} from '../selected_local_metadata_delivery/data.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {generationAssetContent} from '../generation_recovery_control/asset_requirements.js';
import type {LocalMetadataRasterHeader,LocalMetadataRasterInfo} from './materialization_contract.js';
import type {LocalMetadataRecoverableRasterHeader} from './recoverable_contract.js';
import {fail} from './error.js';
type FrameHeader=LocalMetadataRasterHeader|LocalMetadataRecoverableRasterHeader;
const scopes={1:'client-metadata-cut-and-recorded-provider-rasters',2:'complete-client-cut-and-local-provider-raster-union'} as const;
const prefixBytes=new TextEncoder().encode('BREDITOR_METADATA_RASTERS_V1\n').length+4,maximum=1024*1024*1024,headerMaximum=16*1024*1024;
function frameMagic(version:1|2){if(version!==1&&version!==2)throw fail('local_metadata_assets_state');return new TextEncoder().encode(version===1?'BREDITOR_METADATA_RASTERS_V1\n':'BREDITOR_METADATA_RASTERS_V2\n');}
const slice=Blob.prototype.slice;
function header(input:unknown,limits:Readonly<AssetLimits>,bodyBytes:number,version:1|2):FrameHeader{
 const r=fields(input,['format','formatVersion','scope','references','availability','payloads']);
 if(r['format']!=='breditor/local-metadata-materialized-rasters'||r['formatVersion']!==version||r['scope']!==scopes[version])throw fail('local_metadata_assets_state');
 const ref=fields(r['references'],['bytes','sha256']);let offset=0,previous='';
 const payloads=rows(r['payloads'],100000).map(value=>{const p=fields(value,['asset','mime','bytes','width','height','offset']),asset=generationAssetContent(p['asset']),mime=p['mime'];if(asset<=previous||!['image/png','image/jpeg','image/webp'].includes(mime as string))throw fail('local_metadata_assets_state');previous=asset;
  const bytes=integer(p['bytes'],limits.maxFileBytes,1),width=integer(p['width'],limits.maxDimension,1),height=integer(p['height'],limits.maxDimension,1);if(width*height>limits.maxPixels||integer(p['offset'],limits.maxStoredBytes)!==offset)throw fail('local_metadata_assets_state');offset+=bytes;if(offset>limits.maxStoredBytes)throw fail('local_metadata_assets_raster_budget');return{asset,mime:mime as LocalMetadataRasterInfo['mime'],bytes,width,height,offset:offset-bytes};});
 if(offset!==bodyBytes)throw fail('local_metadata_assets_state');
 return frozen({format:'breditor/local-metadata-materialized-rasters',formatVersion:version,scope:scopes[version],references:{bytes:integer(ref['bytes'],maximum,1),sha256:hash(ref['sha256'])},availability:metadataData(r['availability']),payloads}) as FrameHeader;
}
export async function readLocalMetadataRasterFrame(input:Blob,expected:Readonly<{bytes:number;sha256:string}>,options:SharedArchiveIntegrityOptions,providedLimits:Partial<AssetLimits>,version:1|2):Promise<{header:FrameHeader;file:Blob;payloads:Map<string,Blob>}>{
  const magic=frameMagic(version);
  const chosen=fields(expected,['bytes','sha256']),bytes=integer(chosen['bytes'],maximum,1),digest=hash(chosen['sha256']),file=archiveBlob(input,maximum),limits=checkRichAssetLimits(providedLimits),integrity=prepareArchiveIntegrity(options);integrity.guard();
  if(file.size!==bytes||file.size<prefixBytes||await integrity.digest(file)!==digest)throw fail('local_metadata_assets_state');integrity.guard();
  const prefix=await integrity.read(file,0,prefixBytes);if(magic.some((value,index)=>value!==prefix[index]))throw fail('local_metadata_assets_state');
  const length=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength).getUint32(magic.length,true),start=prefixBytes+length;
  if(length<2||length>headerMaximum||start>file.size)throw fail('local_metadata_assets_raster_budget');
  const encoded=await recordCutBytes(file,prefixBytes,length,integrity);integrity.guard();let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(encoded);}catch{throw fail('local_metadata_assets_state');}
  const selected=header(JSON.parse(text),limits,file.size-start,version);if(metadataJson(selected)!==text)throw fail('local_metadata_assets_state');
  const payloads=new Map<string,Blob>();for(const entry of selected.payloads){integrity.guard();const raster=await inspectRichRaster(slice.call(file,start+entry.offset,start+entry.offset+entry.bytes,entry.mime),{limits,...(options.signal?{signal:options.signal}:{})});integrity.guard();if(raster.asset!==entry.asset||raster.mime!==entry.mime||raster.bytes!==entry.bytes||raster.width!==entry.width||raster.height!==entry.height)throw fail('local_metadata_assets_state');payloads.set(entry.asset,raster.blob);}
  integrity.guard();return{header:selected,file,payloads};
 }
/** Encode bytes, then run the same full reader before returning a selection.
 * This helper cannot fabricate a Native source or any provider capability. */
export async function encodeLocalMetadataRasterFrame(version:1|2,references:Readonly<{bytes:number;sha256:string}>,availability:unknown,payloads:readonly Readonly<{info:LocalMetadataRasterInfo;blob:Blob}>[],options:SharedArchiveIntegrityOptions,providedLimits:Partial<AssetLimits>={}){
 const magic=frameMagic(version),limits=checkRichAssetLimits(providedLimits),integrity=prepareArchiveIntegrity(options);integrity.guard();let offset=0;
 const selected=header({format:'breditor/local-metadata-materialized-rasters',formatVersion:version,scope:scopes[version],references,availability,payloads:payloads.map(({info})=>{const row={...info,offset};offset+=info.bytes;return row;})},limits,payloads.reduce((n,row)=>n+row.info.bytes,0),version);
 const text=metadataJson(selected),encoded=new TextEncoder().encode(text);if(encoded.length>headerMaximum)throw fail('local_metadata_assets_raster_budget');const prefix=new Uint8Array(prefixBytes);prefix.set(magic);new DataView(prefix.buffer).setUint32(magic.length,encoded.length,true);
 const file=new Blob([prefix,encoded,...payloads.map(row=>archiveBlob(row.blob,limits.maxFileBytes))],{type:'application/vnd.breditor.metadata-rasters'});if(file.size>maximum)throw fail('local_metadata_assets_raster_budget');
 const selection=Object.freeze({file,bytes:file.size,sha256:await integrity.digest(file)});integrity.guard();const admitted=await readLocalMetadataRasterFrame(file,{bytes:selection.bytes,sha256:selection.sha256},options,limits,version);try{if(!equal(admitted.header,selected))throw fail('local_metadata_assets_state');}finally{admitted.payloads.clear();}return selection;
}
