/** Capture actual incoming provenance, CURRENT/PENDING native saves, unsaved
 * LIVE, whole uploads and every retained pixel. No flush, retry, author lease or
 * network is performed. Only actual closed source facades select the seed or
 * append path; options/files/ready-shaped objects cannot select an adapter. */
import {RichAssetStore,RichAssetArchive,readRichAssetBackup,type RichRetainedAssetReference} from '@breditor/experimental-rich-content';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedAssetBytesResolver,SharedAssetBytesPending,SharedAssetByteBinding} from '../asset_bytes/types.js';
import {resolveSelectedAssetBytes} from '../asset_bytes/resolve.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {localPortableReadPolicy,type LocalOperationReadOptions} from '../independent_local_operation/portable_policy.js';
import type {LocalOperationBackupSelection} from '../independent_local_operation/portable_contract.js';
import {localPortableReferences} from '../independent_local_operation/portable_references.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {IndependentLocalOperationBackup,portableLocalOperationArchive as snapshot} from '../independent_local_operation/portable_backup.js';
import {LOCAL_OPERATION_BACKUP_PREFIX_BYTES} from '../independent_local_operation/portable_codec.js';
import {ownsRestoredLocalJournal,restoredLocalJournalBinding} from '../restored_local_operation/journal.js';
import {readRestoredLocalHead} from '../restored_local_operation/head.js';
import type {NativeInputReadScope,NativeInputCutIntent} from '../native_input_operation/journal_contract.js';
import {checkNativeInputUploadContinuation} from '../native_input_operation/upload_baseline.js';
import {readOperationCut} from '../independent_operation/cut_codec.js';
import {FlatLocalArchive,flatLocalArchive as archive} from './archive.js';
import {FlatLocalProvenance,flatLocalFraming as framing} from './framing.js';
import {ownsFlatLocalJournal,flatLocalJournalBinding} from './journal.js';
import {readFlatLocalHead} from './head.js';
import {encodeFlatLocalCaptureState} from './capture_state.js';
import {flatLocalFailure as fail} from './failure.js';
const captureAssets=RichAssetStore.prototype.captureBackup,readAssets=readRichAssetBackup,assetBlob=RichAssetArchive.prototype.blob,assetEntries=RichAssetArchive.prototype.entries,disposeAssets=RichAssetArchive.prototype.dispose;
export interface FlatLocalCaptureOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends LocalOperationReadOptions<P>{readonly source:SharedIndependentHistoryPersistentSession<P>;readonly assets:RichAssetStore;readonly resolveAsset?:SharedAssetBytesResolver}
interface Incoming{readonly live:SharedIndependentHistoryRecovery;readonly bindings:readonly SharedAssetByteBinding[];readonly entries:ReturnType<typeof snapshot.entries>;blob(asset:string,generation:string):Blob|undefined;encode(state:Blob,extras:readonly Blob[],check:()=>void):Promise<FlatLocalProvenance>;dispose():void}
/** Internal closed dispatch. This normalized data port is never accepted in
 * capture options or interpreted as native ownership. */
async function readIncoming<P extends SharedSelectionPolicy>(kind:'snapshot'|'flat',file:Blob,expected:LocalOperationBackupSelection,options:LocalOperationReadOptions<P>):Promise<Incoming>{
 if(kind==='snapshot'){
  const owner=await snapshot.read.call(IndependentLocalOperationBackup,file,expected,options);
  try{const header=snapshot.metadata.call(owner),input=snapshot.file.call(owner),start=LOCAL_OPERATION_BACKUP_PREFIX_BYTES+new TextEncoder().encode(JSON.stringify(header)).length;
   return{live:snapshot.live.call(owner),bindings:header.bindings,entries:snapshot.entries.call(owner),blob:(asset,generation)=>snapshot.blob.call(owner,asset,generation),encode:(state,extras,check)=>framing.seed.call(FlatLocalProvenance,input.slice(0,start),header.parts.map(p=>input.slice(start+p.offset,start+p.offset+p.bytes)),input.type,state,check,extras),dispose:()=>snapshot.dispose.call(owner)};
  }catch(error){snapshot.dispose.call(owner);throw error;}
 }
 const owner=await archive.read.call(FlatLocalArchive,file,expected,options);
 try{return{live:archive.live.call(owner),bindings:archive.metadata.call(owner).bindings,entries:archive.entries.call(owner),blob:(asset,generation)=>archive.blob.call(owner,asset,generation),encode:(state,extras,check)=>archive.append.call(owner,state,check,extras),dispose:()=>archive.dispose.call(owner)};
 }catch(error){archive.dispose.call(owner);throw error;}
}
export async function captureFlatLocalOperation<P extends SharedSelectionPolicy>(provided:FlatLocalCaptureOptions<P>):Promise<{kind:'ready';backup:FlatLocalArchive}|{kind:'pending';pending:readonly SharedAssetBytesPending[]}>{
 if(!provided||typeof provided!=='object')throw fail('flat_local_capture_policy');const input={...provided};if(Object.keys(input).some(k=>!['source','assets','session','checkAuthority','signal','limits','resolveAsset'].includes(k))||input.resolveAsset!==undefined&&typeof input.resolveAsset!=='function')throw fail('flat_local_capture_policy');
 const{source,assets,resolveAsset,...readOptions}=input,port=independentHistoryNative(source),operation=port.localOperation;if(!operation||port.companion)throw fail('flat_local_capture_source');
 // A recognized but closed facade refuses in its own binding. There is no
 // exception-based fallback that could reinterpret it as another family.
 let kind:'snapshot'|'flat',binding:ReturnType<typeof restoredLocalJournalBinding>|ReturnType<typeof flatLocalJournalBinding>;
 if(ownsRestoredLocalJournal(operation)){kind='snapshot';binding=restoredLocalJournalBinding(operation);}else if(ownsFlatLocalJournal(operation)){kind='flat';binding=flatLocalJournalBinding(operation);}else throw fail('flat_local_capture_source');
 const policy=localPortableReadPolicy(binding.expected.original,readOptions),signal=policy.options.signal,reader:NativeInputReadScope<NativeInputCutIntent>=binding.borrowRead(source,policy.guard,signal,policy.options.session),abort=signal??new AbortController().signal;
 let stamp:object|undefined,live:SharedIndependentHistoryRecovery|undefined,incoming:Incoming|undefined,uploads:RichAssetArchive|undefined,graph:FlatLocalProvenance|undefined,result:{kind:'ready';backup:FlatLocalArchive}|{kind:'pending';pending:readonly SharedAssetBytesPending[]}|undefined;
 const check=()=>{policy.guard();reader.check();port.checkManaged();if(stamp&&port.stamp()!==stamp)throw fail('flat_local_capture_changed');};let finalCheck=check;
 try{
  check();let liveReferences:ReturnType<typeof localPortableReferences>|undefined;const captured=await captureAssets.call(assets,()=>{check();stamp=port.stamp();live=reader.readSource();liveReferences=localPortableReferences(port.core,live,check);check();return undefined;},signal?{signal}:{});check();const cut=await reader.readSnapshot();check();
  incoming=await readIncoming(kind,cut.input,reader.expected,{session:policy.options.session,checkAuthority:check,limits:policy.options.limits,...(signal?{signal}:{})});check();uploads=await readAssets(captured.backup,{limits:policy.options.limits,...(signal?{signal}:{})});check();checkNativeInputUploadContinuation(incoming.entries,assetEntries.call(uploads),()=>{throw fail('flat_local_capture_uploads');});
  const refs=new Map<string,RichRetainedAssetReference>(incoming.bindings.map(({asset,generation})=>[JSON.stringify([asset,generation]),{asset,generation}])),pending:SharedAssetBytesPending[]=[],add=(value:ReturnType<typeof localPortableReferences>)=>{for(const ref of value.references)refs.set(JSON.stringify([ref.asset,ref.generation]),ref);if(value.pending.length)pending.push({kind:'source',pending:value.pending});};add(liveReferences!);
  const values=[incoming.live];for(const value of[cut.current,cut.pending])if(value){const c=await readOperationCut(value,h=>(kind==='snapshot'?readRestoredLocalHead:readFlatLocalHead)(h,reader.identity));check();values.push({format:'breditor/shared-independent-history-recovery',formatVersion:1,identity:c.record.identity,documentCheckpoint:c.documentCheckpoint,reviewCheckpoint:c.reviewCheckpoint,versions:c.record.versions});}values.push(live!);check();let previous:LocalPortableReplay|undefined;
  try{for(const recovery of values){const current=await replayLocalOperationRecovery(reader.expected.original,policy.options.session,recovery,check);let retained=false;try{if(previous)verifyLocalOperationContinuation(current,previous);add(localPortableReferences(current.core,recovery,check));previous?.dispose();previous=current;retained=true;}finally{if(!retained)current.dispose();}check();}}finally{previous?.dispose();}
  if(pending.length){result={kind:'pending',pending};return result;}
  const references=[...refs.values()].sort((a,b)=>a.asset<b.asset?-1:a.asset>b.asset?1:a.generation<b.generation?-1:a.generation>b.generation?1:0),oldBindings=new Map(incoming.bindings.map(r=>[JSON.stringify([r.asset,r.generation]),r])),local=uploads,retained=incoming;
  const resolved=await resolveSelectedAssetBytes(references,async(ref,requested)=>{check();const localBlob=assetBlob.call(local,ref.asset),oldBlob=retained.blob(ref.asset,ref.generation);if(localBlob||oldBlob)return{...ref,identity:oldBindings.get(JSON.stringify([ref.asset,ref.generation]))?.identity??(/^sha256:[a-f0-9]{64}$/.test(ref.asset)?'content-addressed':'host-verified'),blob:localBlob??oldBlob!,check};return resolveAsset?await resolveAsset(ref,requested):undefined;},policy.options.limits,check,abort);check();if(resolved.missing.length){result={kind:'pending',pending:resolved.missing};return result;}
  const liveCheck=()=>{check();resolved.check();check();};finalCheck=liveCheck;const encoded=await encodeFlatLocalCaptureState({operation:reader.identity,selection:reader.expected,intent:cut.record,observed:cut.observed,current:cut.current,pending:cut.pending,live:live!,uploads:captured.backup,bindings:resolved.bindings,assets:resolved.assets,assetBytes:resolved.assetBytes,payloads:resolved.payloads},liveCheck);liveCheck();graph=await incoming.encode(encoded.state,encoded.extras,liveCheck);liveCheck();const backup=await archive.read.call(FlatLocalArchive,framing.file.call(graph),{original:reader.expected.original,...framing.selection.call(graph)},{session:policy.options.session,checkAuthority:liveCheck,limits:policy.options.limits,...(signal?{signal}:{})});result={kind:'ready',backup};liveCheck();return result;
 }finally{
  try{if(uploads)disposeAssets.call(uploads);incoming?.dispose();if(graph)framing.dispose.call(graph);if(result)finalCheck();}catch(error){if(result?.kind==='ready')archive.dispose.call(result.backup);throw error;}finally{reader.release();}
 }
}
