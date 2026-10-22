/** Capture exact original/current/pending/live local state and whole uploads.
 * No flush, retry, author acquisition, relay binding or network is performed. */
import {RichAssetStore,RichAssetArchive,readRichAssetBackup,type RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedAssetBytesResolver,SharedAssetBytesPending} from '../asset_bytes/types.js';
import {resolveSelectedAssetBytes} from '../asset_bytes/resolve.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {independentRecords} from '../independent_source/records.js';
import {prepareIndependentRecovery,type PreparedIndependentRecovery} from '../independent_recovery/prepare.js';
import {independentRecoveryArchive as archive} from '../independent_recovery/archive.js';
import {localOperationJournalBinding,type IndependentLocalOperationCutJournal} from './cut_journal.js';
import {localPortableReadPolicy,type LocalOperationReadOptions} from './portable_policy.js';
import {localPortableReferences} from './portable_references.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from './portable_replay.js';
import {localPortableCutRecovery} from './portable_cut.js';
import {encodeLocalOperationPortable} from './portable_codec.js';
import {IndependentLocalOperationBackup,portableLocalOperationArchive} from './portable_backup.js';
import {localJournalFailure as fail} from './journal_failure.js';
const captureAssets=RichAssetStore.prototype.captureBackup,readAssets=readRichAssetBackup,assetBlob=RichAssetArchive.prototype.blob,disposeAssets=RichAssetArchive.prototype.dispose;
export interface LocalOperationCaptureOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends LocalOperationReadOptions<P>{readonly source:SharedIndependentHistoryPersistentSession<P>;readonly assets:RichAssetStore;readonly resolveAsset?:SharedAssetBytesResolver}
export async function captureLocalOperationBackup<P extends SharedSelectionPolicy>(provided:LocalOperationCaptureOptions<P>):Promise<{kind:'ready';backup:IndependentLocalOperationBackup}|{kind:'pending';pending:readonly SharedAssetBytesPending[]}>{
 if(!provided||typeof provided!=='object')throw fail('independent_local_operation_backup_policy');const input={...provided};if(Object.keys(input).some(k=>!['source','assets','session','checkAuthority','signal','limits','resolveAsset'].includes(k)))throw fail('independent_local_operation_backup_policy');
 if(input.resolveAsset!==undefined&&typeof input.resolveAsset!=='function')throw fail('independent_local_operation_backup_policy');
 const{source,assets,resolveAsset,...readOptions}=input,port=independentHistoryNative(source);if(!port.localOperation||port.companion)throw fail('independent_local_operation_required');const binding=localOperationJournalBinding(port.localOperation as IndependentLocalOperationCutJournal),policy=localPortableReadPolicy(binding.expected,readOptions),signal=policy.options.signal,abort=signal??new AbortController().signal;
 const reader=binding.borrowRead(source,policy.guard,signal);let prepared:PreparedIndependentRecovery<P>|undefined,uploads:RichAssetArchive|undefined,stamp:object|undefined,live:SharedIndependentHistoryRecovery|undefined,result:{kind:'ready';backup:IndependentLocalOperationBackup}|{kind:'pending';pending:readonly SharedAssetBytesPending[]}|undefined;
 const check=()=>{policy.guard();reader.check();port.checkManaged();if(stamp&&port.stamp()!==stamp)throw fail('independent_local_operation_capture_changed');};
 try{
  check();let liveReferences:ReturnType<typeof localPortableReferences>|undefined;const assetCut=await captureAssets.call(assets,()=>{check();stamp=port.stamp();live=reader.readSource();liveReferences=localPortableReferences(port.core,live,check);check();return undefined;},signal?{signal}:{});check();const cut=await reader.readSnapshot();check();prepared=await prepareIndependentRecovery(policy,cut.file);check();uploads=await readAssets(assetCut.backup,{limits:policy.options.limits,...(signal?{signal}:{})});check();
  const refs=new Map<string,RichRetainedAssetReference>(),pending:SharedAssetBytesPending[]=[],add=(value:ReturnType<typeof localPortableReferences>)=>{for(const ref of value.references)refs.set(JSON.stringify([ref.asset,ref.generation]),ref);if(value.pending.length)pending.push({kind:'source',pending:value.pending});};add(liveReferences!);
  const values=[archive.recovery.call(prepared.backup)];for(const selected of[cut.current,cut.pending])if(selected)values.push(await localPortableCutRecovery(reader.identity,selected));values.push(live!);check();let previous:LocalPortableReplay|undefined;
  try{for(const recovery of values){const replica=await replayLocalOperationRecovery(reader.expected,policy.options.session,recovery,check);let retained=false;try{if(previous)verifyLocalOperationContinuation(replica,previous);add(localPortableReferences(replica.core,recovery,replica.check));replica.check();previous?.dispose();previous=replica;retained=true;}finally{if(!retained)replica.dispose();}check();}}finally{previous?.dispose();}
  if(pending.length){result={kind:'pending',pending};return result;}
  const references=[...refs.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),local=uploads,original=prepared.backup;
  const resolved=await resolveSelectedAssetBytes(references,async(ref,requested)=>{check();const blob=assetBlob.call(local,ref.asset);if(blob)return{...ref,identity:'content-addressed',blob,check(){check();}};const retained=archive.blob.call(original,ref.asset,ref.generation);if(retained)return{...ref,identity:/^sha256:[a-f0-9]{64}$/.test(ref.asset)?'content-addressed':'host-verified',blob:retained,check(){check();}};return resolveAsset?await resolveAsset(ref,requested):undefined;},policy.options.limits,check,abort);check();
  if(resolved.missing.length){result={kind:'pending',pending:resolved.missing};return result;}
  const liveCheck=()=>{check();resolved.check();check();},encoded=await encodeLocalOperationPortable({operation:reader.identity,original:reader.expected,originalFile:cut.file,intent:cut.record,observed:cut.observed,current:cut.current,pending:cut.pending,live:independentRecords(live!),uploads:assetCut.backup,bindings:resolved.bindings,assets:resolved.assets,assetBytes:resolved.assetBytes,payloads:resolved.payloads},liveCheck);liveCheck();const backup=await portableLocalOperationArchive.read.call(IndependentLocalOperationBackup,encoded.file,encoded.selection,{session:policy.options.session,checkAuthority:policy.guard,limits:policy.options.limits,...(signal?{signal}:{})});result={kind:'ready',backup};liveCheck();return result;
 }finally{
  try{if(uploads)disposeAssets.call(uploads);if(prepared)archive.dispose.call(prepared.backup);if(result)check();}catch(error){if(result?.kind==='ready')portableLocalOperationArchive.dispose.call(result.backup);throw error;}finally{reader.release();}
 }
}
