/** Separate canonical binary framing; original journals, generation archives and budgets stay closed. */
import {MAX_ASSET_BACKUP_BYTES,defaultAssetLimits,type AssetLimits} from '@breditor/experimental-rich-content';
import {assetBytesDigest,assetBytesUtf8} from '../asset_bytes/format.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {checkRasterManifest,checkAssetPayload} from '../asset_bytes/raster_manifest.js';
import {generationFields,freezeGeneration} from '../generation_source/identity.js';
import {MAX_INDEPENDENT_SOURCE_BYTES,MAX_INDEPENDENT_SOURCE_RECORDS,type SharedIndependentSourceRecord} from '../independent_source/contract.js';
import {independentRecordLimit} from '../independent_source/records.js';
import {independentParticipantIdentity,independentParticipantFailure as fail} from './policy.js';
import type {SharedIndependentParticipantMetadata} from './contract.js';
export const INDEPENDENT_PARTICIPANT_MIME='application/vnd.breditor.independent-participant-backup';
export const INDEPENDENT_PARTICIPANT_MAGIC=new TextEncoder().encode('BREDITOR-INDEPENDENT-PARTICIPANT1\n');
export const INDEPENDENT_PARTICIPANT_PREFIX_BYTES=INDEPENDENT_PARTICIPANT_MAGIC.length+4;
export const MAX_INDEPENDENT_PARTICIPANT_HEADER_BYTES=64*1024*1024;
export const MAX_INDEPENDENT_PARTICIPANT_BYTES=INDEPENDENT_PARTICIPANT_PREFIX_BYTES+MAX_INDEPENDENT_PARTICIPANT_HEADER_BYTES+MAX_INDEPENDENT_SOURCE_BYTES+defaultAssetLimits.maxStoredBytes+MAX_ASSET_BACKUP_BYTES;
export interface IndependentParticipantRecord {kind:SharedIndependentSourceRecord['kind'];index:number;bytes:number;offset:number;sha256:string}
export interface IndependentParticipantHeader {
 format:'breditor/shared-independent-participant-backup';formatVersion:1;metadata:SharedIndependentParticipantMetadata;
 records:readonly IndependentParticipantRecord[];assets:readonly (SharedIndependentParticipantMetadata['assets'][number]&{offset:number})[];
 uploads:{offset:number;bytes:number;sha256:string};sha256:string;
}
export const independentParticipantBody=(metadata:SharedIndependentParticipantMetadata,records:IndependentParticipantHeader['records'],assets:IndependentParticipantHeader['assets'],uploads:IndependentParticipantHeader['uploads'])=>({format:'breditor/shared-independent-participant-backup' as const,formatVersion:1 as const,metadata,records,assets,uploads});
export async function independentParticipantDigest(file:Blob,signal?:AbortSignal):Promise<string>{
 checkAssetBytesSignal(signal);if(!(file instanceof Blob)||file.size>MAX_INDEPENDENT_PARTICIPANT_BYTES)throw fail('independent_participant_budget');const bytes=new Uint8Array(await file.arrayBuffer());checkAssetBytesSignal(signal);const digest=await assetBytesDigest(bytes);checkAssetBytesSignal(signal);return digest;
}
export async function encodeIndependentParticipant(metadata:SharedIndependentParticipantMetadata,source:readonly SharedIndependentSourceRecord[],payloads:ReadonlyMap<string,Blob>,uploads:Blob,check:()=>void,signal?:AbortSignal):Promise<Blob>{
 const parts:BlobPart[]=[],records:IndependentParticipantRecord[]=[],assets:IndependentParticipantHeader['assets'][number][]=[];let offset=0;
 for(const row of source){check();const bytes=assetBytesUtf8(row.json,independentRecordLimit(row.kind,metadata.identity.source));records.push({kind:row.kind,index:row.index,bytes:bytes.length,offset,sha256:await independentParticipantDigest(new Blob([bytes]),signal)});check();parts.push(bytes);offset+=bytes.length;}
 if(offset!==metadata.sourceBytes)throw fail();for(const asset of metadata.assets){const blob=payloads.get(asset.contentAsset);if(!blob||blob.size!==asset.bytes||blob.type!==asset.mime)throw fail();assets.push({...asset,offset});parts.push(blob);offset+=blob.size;}
 const upload={offset,bytes:uploads.size,sha256:await independentParticipantDigest(uploads,signal)};check();const body=independentParticipantBody(metadata,records,assets,upload),sha256=await independentParticipantDigest(new Blob([JSON.stringify(body)]),signal);check();
 const header=assetBytesUtf8(JSON.stringify({...body,sha256}),MAX_INDEPENDENT_PARTICIPANT_HEADER_BYTES),prefix=new Uint8Array(INDEPENDENT_PARTICIPANT_PREFIX_BYTES);prefix.set(INDEPENDENT_PARTICIPANT_MAGIC);new DataView(prefix.buffer).setUint32(INDEPENDENT_PARTICIPANT_MAGIC.length,header.length);
 const file=new Blob([prefix,header,...parts,uploads],{type:INDEPENDENT_PARTICIPANT_MIME});if(file.size>MAX_INDEPENDENT_PARTICIPANT_BYTES)throw fail('independent_participant_budget');check();return file;
}
const object=(value:unknown,keys:string):Record<string,unknown>=>{if(!generationFields(value,keys))throw fail();return value;};
const integer=(value:unknown,min:number,max:number):value is number=>Number.isSafeInteger(value)&&Number(value)>=min&&Number(value)<=max;
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function readIndependentParticipantHeader(input:unknown,bodyBytes:number,limits:Readonly<AssetLimits>):IndependentParticipantHeader{
 const h=object(input,'assets,format,formatVersion,metadata,records,sha256,uploads');if(h['format']!=='breditor/shared-independent-participant-backup'||h['formatVersion']!==1||!sha(h['sha256']))throw fail();
 const m=object(h['metadata'],'assetBytes,assets,bindings,document,format,formatVersion,identity,revision,sourceBytes'),identity=independentParticipantIdentity(m['identity']);
 if(m['format']!=='breditor/shared-independent-participant-bytes'||m['formatVersion']!==1||m['document']!==identity.source.native.room||typeof m['revision']!=='string'||!/^(?:0|[1-9]\d{0,19})$/.test(m['revision'])||BigInt(m['revision'])>18446744073709551615n||!integer(m['sourceBytes'],1,MAX_INDEPENDENT_SOURCE_BYTES)||!integer(m['assetBytes'],0,limits.maxStoredBytes))throw fail();
 const manifest=checkRasterManifest(m['bindings'],m['assets'],m['assetBytes'],limits),metadata=freezeGeneration({format:'breditor/shared-independent-participant-bytes' as const,formatVersion:1 as const,identity,document:identity.source.native.room,revision:m['revision'],...manifest,sourceBytes:m['sourceBytes'],assetBytes:m['assetBytes']});
 if(!Array.isArray(h['records'])||h['records'].length<2||h['records'].length>MAX_INDEPENDENT_SOURCE_RECORDS||!Array.isArray(h['assets'])||h['assets'].length!==metadata.assets.length)throw fail();const records:IndependentParticipantRecord[]=[],assets:IndependentParticipantHeader['assets'][number][]=[];let offset=0;
 for(const [index,value]of h['records'].entries()){
  const row=object(value,'bytes,index,kind,offset,sha256'),kind=index===0?'document':index===1?'review':'version';if(row['kind']!==kind||row['index']!==(index<2?0:index-2)||!integer(row['bytes'],1,independentRecordLimit(kind,identity.source))||row['offset']!==offset||!sha(row['sha256']))throw fail();records.push({kind,index:index<2?0:index-2,bytes:row['bytes'],offset,sha256:row['sha256']});offset+=row['bytes'];
 }
 if(offset!==metadata.sourceBytes)throw fail();for(const [index,raw]of h['assets'].entries()){const row=object(raw,'bytes,contentAsset,height,mime,offset,width'),asset=checkAssetPayload(row,limits,true);if(row['offset']!==offset||JSON.stringify(asset)!==JSON.stringify(metadata.assets[index]))throw fail();assets.push({...asset,offset});offset+=asset.bytes;}
 const u=object(h['uploads'],'bytes,offset,sha256');if(u['offset']!==offset||!integer(u['bytes'],1,MAX_ASSET_BACKUP_BYTES)||!sha(u['sha256'])||offset+u['bytes']!==bodyBytes)throw fail('independent_participant_integrity');
 return{...independentParticipantBody(metadata,records,assets,{offset,bytes:u['bytes'],sha256:u['sha256']}),sha256:h['sha256']};
}
