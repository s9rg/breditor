/** A held read-only native prefix from an actual local input/source pair.
 * The imported input is compared literally; later LIVE must continue both
 * native lanes and the ordered version catalog in the fresh reader's runtime.
 * This is neither a same-point export nor room readiness or writer custody. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {LocalOperationBackupSelection} from '../independent_local_operation/portable_contract.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {localPortableReadPolicy} from '../independent_local_operation/portable_policy.js';
import {portableLocalOperationArchive as snapshot} from '../independent_local_operation/portable_backup.js';
import {flatLocalArchive as flat} from '../flat_local_operation/archive.js';
import {ownsRestoredLocalJournal,restoredLocalJournalBinding} from '../restored_local_operation/journal.js';
import {ownsFlatLocalJournal,flatLocalJournalBinding} from '../flat_local_operation/journal.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation,type LocalPortableReplay} from '../independent_local_operation/portable_replay.js';
import {independentRecords} from '../independent_source/records.js';
import {freezeGeneration} from '../generation_source/identity.js';
import {registerCapturedNativeHistory,releaseCapturedNativeHistory,capturedNativeHistoryRead,capturedNativeHistoryFinalCheck} from '../native_history_read/registry.js';
import type {NativeInputReadScope,NativeInputCutIntent} from './journal_contract.js';
import type {NativeInputIncomingArchive,NativeInputIncomingSourceOptions} from './incoming_source_contract.js';
import {verifyNativeInputIncomingLiteral} from './incoming_literal.js';
import {nativeInputIncomingFailure as fail} from './incoming_source_failure.js';

interface ArchiveSnapshot{
 readonly input:NativeInputIncomingArchive;readonly expected:LocalOperationBackupSelection;
 readonly file:Blob;readonly live:SharedIndependentHistoryRecovery;readonly check:()=>void;
}
interface State{
 readonly archive:ArchiveSnapshot;readonly reader:NativeInputReadScope<NativeInputCutIntent>;
 readonly snapshot:Readonly<{metadata:Readonly<{identity:SharedIndependentHistoryRecovery['identity']}>;records:ReturnType<typeof independentRecords>}>;
 readonly check:()=>void;readonly current:()=>void;exposed:boolean;
}
const token=Object.freeze({}),states=new WeakMap<NativeInputIncomingSourceCapture,State>();
function fields(value:unknown,required:readonly string[],optional:readonly string[]=[]):void{
 if(!value||typeof value!=='object'||Array.isArray(value)||required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&!optional.includes(key)))throw fail();
}
function readArchive(provided:NativeInputIncomingArchive):ArchiveSnapshot{
 fields(provided,['kind','backup']);const input={...provided};
 if(input.kind==='snapshot-v1'){
  if(!snapshot.owns(input.backup))throw fail();
  const backup=input.backup,file=snapshot.file.call(backup),expected=snapshot.selection.call(backup),live=snapshot.live.call(backup);
  return{input,expected,file,live,check:()=>{if(snapshot.file.call(backup)!==file)throw fail();}};
 }
 if(input.kind==='flat-local-v1'){
  const backup=input.backup,file=flat.file.call(backup),expected=flat.selection.call(backup),live=flat.live.call(backup);
  return{input,expected,file,live,check:()=>{if(flat.file.call(backup)!==file)throw fail();}};
 }
 throw fail();
}
function checked(owner:NativeInputIncomingSourceCapture,constructing=false):State{
 const state=states.get(owner);if(!state||!constructing&&!state.exposed)throw fail();
 state.check();if(states.get(owner)!==state)throw fail();return state;
}

/** Dispose this borrow before awaiting the source's closure. It holds the real
 * journal read scope; closing it never closes or recreates a native writer. */
export class NativeInputIncomingSourceCapture{
 readonly #brand=token;
 private constructor(key:object,state:State){if(key!==this.#brand)throw fail();states.set(this,state);Object.freeze(this);}
 static async capture<P extends SharedSelectionPolicy>(provided:NativeInputIncomingSourceOptions<P>):Promise<NativeInputIncomingSourceCapture>{
  if(this!==NativeInputIncomingSourceCapture)throw fail();
  fields(provided,['source','input','session','checkAuthority'],['signal','limits']);
  const{source,input,...readOptions}={...provided},archive=readArchive(input),port=independentHistoryNative(source),operation=port.localOperation;
  if(!operation||port.companion)throw fail();
  let binding:ReturnType<typeof restoredLocalJournalBinding>|ReturnType<typeof flatLocalJournalBinding>;
  if(archive.input.kind==='snapshot-v1'&&ownsRestoredLocalJournal(operation))binding=restoredLocalJournalBinding(operation);
  else if(archive.input.kind==='flat-local-v1'&&ownsFlatLocalJournal(operation))binding=flatLocalJournalBinding(operation);
  else throw fail();
  if(JSON.stringify(binding.expected)!==JSON.stringify(archive.expected))throw fail();
  const policy=localPortableReadPolicy(archive.expected.original,readOptions),reader:NativeInputReadScope<NativeInputCutIntent>=binding.borrowRead(source,policy.guard,policy.options.signal,policy.options.session);
  let stamp:object|undefined,older:LocalPortableReplay|undefined,newer:LocalPortableReplay|undefined,owner:NativeInputIncomingSourceCapture|undefined,complete=false;
  const check=()=>{reader.check();archive.check();reader.check();if(stamp&&port.stamp()!==stamp)throw fail();};
  const current=()=>{reader.checkCurrent();archive.check();if(stamp&&port.stamp()!==stamp)throw fail();};
  try{
   check();stamp=port.stamp();const live=reader.readSource();check();
   const cut=await reader.readSnapshot();check();await verifyNativeInputIncomingLiteral(cut.input,archive.file,check);check();
   // Both restorations belong to the independently selected reader runtime.
   // Source A's native pointer is never supplied to a comparison in runtime B.
   older=await replayLocalOperationRecovery(archive.expected.original,policy.options.session,archive.live,check);check();
   newer=await replayLocalOperationRecovery(archive.expected.original,policy.options.session,live,check);check();verifyLocalOperationContinuation(newer,older);check();
   const captured=freezeGeneration({metadata:{identity:newer.recovery.identity},records:independentRecords(newer.recovery)});
   newer.dispose();newer=undefined;older.dispose();older=undefined;check();
   owner=new NativeInputIncomingSourceCapture(token,{archive,reader,snapshot:captured,check,current,exposed:false});
   const actual=owner;
   registerCapturedNativeHistory(actual,port.core,{document:{kind:live.identity.documentHistory,checkpoint:live.documentCheckpoint},review:{kind:live.identity.reviewHistory,checkpoint:live.reviewCheckpoint}},()=>{checked(actual,true);});
   checked(actual,true).exposed=true;complete=true;return actual;
  }finally{
   try{newer?.dispose();}finally{try{older?.dispose();}finally{if(!complete){if(owner){states.delete(owner);releaseCapturedNativeHistory(owner);}reader.release();}}}
  }
 }
 /** Release remains available after permission loss or input/source retirement. */
 dispose():void{const state=states.get(this);if(!state)return;states.delete(this);try{releaseCapturedNativeHistory(this);}finally{state.reader.release();}}
}

/** Match the SAME actual admitted archive, not another file with equal metadata.
 * The registered reader is a lifetime-checked prefix, not a current upload proof. */
export function readNativeInputIncomingSource(provided:Readonly<{input:NativeInputIncomingArchive;source:NativeInputIncomingSourceCapture}>){
 fields(provided,['input','source']);const{input,source}={...provided};fields(input,['kind','backup']);const row={...input},state=checked(source);
 if(row.kind!==state.archive.input.kind||row.backup!==state.archive.input.backup)throw fail();
 const lanes=capturedNativeHistoryRead(source),capture={...state.snapshot,check:()=>{checked(source);}},selected=freezeGeneration(state.archive.expected),result={kind:state.archive.input.kind,selected,capture,lanes};checked(source);
 return result;
}
/** Same held capture, checked after every host callback. The returned closure
 * has no permission/factory hooks; it cannot replace the preceding authorized
 * read or prove upload/provider availability. */
export function nativeInputIncomingFinalCheck(owner:NativeInputIncomingSourceCapture):()=>void{
 const state=checked(owner),native=capturedNativeHistoryFinalCheck(capturedNativeHistoryRead(owner));
 return()=>{if(states.get(owner)!==state||!state.exposed)throw fail();state.current();native();if(states.get(owner)!==state)throw fail();};
}
const capture=NativeInputIncomingSourceCapture.capture,dispose=NativeInputIncomingSourceCapture.prototype.dispose;
export const nativeInputIncomingSource=Object.freeze({
 capture:<P extends SharedSelectionPolicy>(input:NativeInputIncomingSourceOptions<P>)=>capture.call(NativeInputIncomingSourceCapture,input),
 read:readNativeInputIncomingSource,
 dispose:(owner:NativeInputIncomingSourceCapture)=>dispose.call(owner),
 owns:(value:unknown):value is NativeInputIncomingSourceCapture=>!!value&&typeof value==='object'&&states.get(value as NativeInputIncomingSourceCapture)?.exposed===true,
});
