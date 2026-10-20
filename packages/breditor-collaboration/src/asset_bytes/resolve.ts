/** Shared raster resolution, not a source proof or file-format admission path. */
import {inspectRichRaster,type AssetLimits,type RichRetainedAssetReference} from "@breditor/experimental-rich-content";
import {checkAssetBytesSignal,SharedAssetBytesError,synchronousProviderCheck} from "./guards.js";
import type {SharedAssetBytesResolver,SharedAssetByteBinding,SharedAssetBytePayload,SharedAssetBytesPending} from "./types.js";
export async function resolveSelectedAssetBytes(references:readonly RichRetainedAssetReference[],resolveAsset:SharedAssetBytesResolver,limits:Readonly<AssetLimits>,sourceCheck:()=>void,signal:AbortSignal){
 const check=()=>{checkAssetBytesSignal(signal);sourceCheck();};check();if(typeof resolveAsset!=="function")throw new SharedAssetBytesError("asset_bytes_provider","An explicit host byte resolver is required");
 const checks:(()=>void)[]=[],bindings:SharedAssetByteBinding[]=[],assets=new Map<string,SharedAssetBytePayload>(),payloads=new Map<string,Blob>(),identities=new Map<string,string>(),missing:SharedAssetBytesPending[]=[];let assetBytes=0;
 for(const reference of references){check();let resolved:Awaited<ReturnType<typeof resolveAsset>>;try{resolved=await resolveAsset(reference,signal);}catch{check();throw new SharedAssetBytesError("asset_bytes_provider","The host asset byte resolver did not complete");}check();
  if(resolved===undefined){missing.push(Object.freeze({kind:"asset",reference}));continue;}
  let supplied:{asset:unknown;generation:unknown;identity:unknown;blob:unknown;provider:unknown};try{if(!resolved||typeof resolved!=="object")throw Error();supplied={asset:resolved.asset,generation:resolved.generation,identity:resolved.identity,blob:resolved.blob,provider:resolved.check};}catch{throw new SharedAssetBytesError("asset_bytes_provider","The host asset byte binding could not be read");}
  const {asset,generation,identity,blob,provider}=supplied,addressed=/^sha256:[a-f0-9]{64}$/.test(reference.asset),mode=addressed?"content-addressed":"host-verified";
  if(asset!==reference.asset||generation!==reference.generation||identity!==mode||!(blob instanceof Blob)||typeof provider!=="function")throw new SharedAssetBytesError("asset_bytes_provider","The host must bind exact asset/generation bytes and their identity policy");
  const guard=synchronousProviderCheck(()=>provider.call(resolved));guard();checks.push(guard);check();let raster:Awaited<ReturnType<typeof inspectRichRaster>>;
  try{raster=await inspectRichRaster(blob,{limits,signal});}catch{check();throw new SharedAssetBytesError("asset_bytes_raster","Captured bytes failed ordinary raster admission");}check();guard();
  if(addressed&&raster.asset!==asset||identities.has(asset)&&identities.get(asset)!==raster.asset)throw new SharedAssetBytesError("asset_bytes_integrity","Immutable asset identities must retain one exact content digest");identities.set(asset,raster.asset);
  if(!assets.has(raster.asset)){assetBytes+=raster.bytes;if(assetBytes>limits.maxStoredBytes)throw new SharedAssetBytesError("asset_bytes_budget","Complete selected asset bytes exceed the retained payload budget");assets.set(raster.asset,Object.freeze({contentAsset:raster.asset,mime:raster.mime,width:raster.width,height:raster.height,bytes:raster.bytes}));payloads.set(raster.asset,raster.blob);}
  bindings.push(Object.freeze({asset,generation,identity:mode,contentAsset:raster.asset}));
 }
 const live=()=>{sourceCheck();for(const guard of checks)guard();sourceCheck();};check();live();check();return {bindings:Object.freeze(bindings),assets:Object.freeze([...assets.values()].sort((a,b)=>a.contentAsset<b.contentAsset?-1:1)),payloads,assetBytes,missing:Object.freeze(missing),check:live};
}
