/** Real source closure plus admitted raster payloads; no store writes or native editing. */
import {checkRichAssetLimits} from "@breditor/experimental-rich-content";
import {generationSourceSnapshot} from "../generation_source/capture.js";
import {freezeGeneration} from "../generation_source/identity.js";
import {checkAssetBytesSignal,SharedAssetBytesError,assetBytesKey} from "../asset_bytes/guards.js";
import {resolveSelectedAssetBytes} from "../asset_bytes/resolve.js";
import type {SharedAssetBytesPending,SharedAssetBytesOptions} from "../asset_bytes/types.js";
import {generationAssetUtf8,MAX_GENERATION_ASSET_BACKUP_BYTES} from "./codec.js";
import {encodeGenerationAssetData} from './encode_data.js';
import type {SharedGenerationAssetCaptureOptions,SharedGenerationAssetMetadata,GenerationAssetSnapshot} from "./types.js";
const key=Object.freeze({}),states=new WeakMap<SharedGenerationAssetCapture,{snapshot:GenerationAssetSnapshot;check:()=>void}>(),closed=()=>new SharedAssetBytesError("asset_bytes_closed","Generation asset capture is closed or was not created by this SDK");
export class SharedGenerationAssetCapture {
 readonly #metadata:SharedGenerationAssetMetadata;
 private constructor(token:object,snapshot:GenerationAssetSnapshot,check:()=>void){if(token!==key)throw closed();this.#metadata=snapshot.metadata;states.set(this,{snapshot,check});Object.freeze(this);}
 metadata():SharedGenerationAssetMetadata{return this.#metadata;}
 records():GenerationAssetSnapshot["records"]{const s=states.get(this);if(!s)throw closed();return s.snapshot.records;}
 blob(asset:string,generation:string):Blob|undefined{const s=states.get(this);if(!s)throw closed();const id=assetBytesKey(asset,generation),b=s.snapshot.metadata.bindings.find(b=>assetBytesKey(b.asset,b.generation)===id);return b?s.snapshot.payloads.get(b.contentAsset):undefined;}
 check():void{const s=states.get(this);if(!s)throw closed();s.check();if(states.get(this)!==s)throw closed();}
 dispose():void{states.delete(this);}
 static async capture(input:SharedGenerationAssetCaptureOptions):Promise<{kind:"ready";capture:SharedGenerationAssetCapture}|{kind:"pending";pending:readonly SharedAssetBytesPending[]}>{
  const {source,resolveAsset,limits:supplied,signal}={...input},limits=checkRichAssetLimits(supplied),abort=signal??new AbortController().signal;checkAssetBytesSignal(abort);const native=generationSourceSnapshot(source);
  if(native.metadata.outcome.kind==="pending")return {kind:"pending",pending:freezeGeneration([{kind:"source" as const,pending:native.metadata.outcome.pending}])};
  const resolved=await resolveSelectedAssetBytes(native.metadata.outcome.references,resolveAsset,limits,native.check,abort);native.check();if(resolved.missing.length)return {kind:"pending",pending:resolved.missing};
  const sourceBytes=native.records.reduce((n,r)=>n+generationAssetUtf8(r.json,MAX_GENERATION_ASSET_BACKUP_BYTES).length,0),metadata=freezeGeneration({format:"breditor/shared-generation-asset-bytes" as const,formatVersion:1 as const,identity:native.metadata.identity,document:native.metadata.document,revision:native.metadata.revision,bindings:resolved.bindings,assets:resolved.assets,sourceBytes,assetBytes:resolved.assetBytes});
  const live=()=>{checkAssetBytesSignal(abort);resolved.check();native.check();};live();return {kind:"ready",capture:new SharedGenerationAssetCapture(key,{metadata,records:native.records,payloads:resolved.payloads},live)};
 }
}
export const captureSharedGenerationAssets=(options:SharedGenerationAssetCaptureOptions)=>SharedGenerationAssetCapture.capture(options);
export async function exportSharedGenerationAssetBackup(capture:SharedGenerationAssetCapture,options:Pick<SharedAssetBytesOptions,"signal">={}):Promise<Blob>{
 const s=states.get(capture);if(!s)throw closed();
 const check=()=>{checkAssetBytesSignal(options.signal);SharedGenerationAssetCapture.prototype.check.call(capture);};
 return encodeGenerationAssetData(s.snapshot,check,options.signal);
}
