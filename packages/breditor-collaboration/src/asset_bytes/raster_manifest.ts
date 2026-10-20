/** Shared closed raster manifests. Contains no native source or archive-format selection. */
import type {AssetLimits} from "@breditor/experimental-rich-content";
import type {SharedAssetByteBinding,SharedAssetBytePayload} from "./types.js";
import {SharedAssetBytesError} from "./guards.js";
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const fields=(v:Record<string,unknown>,names:string)=>{const keys=names.split(",");return Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));};
const identity=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const content=(v:unknown):v is string=>typeof v==="string"&&/^sha256:[a-f0-9]{64}$/.test(v);
const integer=(v:unknown,min:number,max:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const invalid=()=>new SharedAssetBytesError("asset_bytes_format","Expected closed canonical raster declarations");
export function checkAssetPayload(value:unknown,limits:Readonly<AssetLimits>,offset:boolean):SharedAssetBytePayload{
 if(!object(value)||!fields(value,offset?"contentAsset,mime,width,height,bytes,offset":"contentAsset,mime,width,height,bytes")||!content(value["contentAsset"])||typeof value["mime"]!=="string"||!["image/png","image/jpeg","image/webp"].includes(value["mime"])||!integer(value["width"],1,limits.maxDimension)||!integer(value["height"],1,limits.maxDimension)||Number(value["width"])*Number(value["height"])>limits.maxPixels||!integer(value["bytes"],1,limits.maxFileBytes))throw invalid();
 return Object.freeze({contentAsset:value["contentAsset"],mime:value["mime"] as SharedAssetBytePayload["mime"],width:value["width"],height:value["height"],bytes:value["bytes"]});
}
export function checkRasterManifest(inputBindings:unknown,inputAssets:unknown,assetBytes:unknown,limits:Readonly<AssetLimits>):{bindings:readonly SharedAssetByteBinding[];assets:readonly SharedAssetBytePayload[]}{
 if(!integer(assetBytes,0,limits.maxStoredBytes)||!Array.isArray(inputBindings)||inputBindings.length>100000||!Array.isArray(inputAssets)||inputAssets.length>inputBindings.length)throw invalid();
 const bindings:SharedAssetByteBinding[]=[],used=new Set<string>(),byIdentity=new Map<string,string>();let previous:SharedAssetByteBinding|undefined;
 for(const value of inputBindings){if(!object(value)||!fields(value,"asset,generation,identity,contentAsset")||!identity(value["asset"])||!identity(value["generation"])||!content(value["contentAsset"]))throw invalid();const addressed=content(value["asset"]);if(value["identity"]!==(addressed?"content-addressed":"host-verified")||addressed&&value["asset"]!==value["contentAsset"]||byIdentity.has(value["asset"])&&byIdentity.get(value["asset"])!==value["contentAsset"])throw invalid();const pair=Object.freeze({asset:value["asset"],generation:value["generation"],identity:value["identity"] as SharedAssetByteBinding["identity"],contentAsset:value["contentAsset"]});if(previous&&(previous.asset>pair.asset||previous.asset===pair.asset&&previous.generation>=pair.generation))throw invalid();previous=pair;bindings.push(pair);used.add(pair.contentAsset);byIdentity.set(pair.asset,pair.contentAsset);}
 const assets:SharedAssetBytePayload[]=[];let bytes=0,last="";for(const raw of inputAssets){const asset=checkAssetPayload(raw,limits,false);if(asset.contentAsset<=last||!used.delete(asset.contentAsset))throw invalid();last=asset.contentAsset;bytes+=asset.bytes;assets.push(asset);}if(used.size||bytes!==assetBytes||bytes>limits.maxStoredBytes)throw invalid();
 return {bindings:Object.freeze(bindings),assets:Object.freeze(assets)};
}
