/** Genuine portable operation data. Reading bytes never opens persistent owners or grants writes. */
import {RichAssetArchive,readRichAssetBackup,inspectRichRaster,type RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import {prepareIndependentDeliveryRecovery,type PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import {deliveryRecoveryArchive as archive} from '../independent_delivery_recovery/archive.js';
import {independentDeliveryParticipantDigest} from '../independent_delivery_participant/codec.js';
import {checkIndependentDeliveryRecords} from '../independent_delivery_source/records.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import type {IndependentHistoryCut} from '../independent_history/contract.js';
import type {SharedIndependentDeliverySourceRecord} from '../independent_delivery_source/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import {IndependentNativeOperationOrigin} from './native_origin.js';
import {operationCutDigest,copyOperationCut} from './cut_codec.js';
import {operationBackupSelection} from './portable_identity.js';
import {portableReadPolicy,type IndependentOperationReadOptions} from './portable_policy.js';
import {portableCutRecovery,readPortableCut} from './portable_cut.js';
import {replayPortableRecovery,verifyPortableContinuation} from './portable_replay.js';
import {portableRecoveryReferences} from './portable_references.js';
import {portableOriginalLayout} from './portable_original_uploads.js';
import {readOperationPortableHeader,OPERATION_BACKUP_MAGIC,OPERATION_BACKUP_MIME,OPERATION_BACKUP_PREFIX_BYTES,MAX_OPERATION_BACKUP_BYTES,MAX_OPERATION_BACKUP_HEADER_BYTES} from './portable_codec.js';
import type {IndependentOperationPortableHeader,IndependentOperationBackupSelection,OperationPortableCut} from './portable_contract.js';
import {operationJournalFailure as fail} from './journal_failure.js';
const key=Object.freeze({}),readAssets=readRichAssetBackup,assetEntries=RichAssetArchive.prototype.entries,assetDispose=RichAssetArchive.prototype.dispose,assetBackup=RichAssetArchive.prototype.backup;
const originRead=IndependentNativeOperationOrigin.read,originVerify=IndependentNativeOperationOrigin.prototype.verifyCore,originDispose=IndependentNativeOperationOrigin.prototype.dispose;
interface State {file:Blob;header:IndependentOperationPortableHeader;original:PreparedIndependentDeliveryRecovery['backup'];current:IndependentHistoryCut|null;pending:IndependentHistoryCut|null;live:SharedIndependentDeliveryRecovery;uploads:RichAssetArchive;payloads:ReadonlyMap<string,Blob>}
const states=new WeakMap<IndependentOperationBackup,State>(),state=(owner:IndependentOperationBackup)=>{const s=states.get(owner);if(!s)throw fail('independent_operation_backup_closed');return s;};
export class IndependentOperationBackup {
 readonly #selection:IndependentOperationBackupSelection;
 private constructor(token:object,selection:IndependentOperationBackupSelection,value:State){if(token!==key)throw fail();this.#selection=structuredClone(selection);states.set(this,value);Object.freeze(this);}
 selection():IndependentOperationBackupSelection{return structuredClone(this.#selection);}
 file():Blob{return state(this).file;}
 metadata(){return structuredClone(state(this).header);}
 originalFile():Blob{return archive.file.call(state(this).original);}
 currentCut():IndependentHistoryCut|null{const cut=state(this).current;return cut&&copyOperationCut(cut);}
 pendingCut():IndependentHistoryCut|null{const cut=state(this).pending;return cut&&copyOperationCut(cut);}
 liveSource():SharedIndependentDeliveryRecovery{return structuredClone(state(this).live);}
 uploadBackup():Blob{return assetBackup.call(state(this).uploads);}
 uploadEntries(){return assetEntries.call(state(this).uploads);}
 blob(asset:string,generation:string):Blob|undefined{const s=state(this),binding=s.header.bindings.find(r=>r.asset===asset&&r.generation===generation);return binding?s.payloads.get(binding.contentAsset):undefined;}
 dispose():void{const s=states.get(this);if(!s)return;states.delete(this);assetDispose.call(s.uploads);archive.dispose.call(s.original);}
 static async read<P extends SharedSelectionPolicy>(input:Blob,supplied:IndependentOperationBackupSelection,options:IndependentOperationReadOptions<P>):Promise<IndependentOperationBackup>{
  try{return await IndependentOperationBackup.#read(input,supplied,options);}catch(error){if(error instanceof SyntaxError)throw fail('independent_operation_backup_format');throw error;}
 }
 static async #read<P extends SharedSelectionPolicy>(input:Blob,supplied:IndependentOperationBackupSelection,options:IndependentOperationReadOptions<P>):Promise<IndependentOperationBackup>{
  if(!options||typeof options!=='object'||Object.keys(options).some(k=>!['session','checkAuthority','signal','limits'].includes(k)))throw fail('independent_operation_backup_policy');
  const selected=operationBackupSelection(supplied),policy=portableReadPolicy(selected.original,options),check=policy.guard;check();if(!(input instanceof Blob)||input.size<OPERATION_BACKUP_PREFIX_BYTES||input.size>MAX_OPERATION_BACKUP_BYTES)throw fail('independent_operation_backup_budget');const file=new Blob([input],{type:OPERATION_BACKUP_MIME}),prefix=new Uint8Array(await file.slice(0,OPERATION_BACKUP_PREFIX_BYTES).arrayBuffer());check();if(OPERATION_BACKUP_MAGIC.some((v,i)=>prefix[i]!==v))throw fail('independent_operation_backup_format');const length=new DataView(prefix.buffer).getUint32(OPERATION_BACKUP_MAGIC.length),offset=OPERATION_BACKUP_PREFIX_BYTES+length;if(length<1||length>MAX_OPERATION_BACKUP_HEADER_BYTES||offset>file.size)throw fail('independent_operation_backup_budget');
  const encoded=new TextDecoder('utf-8',{fatal:true}).decode(await file.slice(OPERATION_BACKUP_PREFIX_BYTES,offset).arrayBuffer());check();const header=await readOperationPortableHeader(JSON.parse(encoded),file.size-offset,selected,policy.options.limits);check();if(JSON.stringify(header)!==encoded)throw fail('independent_operation_backup_format');
  const part=(i:number,type='')=>{const p=header.parts[i]!;return file.slice(offset+p.offset,offset+p.offset+p.bytes,type);};for(const[i,p]of header.parts.entries()){if(await independentDeliveryParticipantDigest(part(i),policy.options.signal)!==p.sha256)throw fail('independent_operation_backup_integrity');check();}
  const text=async(i:number)=>{const value=new TextDecoder('utf-8',{fatal:true}).decode(await part(i).arrayBuffer());check();return value;};const cut=async(spec:OperationPortableCut|null):Promise<IndependentHistoryCut|null>=>{if(spec===null)return null;const head=await text(spec.head),files=[];for(const f of spec.files)files.push({lane:f.lane,generation:f.generation,kind:f.kind,sha256:f.sha256,json:await text(f.part)});return{head,files};};
  let prepared:PreparedIndependentDeliveryRecovery<P>|undefined,origin:IndependentNativeOperationOrigin|undefined,uploads:RichAssetArchive|undefined,originalUploads:RichAssetArchive|undefined,complete=false;
  try{
   prepared=await prepareIndependentDeliveryRecovery(policy,part(0));check();origin=await originRead.call(IndependentNativeOperationOrigin,prepared);check();const rawCurrent=await cut(header.current),rawPending=await cut(header.pending),current=rawCurrent&&copyOperationCut(await readPortableCut(prepared.factory,header.operation,rawCurrent)),pending=rawPending&&copyOperationCut(await readPortableCut(prepared.factory,header.operation,rawPending));for(const[cut,id]of [[current,header.intent.current],[pending,header.intent.pending]] as const)if(cut&&await operationCutDigest(cut)!==id)throw fail('independent_operation_backup_integrity');
   const liveRecords:SharedIndependentDeliverySourceRecord[]=[];for(const r of header.live)liveRecords.push({kind:r.kind,index:r.index,json:await text(r.part)});const live=await checkIndependentDeliveryRecords(selected.original.identity.source,liveRecords);check();const original=archive.recovery.call(prepared.backup),values:SharedIndependentDeliveryRecovery[]=[original];for(const c of[current,pending])if(c)values.push(await portableCutRecovery(prepared.factory,header.operation,c));values.push(live);check();
   const refs=new Map<string,RichRetainedAssetReference>();let previous:Awaited<ReturnType<typeof replayPortableRecovery>>|undefined,before:SharedIndependentDeliveryRecovery|undefined;
   try{for(const recovery of values){const replica=await replayPortableRecovery(prepared.factory,recovery,check);let retained=false;try{check();originVerify.call(origin,replica.core,recovery.source.versions);if(previous)verifyPortableContinuation(replica,recovery,previous,before!);const found=portableRecoveryReferences(replica.core,recovery,replica.check);if(found.pending.length)throw fail('independent_operation_backup_pending');for(const r of found.references)refs.set(JSON.stringify([r.asset,r.generation]),r);replica.check();previous?.dispose();previous=replica;before=recovery;retained=true;}finally{if(!retained)replica.dispose();}check();}}finally{previous?.dispose();}check();
   const references=[...refs.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0);if(JSON.stringify(references)!==JSON.stringify(header.bindings.map(({asset,generation})=>({asset,generation}))))throw fail('independent_operation_backup_references');
   const payloads=new Map<string,Blob>();for(const asset of header.assets){const raster=await inspectRichRaster(part(asset.part,asset.mime),{limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})});check();if(raster.asset!==asset.contentAsset||raster.bytes!==asset.bytes||raster.width!==asset.width||raster.height!==asset.height||raster.mime!==asset.mime)throw fail('independent_operation_backup_integrity');payloads.set(asset.contentAsset,raster.blob);}
   uploads=await readAssets(part(header.uploads),{limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})});check();const originalLayout=await portableOriginalLayout(part(0),policy.options.limits,check),bindings=new Map(header.bindings.map(r=>[JSON.stringify([r.asset,r.generation]),r]));for(const before of originalLayout.header.metadata.bindings){const now=bindings.get(JSON.stringify([before.asset,before.generation]));if(!now||now.contentAsset!==before.contentAsset||now.identity!==before.identity)throw fail('independent_operation_backup_integrity');}originalUploads=await readAssets(originalLayout.uploads,{limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})});check();const rows=new Map(assetEntries.call(uploads).map(r=>[r.asset,r]));for(const before of assetEntries.call(originalUploads)){const now=rows.get(before.asset);if(!now||now.mime!==before.mime||now.bytes!==before.bytes||now.width!==before.width||now.height!==before.height||now.epoch<before.epoch||now.attempts<before.attempts||before.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==before.storageRef))throw fail('independent_operation_uploads_diverged');}
   assetDispose.call(originalUploads);originalUploads=undefined;originDispose.call(origin);origin=undefined;check();const result=new IndependentOperationBackup(key,selected,{file,header,original:prepared.backup,current,pending,live,uploads,payloads});complete=true;return result;
  }finally{if(originalUploads)assetDispose.call(originalUploads);if(origin)originDispose.call(origin);if(!complete){if(uploads)assetDispose.call(uploads);if(prepared)archive.dispose.call(prepared.backup);}}
 }
}
const p=IndependentOperationBackup.prototype;
/** Canonical genuine archive methods for subsequent capture/restore coordinators. */
export const portableOperationArchive=Object.freeze({owns:(value:unknown):value is IndependentOperationBackup=>states.has(value as IndependentOperationBackup),read:IndependentOperationBackup.read,file:p.file,selection:p.selection,metadata:p.metadata,originalFile:p.originalFile,originalRecovery:(owner:IndependentOperationBackup)=>archive.recovery.call(state(owner).original),current:p.currentCut,pending:p.pendingCut,live:p.liveSource,uploads:p.uploadBackup,entries:p.uploadEntries,blob:p.blob,dispose:p.dispose});
