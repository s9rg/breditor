import {checkRichAssetLimits,inspectRichRaster} from "@breditor/experimental-rich-content";
import type {SharedAssetReferenceCapture,SharedAssetCaptureRecord} from "../asset_references_capture.js";
import {assetBytesKey,checkAssetBytesSignal,checkAssetBytesSnapshotSource,SharedAssetBytesError} from "./guards.js";
import {assetBytesBody,assetBytesDigest,assetBytesUtf8,SHARED_ASSET_BYTES_BACKUP_MAGIC,SHARED_ASSET_BYTES_BACKUP_PREFIX_BYTES,MAX_SHARED_ASSET_BYTES_BACKUP_BYTES,MAX_SHARED_ASSET_BYTES_BACKUP_HEADER_BYTES} from "./format.js";
import {checkAssetBytesHeader} from "./header.js";
import type {SharedAssetBytesSnapshot,SharedAssetBytesMetadata,SharedAssetBytesOptions} from "./types.js";
const key=Object.freeze({}),states=new WeakMap<SharedAssetBytesArchive,{snapshot:SharedAssetBytesSnapshot;file:Blob;bindings:ReadonlyMap<string,string>;urls:Map<string,string>}>();
const closed=()=>new SharedAssetBytesError("asset_bytes_closed","The asset byte archive is disposed or was not read by this SDK");
/** Transport/raster admission only. Serialized claims are not native provenance or current host grants. */
export class SharedAssetBytesArchive {
 readonly #metadata:SharedAssetBytesMetadata;
 private constructor(token:object,snapshot:SharedAssetBytesSnapshot,file:Blob){if(token!==key)throw closed();this.#metadata=snapshot.metadata;states.set(this,{snapshot,file,bindings:new Map(snapshot.metadata.bindings.map(b=>[assetBytesKey(b.asset,b.generation),b.contentAsset])),urls:new Map()});Object.freeze(this);}
 metadata():SharedAssetBytesMetadata{return this.#metadata;}
 records():SharedAssetBytesSnapshot["records"]{const state=states.get(this);if(!state)throw closed();return state.snapshot.records;}
 file():Blob{const state=states.get(this);if(!state)throw closed();return state.file;}
 blob(asset:string,generation:string):Blob|undefined{const state=states.get(this);if(!state)throw closed();const content=state.bindings.get(assetBytesKey(asset,generation));return content?state.snapshot.payloads.get(content):undefined;}
 /** Local object URLs only; exact original native bindings, no native ID rewrite or provider request. */
 resolve(asset:string,generation:string):string|undefined{const state=states.get(this);if(!state)throw closed();const content=state.bindings.get(assetBytesKey(asset,generation));if(!content)return undefined;let url=state.urls.get(content);if(!url){const blob=state.snapshot.payloads.get(content);if(!blob)return undefined;url=URL.createObjectURL(blob);state.urls.set(content,url);}return url;}
 /** Re-admit original sources through matching native/component factories, then verify their closure here. */
 verifySource(source:SharedAssetReferenceCapture):void{const state=states.get(this);if(!state)throw closed();checkAssetBytesSnapshotSource(state.snapshot,source);}
 dispose():void{const state=states.get(this);if(!state)return;states.delete(this);for(const url of state.urls.values())URL.revokeObjectURL(url);state.urls.clear();}
 static async read(input:Blob,options:SharedAssetBytesOptions={}):Promise<SharedAssetBytesArchive>{
  const {signal,limits:supplied}={...options},limits=checkRichAssetLimits(supplied);checkAssetBytesSignal(signal);
  if(!(input instanceof Blob)||input.size<SHARED_ASSET_BYTES_BACKUP_PREFIX_BYTES||input.size>MAX_SHARED_ASSET_BYTES_BACKUP_BYTES)throw new SharedAssetBytesError("asset_bytes_budget","Selected asset backup exceeds its framed budget");const file=new Blob([input],{type:input.type});
  const prefix=new Uint8Array(await file.slice(0,SHARED_ASSET_BYTES_BACKUP_PREFIX_BYTES).arrayBuffer());checkAssetBytesSignal(signal);
  if(SHARED_ASSET_BYTES_BACKUP_MAGIC.some((byte,index)=>prefix[index]!==byte))throw new SharedAssetBytesError("asset_bytes_format","Unknown selected asset backup framing");const length=new DataView(prefix.buffer).getUint32(SHARED_ASSET_BYTES_BACKUP_MAGIC.length),bodyOffset=SHARED_ASSET_BYTES_BACKUP_PREFIX_BYTES+length;
  if(length<1||length>MAX_SHARED_ASSET_BYTES_BACKUP_HEADER_BYTES||bodyOffset>file.size)throw new SharedAssetBytesError("asset_bytes_budget","Selected asset backup header exceeds its explicit budget");
  const encoded=new Uint8Array(await file.slice(SHARED_ASSET_BYTES_BACKUP_PREFIX_BYTES,bodyOffset).arrayBuffer());checkAssetBytesSignal(signal);let raw:unknown;try{raw=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(encoded));}catch{throw new SharedAssetBytesError("asset_bytes_format","Selected asset backup header must be well-formed UTF-8 JSON");}
  const header=checkAssetBytesHeader(raw,file.size-bodyOffset,limits),body=assetBytesBody(header.metadata,header.records,header.assets),sha256=await assetBytesDigest(assetBytesUtf8(JSON.stringify(body),MAX_SHARED_ASSET_BYTES_BACKUP_HEADER_BYTES));checkAssetBytesSignal(signal);
  if(sha256!==header.sha256)throw new SharedAssetBytesError("asset_bytes_integrity","Selected asset backup declarations failed their integrity check");const canonical=assetBytesUtf8(JSON.stringify({...body,sha256}),MAX_SHARED_ASSET_BYTES_BACKUP_HEADER_BYTES);if(canonical.length!==encoded.length||canonical.some((byte,index)=>byte!==encoded[index]))throw new SharedAssetBytesError("asset_bytes_format","Selected asset backup header must retain its canonical bytes");
  const records:SharedAssetCaptureRecord[]=[],payloads=new Map<string,Blob>();
  for(const record of header.records){const bytes=new Uint8Array(await file.slice(bodyOffset+record.offset,bodyOffset+record.offset+record.bytes).arrayBuffer());checkAssetBytesSignal(signal);const digest=await assetBytesDigest(bytes);checkAssetBytesSignal(signal);if(digest!==record.sha256)throw new SharedAssetBytesError("asset_bytes_integrity","Selected source bytes differ from their exact captured digest");let json:string;try{json=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{throw new SharedAssetBytesError("asset_bytes_format","Selected source bytes must remain well-formed UTF-8");}const exact=assetBytesUtf8(json,record.bytes);if(exact.length!==bytes.length||exact.some((byte,index)=>byte!==bytes[index]))throw new SharedAssetBytesError("asset_bytes_format","Selected source text must round trip without replacement");records.push(Object.freeze({kind:record.kind,json}));}
  for(const entry of header.assets){checkAssetBytesSignal(signal);let inspected:Awaited<ReturnType<typeof inspectRichRaster>>;try{inspected=await inspectRichRaster(file.slice(bodyOffset+entry.offset,bodyOffset+entry.offset+entry.bytes,entry.mime),{limits,...(signal===undefined?{}:{signal})});}catch{checkAssetBytesSignal(signal);throw new SharedAssetBytesError("asset_bytes_raster","Selected backup bytes failed ordinary raster admission");}checkAssetBytesSignal(signal);if(inspected.asset!==entry.contentAsset||inspected.mime!==entry.mime||inspected.width!==entry.width||inspected.height!==entry.height||inspected.bytes!==entry.bytes)throw new SharedAssetBytesError("asset_bytes_integrity","Selected raster bytes differ from their exact manifest");payloads.set(entry.contentAsset,inspected.blob);}
  checkAssetBytesSignal(signal);return new SharedAssetBytesArchive(key,{metadata:header.metadata,records:Object.freeze(records),payloads},file);
 }
}
export const readSharedAssetBytesBackup=(file:Blob,options:SharedAssetBytesOptions={}):Promise<SharedAssetBytesArchive>=>SharedAssetBytesArchive.read(file,options);
