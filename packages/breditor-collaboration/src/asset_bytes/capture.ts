/** Selected native/packet source plus admitted immutable raster bytes. No source/provider writes. */
import {checkRichAssetLimits,inspectRichRaster} from "@breditor/experimental-rich-content";
import {MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES} from "../asset_references_capture.js";
import {assetBytesKey,assetBytesSource,checkAssetBytesSignal,SharedAssetBytesError,synchronousProviderCheck} from "./guards.js";
import type {SharedAssetBytesCaptureOptions,SharedAssetBytesSnapshot,SharedAssetBytesMetadata,SharedAssetByteBinding,SharedAssetBytePayload,SharedAssetBytesPending} from "./types.js";
const key=Object.freeze({}),states=new WeakMap<SharedAssetBytesCapture,{snapshot:SharedAssetBytesSnapshot;bindings:ReadonlyMap<string,string>;check:()=>void}>();
export type SharedAssetBytesCaptureOutcome=Readonly<{kind:"ready";capture:SharedAssetBytesCapture}>|Readonly<{kind:"pending";pending:readonly SharedAssetBytesPending[]}>;
const closed=()=>new SharedAssetBytesError("asset_bytes_closed","The asset byte capture is disposed or was not created by this SDK");
export class SharedAssetBytesCapture {
 readonly #metadata:SharedAssetBytesMetadata;
 private constructor(token:object,snapshot:SharedAssetBytesSnapshot,check:()=>void){if(token!==key)throw closed();this.#metadata=snapshot.metadata;states.set(this,{snapshot,bindings:new Map(snapshot.metadata.bindings.map(b=>[assetBytesKey(b.asset,b.generation),b.contentAsset])),check});Object.freeze(this);}
 metadata():SharedAssetBytesMetadata{return this.#metadata;}
 records():SharedAssetBytesSnapshot["records"]{const state=states.get(this);if(!state)throw closed();return state.snapshot.records;}
 /** Exact original asset/generation lookup; native opaque identities are never rewritten. */
 blob(asset:string,generation:string):Blob|undefined{const state=states.get(this);if(!state)throw closed();const content=state.bindings.get(assetBytesKey(asset,generation));return content?state.snapshot.payloads.get(content):undefined;}
 payload(contentAsset:string):Blob|undefined{const state=states.get(this);if(!state)throw closed();return state.snapshot.payloads.get(contentAsset);}
 /** Call after asynchronous host work. Detached metadata and blobs alone carry no live provenance. */
 check():void{const state=states.get(this);if(!state)throw closed();state.check();}
 dispose():void{states.delete(this);}
 static async capture(input:SharedAssetBytesCaptureOptions):Promise<SharedAssetBytesCaptureOutcome>{
  const {source,resolveAsset,signal,limits:supplied}={...input},limits=checkRichAssetLimits(supplied),abort=signal??new AbortController().signal;
  checkAssetBytesSignal(abort);if(typeof resolveAsset!=="function")throw new SharedAssetBytesError("asset_bytes_provider","An explicit host byte resolver is required");const native=assetBytesSource(source),check=()=>{checkAssetBytesSignal(abort);native.check();};check();
  if(native.metadata.outcome.kind==="pending")return Object.freeze({kind:"pending",pending:Object.freeze([Object.freeze({kind:"source",pending:native.metadata.outcome.pending})])});
  const checks:(()=>void)[]=[],bindings:SharedAssetByteBinding[]=[],assets=new Map<string,SharedAssetBytePayload>(),payloads=new Map<string,Blob>(),identities=new Map<string,string>(),missing:SharedAssetBytesPending[]=[];let assetBytes=0;
  for(const reference of native.metadata.outcome.references){check();let resolved:Awaited<ReturnType<typeof resolveAsset>>;try{resolved=await resolveAsset(reference,abort);}catch{check();throw new SharedAssetBytesError("asset_bytes_provider","The host asset byte resolver did not complete");}check();
   if(resolved===undefined){missing.push(Object.freeze({kind:"asset",reference}));continue;}
   let supplied: {asset:unknown;generation:unknown;identity:unknown;blob:unknown;provider:unknown};
   try{if(!resolved||typeof resolved!=="object")throw Error();supplied={asset:resolved.asset,generation:resolved.generation,identity:resolved.identity,blob:resolved.blob,provider:resolved.check};}catch{throw new SharedAssetBytesError("asset_bytes_provider","The host asset byte binding could not be read");}
   const {asset,generation,identity,blob,provider}=supplied;
   const addressed=/^sha256:[a-f0-9]{64}$/.test(reference.asset),mode=addressed?"content-addressed":"host-verified";
   if(asset!==reference.asset||generation!==reference.generation||identity!==mode||!(blob instanceof Blob)||typeof provider!=="function")throw new SharedAssetBytesError("asset_bytes_provider","The host must bind exact asset/generation bytes and their identity policy");
   const guard=synchronousProviderCheck(()=>provider.call(resolved));guard();checks.push(guard);check();let raster:Awaited<ReturnType<typeof inspectRichRaster>>;
   try{raster=await inspectRichRaster(blob,{limits,signal:abort});}catch{check();throw new SharedAssetBytesError("asset_bytes_raster","Captured bytes failed ordinary raster admission");}check();guard();
   if(addressed&&raster.asset!==asset||identities.has(asset)&&identities.get(asset)!==raster.asset)throw new SharedAssetBytesError("asset_bytes_integrity","Immutable asset identities must retain one exact content digest");identities.set(asset,raster.asset);
   if(!assets.has(raster.asset)){assetBytes+=raster.bytes;if(assetBytes>limits.maxStoredBytes)throw new SharedAssetBytesError("asset_bytes_budget","Complete selected asset bytes exceed the retained payload budget");assets.set(raster.asset,Object.freeze({contentAsset:raster.asset,mime:raster.mime,width:raster.width,height:raster.height,bytes:raster.bytes}));payloads.set(raster.asset,raster.blob);}
   bindings.push(Object.freeze({asset,generation,identity:mode,contentAsset:raster.asset}));
  }
  const live=()=>{native.check();for(const guard of checks)guard();native.check();};check();live();check();if(missing.length)return Object.freeze({kind:"pending",pending:Object.freeze(missing)});
  let sourceBytes=0;for(const record of native.records)sourceBytes+=new TextEncoder().encode(record.json).byteLength;if(sourceBytes>MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES)throw new SharedAssetBytesError("asset_bytes_budget","Complete selected source records exceed their existing budget");
  const metadata:SharedAssetBytesMetadata=Object.freeze({format:"breditor/shared-selected-asset-bytes",formatVersion:1,document:native.metadata.document,revision:native.metadata.revision,scope:native.metadata.scope,bindings:Object.freeze(bindings),assets:Object.freeze([...assets.values()].sort((a,b)=>a.contentAsset<b.contentAsset?-1:1)),sourceBytes,assetBytes});
  return Object.freeze({kind:"ready",capture:new SharedAssetBytesCapture(key,{metadata,records:native.records,payloads},live)});
 }
}
export const captureSharedAssetBytes=(options:SharedAssetBytesCaptureOptions):Promise<SharedAssetBytesCaptureOutcome>=>SharedAssetBytesCapture.capture(options);
