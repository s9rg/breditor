import {canonicalImageLinkHrefV1} from "@breditor/browser/presentation";
import {inspectRasterDisplay,type RichRasterDisplaySize,type RichRasterInspection,type RichRasterInspectionOptions} from "./inspect_raster.js";
import {checkedAssetLimits} from "./limits.js";
import {awaitRasterOperation,checkRasterSignal} from "./raster_decode.js";

export interface RichRasterUrlLoadRequest {
 readonly url:string;
 readonly maxBytes:number;
 readonly redirect:"error";
 readonly signal?:AbortSignal;
}
export interface RichRasterUrlLoadResponse {
 /** The response's actual final URL. It must equal the approved request URL. */
 readonly url:string;
 readonly blob:Blob;
}
export interface RichRasterUrlOptions extends RichRasterInspectionOptions {
 /** Expected content address from the host's trusted asset record. */
 readonly expectedAsset:string;
 allowUrl(url:string):boolean;
 /** The host owns the actual network limits, redirect policy and authentication. */
 load(request:RichRasterUrlLoadRequest):RichRasterUrlLoadResponse|Promise<RichRasterUrlLoadResponse>;
}
export class RichRasterUrlError extends Error {
 constructor(readonly code:"url"|"policy"|"load"|"redirect"|"budget"|"raster"|"integrity",message:string){
  super(message);this.name="RichRasterUrlError";
 }
}

const rasterTypes=new Set(["image/png","image/jpeg","image/webp"]);

/** Inspect only host-approved HTTPS bytes against a pinned content address. */
export async function prepareRichRasterUrl(source:string,options:RichRasterUrlOptions):Promise<RichRasterInspection>{
 return (await prepareRasterUrlDisplay(source,options)).raster;
}
export async function prepareRasterUrlDisplay(source:string,options:RichRasterUrlOptions):Promise<RichRasterDisplaySize&{readonly raster:RichRasterInspection}>{
 const {allowUrl,load,expectedAsset,signal,limits:supplied}=options;
 checkRasterSignal(signal);
 const url=canonicalImageLinkHrefV1(source);
 if(url===null||!url.startsWith("https://")||url.includes("#"))throw new RichRasterUrlError("url","Expected a credential-free HTTPS raster URL without a fragment");
 if(typeof expectedAsset!=="string"||expectedAsset.length!==71||!/^sha256:[0-9a-f]{64}$/.test(expectedAsset)){
  throw new RichRasterUrlError("integrity","Expected the pinned SHA-256 raster address");
 }
 const limits=checkedAssetLimits(supplied);
 if(typeof allowUrl!=="function"||typeof load!=="function")throw new RichRasterUrlError("policy","Choose an explicit raster URL policy and loader");
 let approved:boolean;
 try{approved=allowUrl.call(options,url);}
 catch{checkRasterSignal(signal);throw new RichRasterUrlError("policy","The host refused the raster URL");}
 checkRasterSignal(signal);
 if(approved!==true)throw new RichRasterUrlError("policy","The host refused the raster URL");
 const request=Object.freeze({url,maxBytes:limits.maxFileBytes,redirect:"error" as const,...(signal===undefined?{}:{signal})});
 let responseUrl:string,blob:Blob;
 try{
  const response=await awaitRasterOperation(()=>load.call(options,request),signal);
  ({url:responseUrl,blob}=response);
 }catch{checkRasterSignal(signal);throw new RichRasterUrlError("load","The host could not load the approved raster");}
 checkRasterSignal(signal);
 if(responseUrl!==url)throw new RichRasterUrlError("redirect","The loaded raster URL differs from the approved URL");
 if(!(blob instanceof Blob)||!rasterTypes.has(blob.type))throw new RichRasterUrlError("raster","Expected immutable PNG, JPEG or WebP bytes");
 if(blob.size<1||blob.size>limits.maxFileBytes)throw new RichRasterUrlError("budget","Raster bytes exceeded the admitted size limit");
 let inspected:Awaited<ReturnType<typeof inspectRasterDisplay>>;
 try{inspected=await inspectRasterDisplay(blob,{limits,...(signal===undefined?{}:{signal})});}
 catch{checkRasterSignal(signal);throw new RichRasterUrlError("raster","Raster bytes failed image admission");}
 checkRasterSignal(signal);
 if(inspected.raster.asset!==expectedAsset)throw new RichRasterUrlError("integrity","The loaded raster differs from the pinned asset");
 return inspected;
}
