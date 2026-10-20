/** Selected native/packet source plus admitted immutable raster bytes. No source/provider writes. */
import {checkRichAssetLimits} from "@breditor/experimental-rich-content";
import {MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES} from "../asset_references_capture.js";
import {assetBytesKey,assetBytesSource,checkAssetBytesSignal,SharedAssetBytesError} from "./guards.js";
import type {SharedAssetBytesCaptureOptions,SharedAssetBytesSnapshot,SharedAssetBytesMetadata,SharedAssetBytesPending} from "./types.js";
import {resolveSelectedAssetBytes} from "./resolve.js";
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
  const {bindings,assets,payloads,assetBytes,missing,check:live}=await resolveSelectedAssetBytes(native.metadata.outcome.references,resolveAsset,limits,native.check,abort);if(missing.length)return Object.freeze({kind:"pending",pending:missing});
  let sourceBytes=0;for(const record of native.records)sourceBytes+=new TextEncoder().encode(record.json).byteLength;if(sourceBytes>MAX_SHARED_ASSET_CAPTURE_SOURCE_BYTES)throw new SharedAssetBytesError("asset_bytes_budget","Complete selected source records exceed their existing budget");
  const metadata:SharedAssetBytesMetadata=Object.freeze({format:"breditor/shared-selected-asset-bytes",formatVersion:1,document:native.metadata.document,revision:native.metadata.revision,scope:native.metadata.scope,bindings:Object.freeze(bindings),assets,sourceBytes,assetBytes});
  return Object.freeze({kind:"ready",capture:new SharedAssetBytesCapture(key,{metadata,records:native.records,payloads},live)});
 }
}
export const captureSharedAssetBytes=(options:SharedAssetBytesCaptureOptions):Promise<SharedAssetBytesCaptureOutcome>=>SharedAssetBytesCapture.capture(options);
