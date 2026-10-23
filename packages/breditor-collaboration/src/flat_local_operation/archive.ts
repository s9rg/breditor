/** Typed full-chain data admission. Every native cut continues the preceding
 * LIVE through a fresh read-only runtime. No journal, author lease, activation
 * or persistent owner is granted by this data reader. */
import {readRichAssetBackup,inspectRichRaster,RichAssetArchive} from '@breditor/experimental-rich-content';
import {IndependentLocalOperationBackup,portableLocalOperationArchive as base} from '../independent_local_operation/portable_backup.js';
import {localPortableReadPolicy,type LocalOperationReadOptions} from '../independent_local_operation/portable_policy.js';
import {localPortableCutRecovery} from '../independent_local_operation/portable_cut.js';
import {localOperationBackupSelection} from '../independent_local_operation/portable_identity.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {localPortableReferences} from '../independent_local_operation/portable_references.js';
import {checkIndependentRecords} from '../independent_source/records.js';
import type {SharedIndependentSourceRecord} from '../independent_source/contract.js';
import type {SharedIndependentHistoryRecovery,IndependentHistoryCut} from '../independent_history/contract.js';
import type {LocalOperationBackupSelection} from '../independent_local_operation/portable_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import {readOperationCut,operationCutDigest} from '../independent_operation/cut_codec.js';
import {readRestoredLocalHead} from '../restored_local_operation/head.js';
import {readRestoredLocalIntent} from '../restored_local_operation/intent.js';
import {operationRasterManifest} from '../independent_operation/portable_rasters.js';
import {FlatLocalProvenance as Graph} from './framing.js';
import {readFlatLocalHead} from './head.js';
import {readFlatLocalIntent} from './intent.js';
import {readFlatLocalStateIdentity} from './identity.js';
import {readFlatLocalStatePayloads} from './state_payloads.js';
import {MAX_INDEPENDENT_SOURCE_RECORDS} from '../independent_source/contract.js';
import {MAX_OPERATION_RASTER_REFERENCES} from '../independent_operation/portable_rasters.js';
import {flatLocalFailure} from './failure.js';

type Manifest=ReturnType<typeof operationRasterManifest>;
type UploadRows=ReturnType<typeof base.entries>;
interface State{readonly graph:Graph;readonly selection:LocalOperationBackupSelection;readonly original:SharedIndependentHistoryRecovery;readonly originalFile:Blob;readonly live:SharedIndependentHistoryRecovery;readonly targets:readonly SharedIndependentHistoryRecovery[];readonly uploads:Blob;readonly rows:UploadRows;readonly bindings:Manifest['bindings'];readonly assets:Manifest['assets'];readonly assetBytes:number;readonly pixels:ReadonlyMap<string,Blob>}
interface PayloadRef{readonly bytes:number;readonly sha256:string}
const key=Object.freeze({}),owners=new WeakMap<FlatLocalArchive,State>(),readAssets=readRichAssetBackup,assetEntries=RichAssetArchive.prototype.entries,assetBackup=RichAssetArchive.prototype.backup,disposeAssets=RichAssetArchive.prototype.dispose;
function fail():never{throw flatLocalFailure('flat_local_operation_archive');}
function fields(value:unknown,keys:string):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.split(',').sort().join(','))fail();return value as Record<string,unknown>;}
function state(owner:FlatLocalArchive):State{const s=owners.get(owner)??fail();s["graph"].file();return s;}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function checkUploads(previous:UploadRows,actual:UploadRows):void{const rows=new Map(actual.map(r=>[r["asset"],r]));for(const before of previous){const now=rows.get(before.asset);if(!now||now.mime!==before.mime||now.bytes!==before.bytes||now.width!==before.width||now.height!==before.height||now.epoch<before.epoch||now.attempts<before.attempts||before.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==before.storageRef))fail();}}
function payloadReference(value:unknown):PayloadRef{const r=fields(value,'bytes,sha256');if(typeof r["bytes"]!=='number'||!Number.isSafeInteger(r["bytes"])||r["bytes"]<1||typeof r["sha256"]!=='string'||!/^[a-f0-9]{64}$/.test(r["sha256"]))fail();return{bytes:r["bytes"],sha256:r["sha256"]};}

export class FlatLocalArchive{
 readonly #constructorKey=key;
 private constructor(token:object,value:State){if(token!==this.#constructorKey)fail();owners.set(this,value);Object.freeze(this);}
 file():Blob{return state(this).graph.file();}
 selection():LocalOperationBackupSelection{return structuredClone(state(this).selection);}
 originalFile():Blob{return state(this).originalFile;}
 originalRecovery():SharedIndependentHistoryRecovery{return structuredClone(state(this).original);}
 live():SharedIndependentHistoryRecovery{return structuredClone(state(this).live);}
 targets():readonly SharedIndependentHistoryRecovery[]{return structuredClone(state(this).targets);}
 uploads():Blob{return state(this).uploads;}
 entries():UploadRows{return structuredClone(state(this).rows);}
 metadata():Manifest{const s=state(this);return structuredClone({bindings:s["bindings"],assets:s["assets"],assetBytes:s["assetBytes"]});}
 blob(asset:string,generation:string):Blob|undefined{const s=state(this),binding=s["bindings"].find(r=>r["asset"]===asset&&r["generation"]===generation);return binding?s["pixels"].get(binding.contentAsset):undefined;}
 append(next:Blob,check:()=>void,extras:readonly Blob[]):Promise<Graph>{return Graph.append(state(this).graph,next,check,extras);}
 dispose():void{const s=owners.get(this);if(s){owners.delete(this);s["graph"].dispose();}}
 static async read<P extends SharedSelectionPolicy>(file:Blob,supplied:LocalOperationBackupSelection,options:LocalOperationReadOptions<P>):Promise<FlatLocalArchive>{
  if(this!==FlatLocalArchive)fail();try{return await FlatLocalArchive.#read(file,supplied,options);}catch(error){if(error instanceof SyntaxError)throw flatLocalFailure('flat_local_operation_format');throw error;}
 }
 static async #read<P extends SharedSelectionPolicy>(file:Blob,supplied:LocalOperationBackupSelection,options:LocalOperationReadOptions<P>):Promise<FlatLocalArchive>{
  if(this!==FlatLocalArchive)fail();const selection=localOperationBackupSelection(supplied),policy=localPortableReadPolicy(selection.original,options),check=policy.guard;check();let graph:Graph|undefined,originalOwner:IndependentLocalOperationBackup|undefined,uploadOwner:RichAssetArchive|undefined,previous:LocalPortableReplay|undefined,done=false;
  try{
   graph=await Graph.read(file,{manifestSha256:selection.manifestSha256},check);check();const captured=await readFlatLocalStatePayloads(graph,selection.original.identity.source,policy.options.limits,check),first=captured[0];if(!first)fail();check();const firstSelection=localOperationBackupSelection(first["selection"]);if(!same(firstSelection.original,selection.original))fail();
   const seed=await graph.incomingFile(0,check),readOptions={session:policy.options.session,checkAuthority:check,limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})};
   originalOwner=await base.read.call(IndependentLocalOperationBackup,seed,firstSelection,readOptions);check();const original=base.originalRecovery(originalOwner),originalFile=base.originalFile.call(originalOwner),initialLive=base.live.call(originalOwner),old=base.metadata.call(originalOwner),targets:SharedIndependentHistoryRecovery[]=[original];for(const cut of[base.current.call(originalOwner),base.pending.call(originalOwner)])if(cut)targets.push(await localPortableCutRecovery(old.operation,cut));targets.push(initialLive);check();
   const refs=new Map(old.bindings.map(({asset,generation})=>[JSON.stringify([asset,generation]),{asset,generation}])),pixels=new Map<string,Blob>();let rows=base.entries.call(originalOwner),bindings=[...old.bindings],assets:Manifest['assets']=old.assets.map(({part,...asset})=>{void part;return asset;}),assetBytes=old.assetBytes,whole:Blob|undefined,live=initialLive;
   previous=await replayLocalOperationRecovery(selection.original,policy.options.session,initialLive,check);check();
   const admittedGraph=graph,payload=(value:unknown):Blob=>{const r=payloadReference(value);return admittedGraph.payload(r["sha256"],r["bytes"])??fail();};
   const graphMetadata=graph.metadata(),checkedPixels=new Map<string,Awaited<ReturnType<typeof inspectRichRaster>>>();
   for(let index=0;index<graphMetadata.states.length;index++){
    const s=captured[index];if(!s)fail();check();
    const expected=index===0?base.selection.call(originalOwner):{original:selection.original,manifestSha256:graph.incomingSelection(index).manifestSha256};check();if(!same(s["selection"],expected))fail();
    const recipe=graphMetadata.recipes[index];if(!recipe)fail();const id=await readFlatLocalStateIdentity(s["operation"],expected,recipe,check);check();
    const intent=(index===0?readRestoredLocalIntent:readFlatLocalIntent)(s["intent"],id),head=index===0?readRestoredLocalHead:readFlatLocalHead;if(s["observed"]!==null&&s["observed"]!==intent.current&&s["observed"]!==intent.pending||s["observed"]===null&&intent.current!==null)fail();
    const rawCut=async(value:unknown,hash:string|null):Promise<SharedIndependentHistoryRecovery|null>=>{
     if(hash===null){if(value!==null)fail();return null;}const r=fields(value,'head,files');if(!Array.isArray(r["files"])||r["files"].length>126)fail();const headValue=await payload(r["head"]).text(),files:IndependentHistoryCut['files'][number][]=[];check();
     for(const row of r["files"]){const f=fields(row,'lane,generation,kind,sha256,payload');if(f["lane"]!=='document'&&f["lane"]!=='review'||f["kind"]!=='root'&&f["kind"]!=='sealed'||typeof f["generation"]!=='string'||typeof f["sha256"]!=='string')fail();files.push({lane:f["lane"],generation:f["generation"],kind:f["kind"],sha256:f["sha256"],json:await payload(f["payload"]).text()});check();}
     const c=await readOperationCut({head:headValue,files},h=>head(h,id));check();if(await operationCutDigest(c)!==hash)fail();check();return{format:'breditor/shared-independent-history-recovery',formatVersion:1,identity:c["record"].identity,documentCheckpoint:c["documentCheckpoint"],reviewCheckpoint:c["reviewCheckpoint"],versions:c["record"].versions};
    };
    const values:SharedIndependentHistoryRecovery[]=[];for(const[r,hash]of[[s["current"],intent.current],[s["pending"],intent.pending]]as const){const c=await rawCut(r,hash);if(c)values.push(c);}
    if(!Array.isArray(s["live"])||s["live"].length<2||s["live"].length>MAX_INDEPENDENT_SOURCE_RECORDS)fail();const records:SharedIndependentSourceRecord[]=[];
    for(const row of s["live"]){const r=fields(row,'kind,index,payload');if(r["kind"]!=='document'&&r["kind"]!=='review'&&r["kind"]!=='version'||typeof r["index"]!=='number')fail();records.push({kind:r["kind"],index:r["index"],json:await payload(r["payload"]).text()});check();}live=await checkIndependentRecords(selection.original.identity.source,records);check();values.push(live);
    for(const recovery of values){const current=await replayLocalOperationRecovery(selection.original,policy.options.session,recovery,check);let retain=false;try{verifyLocalOperationContinuation(current,previous??fail());const found=localPortableReferences(current.core,recovery,check);if(found.pending.length)fail();for(const ref of found.references)refs.set(JSON.stringify([ref.asset,ref.generation]),ref);previous?.dispose();previous=current;retain=true;}finally{if(!retain)current.dispose();}check();targets.push(recovery);}
    if(!Array.isArray(s["assets"])||s["assets"].length>MAX_OPERATION_RASTER_REFERENCES)fail();
    const imageRows=s["assets"].map(a=>fields(a,'contentAsset,mime,width,height,bytes,payload')),clean=imageRows.map(({payload:ignored,...asset})=>{void ignored;return asset;}),manifest=operationRasterManifest(s["bindings"],clean,s["assetBytes"],policy.options.limits),references=[...refs.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0);if(!same(references,manifest.bindings.map(({asset,generation})=>({asset,generation}))))fail();
    const bindingsByIdentity=new Map(manifest.bindings.map(r=>[JSON.stringify([r["asset"],r["generation"]]),r]));for(const before of bindings)if(!same(bindingsByIdentity.get(JSON.stringify([before.asset,before.generation])),before))fail();
    for(let at=0;at<manifest.assets.length;at++){const asset=manifest.assets[at]??fail(),imageRow=imageRows[at]??fail(),cacheKey=JSON.stringify([asset.contentAsset,asset.mime,asset.width,asset.height,asset.bytes,imageRow["payload"]]);let image=checkedPixels.get(cacheKey);if(!image){image=await inspectRichRaster(new Blob([payload(imageRow["payload"])],{type:asset.mime}),{limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})});check();if(image.asset!==asset.contentAsset||image.mime!==asset.mime||image.bytes!==asset.bytes||image.width!==asset.width||image.height!==asset.height)fail();checkedPixels.set(cacheKey,image);}check();pixels.set(image.asset,image.blob);}
    whole=payload(s["uploads"]);uploadOwner=await readAssets(whole,{limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})});check();const nextRows=assetEntries.call(uploadOwner);checkUploads(rows,nextRows);rows=nextRows;whole=assetBackup.call(uploadOwner);disposeAssets.call(uploadOwner);uploadOwner=undefined;bindings=manifest.bindings;assets=manifest.assets;assetBytes=manifest.assetBytes;check();
   }
   if(!whole)fail();previous?.dispose();previous=undefined;base.dispose.call(originalOwner);originalOwner=undefined;check();const result=new FlatLocalArchive(key,{graph,selection:structuredClone(selection),original,originalFile,live,targets,uploads:whole,rows,bindings,assets,assetBytes,pixels});done=true;return result;
  }finally{previous?.dispose();if(uploadOwner)disposeAssets.call(uploadOwner);if(originalOwner)base.dispose.call(originalOwner);if(!done)graph?.dispose();}
 }
}
const p=FlatLocalArchive.prototype;
export const flatLocalArchive=Object.freeze({read:FlatLocalArchive.read,file:p.file,selection:p.selection,originalFile:p.originalFile,originalRecovery:p.originalRecovery,live:p.live,targets:p.targets,uploads:p.uploads,entries:p.entries,metadata:p.metadata,blob:p.blob,append:p.append,dispose:p.dispose});
