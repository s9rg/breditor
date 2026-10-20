/** Real source closure plus admitted raster payloads; no store writes or native editing. */
import {checkRichAssetLimits} from "@breditor/experimental-rich-content";
import {generationSourceSnapshot} from "../generation_source/capture.js";
import {freezeGeneration} from "../generation_source/identity.js";
import {checkAssetBytesSignal,SharedAssetBytesError,assetBytesKey} from "../asset_bytes/guards.js";
import {resolveSelectedAssetBytes} from "../asset_bytes/resolve.js";
import type {SharedAssetBytesPending,SharedAssetBytesOptions} from "../asset_bytes/types.js";
import {generationAssetBody,generationAssetDigest,generationAssetUtf8,GENERATION_ASSET_MIME,GENERATION_ASSET_MAGIC,GENERATION_ASSET_PREFIX_BYTES,MAX_GENERATION_ASSET_HEADER_BYTES,MAX_GENERATION_ASSET_BACKUP_BYTES,type GenerationAssetHeader} from "./codec.js";
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
 const s=states.get(capture);if(!s)throw closed();const check=()=>{checkAssetBytesSignal(options.signal);SharedGenerationAssetCapture.prototype.check.call(capture);};check();const parts:BlobPart[]=[],records:GenerationAssetHeader["records"][number][]=[],assets:GenerationAssetHeader["assets"][number][]=[];let offset=0;
 for(const r of s.snapshot.records){check();const bytes=generationAssetUtf8(r.json,MAX_GENERATION_ASSET_BACKUP_BYTES),sha256=await generationAssetDigest(bytes);check();records.push({kind:r.kind,index:r.index,bytes:bytes.length,offset,sha256});parts.push(bytes);offset+=bytes.length;}
 if(offset!==s.snapshot.metadata.sourceBytes)throw new SharedAssetBytesError("asset_bytes_integrity","Generation source byte counts differ");for(const a of s.snapshot.metadata.assets){const blob=s.snapshot.payloads.get(a.contentAsset);if(!blob||blob.size!==a.bytes||blob.type!==a.mime)throw closed();assets.push({...a,offset});parts.push(blob);offset+=a.bytes;}
 const body=generationAssetBody(s.snapshot.metadata,records,assets),sha256=await generationAssetDigest(generationAssetUtf8(JSON.stringify(body),MAX_GENERATION_ASSET_HEADER_BYTES));check();const header=generationAssetUtf8(JSON.stringify({...body,sha256}),MAX_GENERATION_ASSET_HEADER_BYTES),prefix=new Uint8Array(GENERATION_ASSET_PREFIX_BYTES);prefix.set(GENERATION_ASSET_MAGIC);new DataView(prefix.buffer).setUint32(GENERATION_ASSET_MAGIC.length,header.length);
 const file=new Blob([prefix,header,...parts],{type:GENERATION_ASSET_MIME});if(file.size>MAX_GENERATION_ASSET_BACKUP_BYTES)throw new SharedAssetBytesError("asset_bytes_budget","Generation asset file exceeds its explicit complete budget");check();return file;
}
