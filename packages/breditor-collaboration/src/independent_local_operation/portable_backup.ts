/** Genuine portable local operation bytes. Reading verifies all four native
 * states without persistent owners, writer leases, relay identities or writes. */
import {RichAssetArchive,readRichAssetBackup,inspectRichRaster,type RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import {prepareIndependentRecovery,type PreparedIndependentRecovery} from '../independent_recovery/prepare.js';
import {independentRecoveryArchive as archive} from '../independent_recovery/archive.js';
import {independentParticipantDigest} from '../independent_participant/codec.js';
import {checkIndependentRecords} from '../independent_source/records.js';
import type {SharedIndependentHistoryRecovery,IndependentHistoryCut} from '../independent_history/contract.js';
import type {SharedIndependentSourceRecord} from '../independent_source/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import {operationCutDigest,copyOperationCut} from '../independent_operation/cut_codec.js';
import {localOperationBackupSelection} from './portable_identity.js';
import {localPortableReadPolicy,type LocalOperationReadOptions} from './portable_policy.js';
import {localPortableCutRecovery,readLocalPortableCut} from './portable_cut.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from './portable_replay.js';
import {localPortableReferences} from './portable_references.js';
import {readLocalOperationPortableHeader,LOCAL_OPERATION_BACKUP_MAGIC,LOCAL_OPERATION_BACKUP_MIME,LOCAL_OPERATION_BACKUP_PREFIX_BYTES,MAX_LOCAL_OPERATION_BACKUP_BYTES,MAX_LOCAL_OPERATION_BACKUP_HEADER_BYTES} from './portable_codec.js';
import type {LocalOperationPortableHeader,LocalOperationBackupSelection,LocalPortableCut} from './portable_contract.js';
import {localJournalFailure as fail} from './journal_failure.js';
const key=Object.freeze({}),readAssets=readRichAssetBackup,assetEntries=RichAssetArchive.prototype.entries,assetDispose=RichAssetArchive.prototype.dispose,assetBackup=RichAssetArchive.prototype.backup;
interface State{file:Blob;header:LocalOperationPortableHeader;original:PreparedIndependentRecovery['backup'];current:IndependentHistoryCut|null;pending:IndependentHistoryCut|null;live:SharedIndependentHistoryRecovery;uploads:RichAssetArchive;payloads:ReadonlyMap<string,Blob>}
const states=new WeakMap<IndependentLocalOperationBackup,State>(),state=(owner:IndependentLocalOperationBackup)=>{const s=states.get(owner);if(!s)throw fail('independent_local_operation_backup_closed');return s;};
export class IndependentLocalOperationBackup{
 readonly #selection:LocalOperationBackupSelection;
 private constructor(token:object,selection:LocalOperationBackupSelection,value:State){if(token!==key)throw fail();this.#selection=structuredClone(selection);states.set(this,value);Object.freeze(this);}
 selection():LocalOperationBackupSelection{return structuredClone(this.#selection);}
 file():Blob{return state(this).file;}
 metadata(){return structuredClone(state(this).header);}
 originalFile():Blob{return archive.file.call(state(this).original);}
 currentCut():IndependentHistoryCut|null{const cut=state(this).current;return cut&&copyOperationCut(cut);}
 pendingCut():IndependentHistoryCut|null{const cut=state(this).pending;return cut&&copyOperationCut(cut);}
 liveSource():SharedIndependentHistoryRecovery{return structuredClone(state(this).live);}
 uploadBackup():Blob{return assetBackup.call(state(this).uploads);}
 uploadEntries(){return assetEntries.call(state(this).uploads);}
 blob(asset:string,generation:string):Blob|undefined{const s=state(this),binding=s.header.bindings.find(r=>r.asset===asset&&r.generation===generation);return binding?s.payloads.get(binding.contentAsset):undefined;}
 dispose():void{const s=states.get(this);if(!s)return;states.delete(this);assetDispose.call(s.uploads);archive.dispose.call(s.original);}
 static async read<P extends SharedSelectionPolicy>(input:Blob,supplied:LocalOperationBackupSelection,options:LocalOperationReadOptions<P>):Promise<IndependentLocalOperationBackup>{
  try{return await IndependentLocalOperationBackup.#read(input,supplied,options);}catch(error){if(error instanceof SyntaxError)throw fail('independent_local_operation_backup_format');throw error;}
 }
 static async #read<P extends SharedSelectionPolicy>(input:Blob,supplied:LocalOperationBackupSelection,options:LocalOperationReadOptions<P>):Promise<IndependentLocalOperationBackup>{
  const selected=localOperationBackupSelection(supplied),policy=localPortableReadPolicy(selected.original,options),check=policy.guard;check();if(!(input instanceof Blob)||input.size<LOCAL_OPERATION_BACKUP_PREFIX_BYTES||input.size>MAX_LOCAL_OPERATION_BACKUP_BYTES)throw fail('independent_local_operation_backup_budget');const file=new Blob([input],{type:LOCAL_OPERATION_BACKUP_MIME}),prefix=new Uint8Array(await file.slice(0,LOCAL_OPERATION_BACKUP_PREFIX_BYTES).arrayBuffer());check();if(LOCAL_OPERATION_BACKUP_MAGIC.some((v,i)=>prefix[i]!==v))throw fail('independent_local_operation_backup_format');const length=new DataView(prefix.buffer).getUint32(LOCAL_OPERATION_BACKUP_MAGIC.length),offset=LOCAL_OPERATION_BACKUP_PREFIX_BYTES+length;if(length<1||length>MAX_LOCAL_OPERATION_BACKUP_HEADER_BYTES||offset>file.size)throw fail('independent_local_operation_backup_budget');
  const encoded=new TextDecoder('utf-8',{fatal:true}).decode(await file.slice(LOCAL_OPERATION_BACKUP_PREFIX_BYTES,offset).arrayBuffer());check();const header=await readLocalOperationPortableHeader(JSON.parse(encoded),file.size-offset,selected,policy.options.limits);check();if(JSON.stringify(header)!==encoded)throw fail('independent_local_operation_backup_format');
  const part=(i:number,type='')=>{const p=header.parts[i]!;return file.slice(offset+p.offset,offset+p.offset+p.bytes,type);};for(const[i,p]of header.parts.entries()){if(await independentParticipantDigest(part(i),policy.options.signal)!==p.sha256)throw fail('independent_local_operation_backup_integrity');check();}
  const text=async(i:number)=>{const value=new TextDecoder('utf-8',{fatal:true}).decode(await part(i).arrayBuffer());check();return value;},cut=async(spec:LocalPortableCut|null):Promise<IndependentHistoryCut|null>=>{if(spec===null)return null;const head=await text(spec.head),files=[];for(const f of spec.files)files.push({lane:f.lane,generation:f.generation,kind:f.kind,sha256:f.sha256,json:await text(f.part)});return{head,files};};
  let prepared:PreparedIndependentRecovery<P>|undefined,uploads:RichAssetArchive|undefined,originalUploads:RichAssetArchive|undefined,complete=false;
  try{
   prepared=await prepareIndependentRecovery(policy,part(0));check();const rawCurrent=await cut(header.current),rawPending=await cut(header.pending),current=rawCurrent&&copyOperationCut(await readLocalPortableCut(header.operation,rawCurrent)),pending=rawPending&&copyOperationCut(await readLocalPortableCut(header.operation,rawPending));for(const[c,id]of[[current,header.intent.current],[pending,header.intent.pending]]as const)if(c&&await operationCutDigest(c)!==id)throw fail('independent_local_operation_backup_integrity');check();
   const records:SharedIndependentSourceRecord[]=[];for(const r of header.live)records.push({kind:r.kind,index:r.index,json:await text(r.part)});const live=await checkIndependentRecords(selected.original.identity.source,records);check();const original=archive.recovery.call(prepared.backup),values=[original];for(const c of[current,pending])if(c)values.push(await localPortableCutRecovery(header.operation,c));values.push(live);check();
   const refs=new Map<string,RichRetainedAssetReference>();let previous:LocalPortableReplay|undefined;
   try{for(const recovery of values){const replica=await replayLocalOperationRecovery(selected.original,policy.options.session,recovery,check);let retained=false;try{if(previous)verifyLocalOperationContinuation(replica,previous);const found=localPortableReferences(replica.core,recovery,replica.check);if(found.pending.length)throw fail('independent_local_operation_backup_pending');for(const r of found.references)refs.set(JSON.stringify([r.asset,r.generation]),r);replica.check();previous?.dispose();previous=replica;retained=true;}finally{if(!retained)replica.dispose();}check();}}finally{previous?.dispose();}
   const references=[...refs.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0);if(JSON.stringify(references)!==JSON.stringify(header.bindings.map(({asset,generation})=>({asset,generation}))))throw fail('independent_local_operation_backup_references');
   const payloads=new Map<string,Blob>();for(const asset of header.assets){const raster=await inspectRichRaster(part(asset.part,asset.mime),{limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})});check();if(raster.asset!==asset.contentAsset||raster.bytes!==asset.bytes||raster.width!==asset.width||raster.height!==asset.height||raster.mime!==asset.mime)throw fail('independent_local_operation_backup_integrity');payloads.set(asset.contentAsset,raster.blob);}
   uploads=await readAssets(part(header.uploads),{limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})});check();const oldBindings=archive.metadata.call(prepared.backup).bindings,bindings=new Map(header.bindings.map(r=>[JSON.stringify([r.asset,r.generation]),r]));for(const before of oldBindings){const now=bindings.get(JSON.stringify([before.asset,before.generation]));if(!now||now.contentAsset!==before.contentAsset||now.identity!==before.identity)throw fail('independent_local_operation_backup_integrity');}
   originalUploads=await readAssets(archive.uploadBackup.call(prepared.backup),{limits:policy.options.limits,...(policy.options.signal?{signal:policy.options.signal}:{})});check();const rows=new Map(assetEntries.call(uploads).map(r=>[r.asset,r]));for(const before of assetEntries.call(originalUploads)){const now=rows.get(before.asset);if(!now||now.mime!==before.mime||now.bytes!==before.bytes||now.width!==before.width||now.height!==before.height||now.epoch<before.epoch||now.attempts<before.attempts||before.status==='uploaded'&&(now.status!=='uploaded'||now.storageRef!==before.storageRef))throw fail('independent_local_operation_uploads_diverged');}
   assetDispose.call(originalUploads);originalUploads=undefined;check();const result=new IndependentLocalOperationBackup(key,selected,{file,header,original:prepared.backup,current,pending,live,uploads,payloads});complete=true;return result;
  }finally{if(originalUploads)assetDispose.call(originalUploads);if(!complete){if(uploads)assetDispose.call(uploads);if(prepared)archive.dispose.call(prepared.backup);}}
 }
}
const p=IndependentLocalOperationBackup.prototype;
/** Canonical genuine methods; structural DTOs never select a live source owner. */
export const portableLocalOperationArchive=Object.freeze({owns:(value:unknown):value is IndependentLocalOperationBackup=>states.has(value as IndependentLocalOperationBackup),read:IndependentLocalOperationBackup.read,file:p.file,selection:p.selection,metadata:p.metadata,originalFile:p.originalFile,originalRecovery:(owner:IndependentLocalOperationBackup)=>archive.recovery.call(state(owner).original),current:p.currentCut,pending:p.pendingCut,live:p.liveSource,uploads:p.uploadBackup,entries:p.uploadEntries,blob:p.blob,dispose:p.dispose});
