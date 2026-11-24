import {inspectRasterDisplay,type RichRasterDisplaySize,type RichRasterInspection} from "./inspect_raster.js";
import {checkedAssetLimits} from "./limits.js";
import {isPinnedRasterAsset,prepareRasterUrlDisplay,RichRasterUrlError,type RichRasterUrlOptions} from "./prepare_raster_url.js";
import {checkRasterSignal} from "./raster_decode.js";

export interface RichRasterRenditionCandidate {
 readonly width:number;
 readonly url:string;
 readonly expectedAsset:string;
}
export interface RichRasterRenditionOptions extends Omit<RichRasterUrlOptions,"expectedAsset"> {
 /** Content address held by the original native image binding. */
 readonly originalAsset:string;
 /** Display width in whole pixels for the host's selected rendition. */
 readonly requestedWidth:number;
 readonly candidates:readonly RichRasterRenditionCandidate[];
}
export type RichRasterRenditionResult=
 Readonly<RichRasterDisplaySize&{kind:"rendition";originalAsset:string;raster:RichRasterInspection}>|
 Readonly<RichRasterDisplaySize&{kind:"original";originalAsset:string;raster:RichRasterInspection;reason:"no-rendition"|"refused-rendition"|"incompatible-rendition"}>;

const maximumCandidates=16;
function snapshotCandidates(candidates:readonly RichRasterRenditionCandidate[]):RichRasterRenditionCandidate[]{
 if(!Array.isArray(candidates)||candidates.length>maximumCandidates)throw new RangeError("Choose at most 16 pinned raster renditions");
 const seen=new Set<number>();
 return candidates.map(candidate=>{
  if(!candidate)throw new TypeError("Expected a pinned raster rendition");
  const {width,url,expectedAsset}=candidate;
  if(!Number.isSafeInteger(width)||width<1||seen.has(width))throw new RangeError("Rendition widths must be distinct positive integers");
  if(typeof url!=="string"||typeof expectedAsset!=="string")throw new TypeError("Expected a raster URL and pinned asset address");
  seen.add(width);
  return {width,url,expectedAsset};
 }).sort((a,b)=>a.width-b.width);
}

/** Choose display bytes while leaving the original native asset identity and storage with the host. */
export async function prepareRichRasterRendition(original:Blob,options:RichRasterRenditionOptions):Promise<RichRasterRenditionResult>{
 const {originalAsset,requestedWidth,candidates,allowUrl,load,signal,limits:supplied}=options;
 checkRasterSignal(signal);
 if(!isPinnedRasterAsset(originalAsset))throw new RichRasterUrlError("integrity","Expected the pinned original SHA-256 raster address");
 if(!Number.isSafeInteger(requestedWidth)||requestedWidth<1)throw new RangeError("Request a positive whole-pixel rendition width");
 if(typeof allowUrl!=="function"||typeof load!=="function")throw new TypeError("Choose an explicit raster URL policy and loader");
 const variants=snapshotCandidates(candidates),limits=checkedAssetLimits(supplied);
 const admission={limits,...(signal===undefined?{}:{signal})};
 let inspected:Awaited<ReturnType<typeof inspectRasterDisplay>>;
 try{inspected=await inspectRasterDisplay(original,admission);}
 catch(error){checkRasterSignal(signal);throw error;}
 checkRasterSignal(signal);
 if(inspected.raster.asset!==originalAsset)throw new RichRasterUrlError("integrity","The original raster differs from the bound asset");
 const fallback=(reason:Extract<RichRasterRenditionResult,{kind:"original"}>["reason"]):RichRasterRenditionResult=>
  Object.freeze({kind:"original",originalAsset,...inspected,reason});
 const selected=variants.find(variant=>variant.width>=requestedWidth&&variant.width<inspected.displayWidth);
 if(!selected)return fallback("no-rendition");
 let rendition:Awaited<ReturnType<typeof prepareRasterUrlDisplay>>;
 try{
  rendition=await prepareRasterUrlDisplay(selected.url,{...admission,expectedAsset:selected.expectedAsset,
   allowUrl:url=>allowUrl.call(options,url),load:request=>load.call(options,request)},signal);
 }catch(error){
  checkRasterSignal(signal);
  if(error instanceof RichRasterUrlError)return fallback("refused-rendition");
  throw error;
 }
 checkRasterSignal(signal);
 const height=Math.max(1,Math.round(inspected.displayHeight*selected.width/inspected.displayWidth));
 if(rendition.displayWidth!==selected.width||rendition.displayHeight!==height||rendition.raster.bytes>=inspected.raster.bytes){
  return fallback("incompatible-rendition");
 }
 return Object.freeze({kind:"rendition",originalAsset,...rendition});
}
