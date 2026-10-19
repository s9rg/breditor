/** Closed, bounded declarations. Only later native re-admission can prove the claimed source closure. */
import type {AssetLimits} from "@breditor/experimental-rich-content";
import {MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES} from "../asset_references_capture.js";
import {SharedAssetBytesError} from "./guards.js";
import type {SharedAssetBytesMetadata,SharedAssetByteBinding,SharedAssetBytePayload} from "./types.js";
import type {AssetBytesHeader,AssetBytesSourceEntry,AssetBytesPayloadEntry} from "./format.js";
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const fields=(v:Record<string,unknown>,names:string)=>{const keys=names.split(",");return Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));};
const identity=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const content=(v:unknown):v is string=>typeof v==="string"&&/^sha256:[a-f0-9]{64}$/.test(v);
const digest=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const integer=(v:unknown,min:number,max:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const invalid=()=>new SharedAssetBytesError("asset_bytes_format","Expected closed canonical selected-source asset backup declarations");
const kinds=["document","paired-session","version-catalog","suggestions","suggestion-revisions"] as const;
function payload(value:unknown,limits:Readonly<AssetLimits>,offset:boolean):SharedAssetBytePayload {
 if(!object(value)||!fields(value,offset?"contentAsset,mime,width,height,bytes,offset":"contentAsset,mime,width,height,bytes")||!content(value["contentAsset"])||typeof value["mime"]!=="string"||!["image/png","image/jpeg","image/webp"].includes(value["mime"])||!integer(value["width"],1,limits.maxDimension)||!integer(value["height"],1,limits.maxDimension)||Number(value["width"])*Number(value["height"])>limits.maxPixels||!integer(value["bytes"],1,limits.maxFileBytes))throw invalid();
 return Object.freeze({contentAsset:value["contentAsset"],mime:value["mime"] as SharedAssetBytePayload["mime"],width:value["width"],height:value["height"],bytes:value["bytes"]});
}
export function checkAssetBytesHeader(input:unknown,bodyBytes:number,limits:Readonly<AssetLimits>):AssetBytesHeader {
 if(!object(input)||!fields(input,"format,formatVersion,metadata,records,assets,sha256")||input["format"]!=="breditor/shared-selected-asset-backup"||input["formatVersion"]!==1||!digest(input["sha256"])||!object(input["metadata"]))throw invalid();
 const m=input["metadata"];
 if(!fields(m,"format,formatVersion,document,revision,scope,bindings,assets,sourceBytes,assetBytes")||m["format"]!=="breditor/shared-selected-asset-bytes"||m["formatVersion"]!==1||!identity(m["document"])||typeof m["revision"]!=="string"||!/^(?:0|[1-9][0-9]{0,19})$/.test(m["revision"])||BigInt(m["revision"])>18446744073709551615n||m["scope"]!=="native-and-selected-retained-packets"||!integer(m["sourceBytes"],1,MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES)||!integer(m["assetBytes"],0,limits.maxStoredBytes)||!Array.isArray(m["bindings"])||m["bindings"].length>100000||!Array.isArray(m["assets"])||m["assets"].length>m["bindings"].length)throw invalid();
 const bindings:SharedAssetByteBinding[]=[],used=new Set<string>(),byIdentity=new Map<string,string>();let previous:SharedAssetByteBinding|undefined;
 for(const value of m["bindings"]){if(!object(value)||!fields(value,"asset,generation,identity,contentAsset")||!identity(value["asset"])||!identity(value["generation"])||!content(value["contentAsset"]))throw invalid();const addressed=content(value["asset"]);if(value["identity"]!==(addressed?"content-addressed":"host-verified")||addressed&&value["asset"]!==value["contentAsset"]||byIdentity.has(value["asset"])&&byIdentity.get(value["asset"])!==value["contentAsset"])throw invalid();const pair=Object.freeze({asset:value["asset"],generation:value["generation"],identity:value["identity"] as SharedAssetByteBinding["identity"],contentAsset:value["contentAsset"]});if(previous&&(previous.asset>pair.asset||previous.asset===pair.asset&&previous.generation>=pair.generation))throw invalid();previous=pair;bindings.push(pair);used.add(pair.contentAsset);byIdentity.set(pair.asset,pair.contentAsset);}
 const assets:SharedAssetBytePayload[]=[];let bytes=0,last="";
 for(const raw of m["assets"]){const asset=payload(raw,limits,false);if(asset.contentAsset<=last||!used.delete(asset.contentAsset))throw invalid();last=asset.contentAsset;bytes+=asset.bytes;assets.push(asset);}
 if(used.size||bytes!==m["assetBytes"]||bytes>limits.maxStoredBytes)throw invalid();
 const metadata:SharedAssetBytesMetadata=Object.freeze({format:"breditor/shared-selected-asset-bytes",formatVersion:1,document:m["document"],revision:m["revision"],scope:m["scope"],bindings:Object.freeze(bindings),assets:Object.freeze(assets),sourceBytes:m["sourceBytes"],assetBytes:m["assetBytes"]});
 if(!Array.isArray(input["records"])||input["records"].length<1||input["records"].length>kinds.length||!Array.isArray(input["assets"])||input["assets"].length!==assets.length)throw invalid();
 const records:AssetBytesSourceEntry[]=[],entries:AssetBytesPayloadEntry[]=[];let offset=0,ordinal=-1;
 for(const raw of input["records"]){if(!object(raw)||!fields(raw,"kind,bytes,offset,sha256")||typeof raw["kind"]!=="string"||!digest(raw["sha256"]))throw invalid();const index=kinds.findIndex(kind=>kind===raw["kind"]);if(index<0||index<=ordinal||records.length===0&&index!==0||!integer(raw["bytes"],1,index===0?16*1024*1024:32*1024*1024)||raw["offset"]!==offset)throw invalid();ordinal=index;records.push({kind:kinds[index]!,bytes:raw["bytes"],offset,sha256:raw["sha256"]});offset+=raw["bytes"];}
 if(offset!==metadata.sourceBytes)throw invalid();
 for(let i=0;i<assets.length;i++){const raw=input["assets"][i],actual=payload(raw,limits,true),expected=assets[i]!;if(!object(raw)||raw["offset"]!==offset||JSON.stringify(actual)!==JSON.stringify(expected))throw invalid();entries.push({...actual,offset});offset+=actual.bytes;}
 if(offset!==bodyBytes)throw new SharedAssetBytesError("asset_bytes_integrity","Selected asset backup body must be contiguous with no missing or trailing bytes");
 return {format:"breditor/shared-selected-asset-backup",formatVersion:1,metadata,records,assets:entries,sha256:input["sha256"]};
}
