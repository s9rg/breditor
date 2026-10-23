/** Capture original/current/pending and newer live work without flush, retry or network activation.
 * Read authorization is independent of the owned source's expired write grant or write signal. */
import {RichAssetStore,RichAssetArchive,readRichAssetBackup,type RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {SharedAssetBytesResolver,SharedAssetBytesPending} from '../asset_bytes/types.js';
import {checkAssetBytesSignal} from '../asset_bytes/guards.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {resolveSelectedAssetBytes} from '../asset_bytes/resolve.js';
import {independentDeliverySource} from '../independent_delivery_source/admission.js';
import {independentDeliveryRecords} from '../independent_delivery_source/records.js';
import {prepareIndependentDeliveryRecovery,type PreparedIndependentDeliveryRecovery} from '../independent_delivery_recovery/prepare.js';
import {deliveryRecoveryArchive as archive} from '../independent_delivery_recovery/archive.js';
import {SharedIndependentDeliveryParticipantBackup} from '../independent_delivery_participant/backup.js';
import {operationJournalBinding,type IndependentOperationCutJournal} from './cut_journal.js';
import {portableReadPolicy,type IndependentOperationReadOptions} from './portable_policy.js';
import {portableRecoveryReferences} from './portable_references.js';
import {replayPortableRecovery} from './portable_replay.js';
import {IndependentNativeOperationOrigin} from './native_origin.js';
import {encodeOperationPortable} from './portable_codec.js';
import {IndependentOperationBackup,portableOperationArchive} from './portable_backup.js';
import {operationJournalFailure as fail} from './journal_failure.js';
const captureAssets=RichAssetStore.prototype.captureBackup,readAssets=readRichAssetBackup,assetBlob=RichAssetArchive.prototype.blob,disposeAssets=RichAssetArchive.prototype.dispose;
const readOriginalBlob=SharedIndependentDeliveryParticipantBackup.prototype.blob;
const readOrigin=IndependentNativeOperationOrigin.read,verifyReadOrigin=IndependentNativeOperationOrigin.prototype.verifyReadableCore,disposeOrigin=IndependentNativeOperationOrigin.prototype.dispose;
export interface IndependentOperationCaptureOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends IndependentOperationReadOptions<P>{readonly source:SharedIndependentDeliverySession<P>;readonly assets:RichAssetStore;readonly resolveAsset?:SharedAssetBytesResolver}
export async function captureIndependentOperationBackup<P extends SharedSelectionPolicy>(input:IndependentOperationCaptureOptions<P>):Promise<{kind:'ready';backup:IndependentOperationBackup}|{kind:'pending';pending:readonly SharedAssetBytesPending[]}>{
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['source','assets','session','checkAuthority','signal','limits','resolveAsset'].includes(k)))throw fail('independent_operation_backup_policy');
 const{source,assets,signal,resolveAsset}=input,authority=participantAuthority(input.checkAuthority),initial=()=>{checkAssetBytesSignal(signal);authority();checkAssetBytesSignal(signal);},port=independentDeliverySource(source);if(!port.operation)throw fail('independent_operation_required');initial();const reader=operationJournalBinding(port.operation as IndependentOperationCutJournal).borrowRead(source,initial,signal);let policy:ReturnType<typeof portableReadPolicy<P>>;try{policy=portableReadPolicy(reader.expected,input);}catch(error){reader.release();throw error;}const abort=signal??new AbortController().signal;
 let prepared:PreparedIndependentDeliveryRecovery<P>|undefined,origin:IndependentNativeOperationOrigin|undefined,uploads:RichAssetArchive|undefined,stamp:readonly object[]|undefined,result:{kind:'ready';backup:IndependentOperationBackup}|{kind:'pending';pending:readonly SharedAssetBytesPending[]}|undefined;
 const check=()=>{policy.guard();reader.check();if(stamp){const now=port.stamp();if(now.length!==stamp.length||now.some((v,i)=>v!==stamp![i]))throw fail('independent_operation_capture_changed');}};
 try{
  check();let live:ReturnType<typeof reader.readSource>|undefined,liveReferences:ReturnType<typeof portableRecoveryReferences>|undefined;
  const assetCut=await captureAssets.call(assets,()=>{check();stamp=port.stamp();live=reader.readSource();liveReferences=portableRecoveryReferences(port.core,live,check);check();return undefined;},signal?{signal}:{});check();const cut=await reader.readSnapshot();check();prepared=await prepareIndependentDeliveryRecovery(policy,cut.file);check();uploads=await readAssets(assetCut.backup,{limits:policy.options.limits,...(signal?{signal}:{})});check();
  // The live source is checked by its own journal/origin. Temporary replays
  // belong to the independently selected reader factory, which may be another
  // instance of the same runtime. Re-admit the exact original in that runtime;
  // never pass the live runtime's native owner into the reader's bindings.
  origin=await readOrigin.call(IndependentNativeOperationOrigin,prepared);check();
  const refs=new Map<string,RichRetainedAssetReference>(),pending:SharedAssetBytesPending[]=[],add=(value:ReturnType<typeof portableRecoveryReferences>)=>{for(const ref of value.references)refs.set(JSON.stringify([ref.asset,ref.generation]),ref);if(value.pending.length)pending.push({kind:'source',pending:value.pending});};add(liveReferences!);
  const values=[archive.recovery.call(prepared.backup)];for(const selected of[cut.current,cut.pending])if(selected)values.push(await reader.recovery(selected));check();
  for(const recovery of values){const replica=await replayPortableRecovery(prepared.factory,recovery,check);try{verifyReadOrigin.call(origin,replica.core,recovery.source.versions);add(portableRecoveryReferences(replica.core,recovery,replica.check));replica.check();}finally{replica.dispose();}check();}
  if(pending.length){result={kind:'pending',pending};return result;}
  const references=[...refs.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),local=uploads,original=prepared.backup;
  const resolved=await resolveSelectedAssetBytes(references,async(ref,requested)=>{check();const blob=assetBlob.call(local,ref.asset);if(blob)return{...ref,identity:'content-addressed',blob,check(){check();}};const retained=originalBlobFor(original,ref.asset,ref.generation);if(retained)return{...ref,identity:/^sha256:[a-f0-9]{64}$/.test(ref.asset)?'content-addressed':'host-verified',blob:retained,check(){check();}};return resolveAsset?await resolveAsset(ref,requested):undefined;},policy.options.limits,check,abort);check();
  if(resolved.missing.length){result={kind:'pending',pending:resolved.missing};return result;}
  const liveCheck=()=>{check();resolved.check();check();},encoded=await encodeOperationPortable({operation:reader.identity,original:reader.expected,originalFile:cut.file,intent:cut.record,observed:cut.observed,current:cut.current,pending:cut.pending,live:independentDeliveryRecords(live!),uploads:assetCut.backup,bindings:resolved.bindings,assets:resolved.assets,assetBytes:resolved.assetBytes,payloads:resolved.payloads},liveCheck);liveCheck();const backup=await portableOperationArchive.read.call(IndependentOperationBackup,encoded.file,encoded.selection,{session:policy.options.session,checkAuthority:policy.guard,limits:policy.options.limits,...(signal?{signal}:{})});result={kind:'ready',backup};liveCheck();return result;
 }finally{
  try{if(uploads)disposeAssets.call(uploads);if(origin)disposeOrigin.call(origin);if(prepared)archive.dispose.call(prepared.backup);if(result)check();}catch(error){if(result?.kind==='ready')portableOperationArchive.dispose.call(result.backup);throw error;}finally{reader.release();}
 }
}
function originalBlobFor(original:SharedIndependentDeliveryParticipantBackup,asset:string,generation:string):Blob|undefined{return readOriginalBlob.call(original,asset,generation);}
