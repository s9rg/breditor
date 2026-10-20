/** Separate generation framing. Original selected-byte formats and nested budgets stay unchanged. */
import {defaultAssetLimits,type AssetLimits} from "@breditor/experimental-rich-content";
import {assetBytesDigest,assetBytesUtf8} from "../asset_bytes/format.js";
import {SharedAssetBytesError} from "../asset_bytes/guards.js";
import {checkRasterManifest,checkAssetPayload} from "../asset_bytes/raster_manifest.js";
import {generationIdentity,generationFields,freezeGeneration} from "../generation_source/identity.js";
import {MAX_GENERATION_SOURCE_BYTES,MAX_GENERATION_SOURCE_RECORDS,type SharedGenerationSourceRecordKind} from "../generation_source/contract.js";
import {generationRecordLimit} from "../generation_source/validate_records.js";
import type {SharedAssetBytePayload} from "../asset_bytes/types.js";
import type {SharedGenerationAssetMetadata} from "./types.js";
export const GENERATION_ASSET_MIME="application/vnd.breditor.generation-asset-backup";
export const GENERATION_ASSET_MAGIC=new TextEncoder().encode("BREDITOR-GENERATION-ASSETS1\n");
export const GENERATION_ASSET_PREFIX_BYTES=GENERATION_ASSET_MAGIC.length+4;
export const MAX_GENERATION_ASSET_HEADER_BYTES=64*1024*1024;
export const MAX_GENERATION_ASSET_BACKUP_BYTES=GENERATION_ASSET_PREFIX_BYTES+MAX_GENERATION_ASSET_HEADER_BYTES+MAX_GENERATION_SOURCE_BYTES+defaultAssetLimits.maxStoredBytes;
export interface GenerationAssetSourceEntry {kind:SharedGenerationSourceRecordKind;index:number;bytes:number;offset:number;sha256:string}
export interface GenerationAssetHeader {format:"breditor/shared-generation-asset-backup";formatVersion:1;metadata:SharedGenerationAssetMetadata;records:readonly GenerationAssetSourceEntry[];assets:readonly (SharedAssetBytePayload&{offset:number})[];sha256:string}
export const generationAssetBody=(metadata:SharedGenerationAssetMetadata,records:GenerationAssetHeader["records"],assets:GenerationAssetHeader["assets"])=>({format:"breditor/shared-generation-asset-backup" as const,formatVersion:1 as const,metadata,records,assets});
export {assetBytesDigest as generationAssetDigest,assetBytesUtf8 as generationAssetUtf8};
const invalid=()=>new SharedAssetBytesError("asset_bytes_format","Expected the closed generation-asset backup family");
const object=(v:unknown,keys:string):Record<string,unknown>=>{if(!generationFields(v,keys))throw invalid();return v;};
const integer=(v:unknown,min:number,max:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const sha=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
export function readGenerationAssetHeader(input:unknown,bodyBytes:number,limits:Readonly<AssetLimits>):GenerationAssetHeader{
 const h=object(input,"assets,format,formatVersion,metadata,records,sha256");if(h["format"]!=="breditor/shared-generation-asset-backup"||h["formatVersion"]!==1||!sha(h["sha256"]))throw invalid();
 const m=object(h["metadata"],"assetBytes,assets,bindings,document,format,formatVersion,identity,revision,sourceBytes"),identity=generationIdentity(m["identity"]);
 if(m["format"]!=="breditor/shared-generation-asset-bytes"||m["formatVersion"]!==1||m["document"]!==identity.native.room||typeof m["revision"]!=="string"||!/^(?:0|[1-9]\d{0,19})$/.test(m["revision"])||BigInt(m["revision"])>18446744073709551615n||!integer(m["sourceBytes"],1,MAX_GENERATION_SOURCE_BYTES)||!integer(m["assetBytes"],0,limits.maxStoredBytes))throw invalid();
 const manifest=checkRasterManifest(m["bindings"],m["assets"],m["assetBytes"],limits),metadata=freezeGeneration({format:"breditor/shared-generation-asset-bytes" as const,formatVersion:1 as const,identity,document:identity.native.room,revision:m["revision"],...manifest,sourceBytes:m["sourceBytes"],assetBytes:m["assetBytes"]});
 const raw=h["records"],payloads=h["assets"];if(!Array.isArray(raw)||raw.length<1||raw.length>MAX_GENERATION_SOURCE_RECORDS||!Array.isArray(payloads)||payloads.length!==metadata.assets.length)throw invalid();
 const records:GenerationAssetSourceEntry[]=[],assets:(SharedAssetBytePayload&{offset:number})[]=[];let offset=0;
 for(const value of raw){const r=object(value,"bytes,index,kind,offset,sha256"),kind=r["kind"];if(typeof kind!=="string"||!["document","review","local-version","relay","suggestions","revisions","versions"].includes(kind)||!integer(r["index"],0,31)||!integer(r["bytes"],1,generationRecordLimit(kind as SharedGenerationSourceRecordKind))||r["offset"]!==offset||!sha(r["sha256"]))throw invalid();records.push({kind:kind as SharedGenerationSourceRecordKind,index:r["index"],bytes:r["bytes"],offset,sha256:r["sha256"]});offset+=r["bytes"];}
 if(offset!==metadata.sourceBytes)throw invalid();for(let i=0;i<payloads.length;i++){const rawPayload=object(payloads[i],"bytes,contentAsset,height,mime,offset,width"),p=checkAssetPayload(rawPayload,limits,true);if(rawPayload["offset"]!==offset||JSON.stringify(p)!==JSON.stringify(metadata.assets[i]))throw invalid();assets.push({...p,offset});offset+=p.bytes;}
 if(offset!==bodyBytes)throw new SharedAssetBytesError("asset_bytes_integrity","Generation asset data must have exact contiguous framing");return {format:"breditor/shared-generation-asset-backup",formatVersion:1,metadata,records,assets,sha256:h["sha256"]};
}
