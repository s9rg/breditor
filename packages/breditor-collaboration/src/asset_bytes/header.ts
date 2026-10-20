/** Closed, bounded declarations. Only later native re-admission can prove the claimed source closure. */
import type {AssetLimits} from "@breditor/experimental-rich-content";
import {MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES} from "../asset_references_capture.js";
import {SharedAssetBytesError} from "./guards.js";
import type {SharedAssetBytesMetadata} from "./types.js";
import type {AssetBytesHeader,AssetBytesSourceEntry,AssetBytesPayloadEntry} from "./format.js";
import {checkAssetPayload,checkRasterManifest} from "./raster_manifest.js";
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const fields=(v:Record<string,unknown>,names:string)=>{const keys=names.split(",");return Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));};
const identity=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const digest=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const integer=(v:unknown,min:number,max:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const invalid=()=>new SharedAssetBytesError("asset_bytes_format","Expected closed canonical selected-source asset backup declarations");
const kinds=["document","paired-session","version-catalog","suggestions","suggestion-revisions"] as const;
export function checkAssetBytesHeader(input:unknown,bodyBytes:number,limits:Readonly<AssetLimits>):AssetBytesHeader {
 if(!object(input)||!fields(input,"format,formatVersion,metadata,records,assets,sha256")||input["format"]!=="breditor/shared-selected-asset-backup"||input["formatVersion"]!==1||!digest(input["sha256"])||!object(input["metadata"]))throw invalid();
 const m=input["metadata"];
 if(!fields(m,"format,formatVersion,document,revision,scope,bindings,assets,sourceBytes,assetBytes")||m["format"]!=="breditor/shared-selected-asset-bytes"||m["formatVersion"]!==1||!identity(m["document"])||typeof m["revision"]!=="string"||!/^(?:0|[1-9][0-9]{0,19})$/.test(m["revision"])||BigInt(m["revision"])>18446744073709551615n||m["scope"]!=="native-and-selected-retained-packets"||!integer(m["sourceBytes"],1,MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES)||!integer(m["assetBytes"],0,limits.maxStoredBytes)||!Array.isArray(m["bindings"])||m["bindings"].length>100000||!Array.isArray(m["assets"])||m["assets"].length>m["bindings"].length)throw invalid();
 const {bindings,assets}=checkRasterManifest(m["bindings"],m["assets"],m["assetBytes"],limits);
 const metadata:SharedAssetBytesMetadata=Object.freeze({format:"breditor/shared-selected-asset-bytes",formatVersion:1,document:m["document"],revision:m["revision"],scope:m["scope"],bindings:Object.freeze(bindings),assets:Object.freeze(assets),sourceBytes:m["sourceBytes"],assetBytes:m["assetBytes"]});
 if(!Array.isArray(input["records"])||input["records"].length<1||input["records"].length>kinds.length||!Array.isArray(input["assets"])||input["assets"].length!==assets.length)throw invalid();
 const records:AssetBytesSourceEntry[]=[],entries:AssetBytesPayloadEntry[]=[];let offset=0,ordinal=-1;
 for(const raw of input["records"]){if(!object(raw)||!fields(raw,"kind,bytes,offset,sha256")||typeof raw["kind"]!=="string"||!digest(raw["sha256"]))throw invalid();const index=kinds.findIndex(kind=>kind===raw["kind"]);if(index<0||index<=ordinal||records.length===0&&index!==0||!integer(raw["bytes"],1,index===0?16*1024*1024:32*1024*1024)||raw["offset"]!==offset)throw invalid();ordinal=index;records.push({kind:kinds[index]!,bytes:raw["bytes"],offset,sha256:raw["sha256"]});offset+=raw["bytes"];}
 if(offset!==metadata.sourceBytes)throw invalid();
 for(let i=0;i<assets.length;i++){const raw=input["assets"][i],actual=checkAssetPayload(raw,limits,true),expected=assets[i]!;if(!object(raw)||raw["offset"]!==offset||JSON.stringify(actual)!==JSON.stringify(expected))throw invalid();entries.push({...actual,offset});offset+=actual.bytes;}
 if(offset!==bodyBytes)throw new SharedAssetBytesError("asset_bytes_integrity","Selected asset backup body must be contiguous with no missing or trailing bytes");
 return {format:"breditor/shared-selected-asset-backup",formatVersion:1,metadata,records,assets:entries,sha256:input["sha256"]};
}
