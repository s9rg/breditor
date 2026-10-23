/** Actual source/upload handoff witness. A durable parent must
 * retain and verify its own cohort record before consuming this witness. */
import type {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import type {SharedSelectionPolicy} from '../types.js';
import {prepareNativeInputHandoff} from '../native_input_operation/handoff.js';
import type {RestoredLocalOperationJournal as Journal} from './journal.js';
import {RestoredLocalOperationJournal,restoredLocalJournalBinding} from './journal.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {independentRecoverySignal} from '../independent_recovery/signal.js';
import {restoredLocalFailure as fail} from './failure.js';
import {restoredLocalUploads as assets,type RestoredLocalParticipantUploads} from './participant_assets.js';
const file=RestoredLocalOperationJournal.prototype.file,blob=RestoredLocalOperationJournal.prototype.blob,key=Object.freeze({});
type Scope=ReturnType<ReturnType<typeof restoredLocalJournalBinding>['borrowRead']>;
interface State{readonly source:object;readonly journal:Journal;readonly uploads:RestoredLocalParticipantUploads;readonly scope:Scope;readonly check:()=>void;readonly current:()=>void;exposed:boolean}
const states=new WeakMap<RestoredLocalParticipantWitness,State>();
function state(owner:RestoredLocalParticipantWitness):State{const value=states.get(owner);if(!value?.exposed)throw fail('restored_local_handoff_closed');return value;}
export class RestoredLocalParticipantWitness{
 private constructor(token:object,value:State){if(token!==key)throw fail();states.set(this,value);Object.freeze(this);}
 static async prepare(provided:{source:object;journal:Journal;uploads:RestoredLocalParticipantUploads;checkAuthority:()=>void;signal?:AbortSignal}){
  if(this!==RestoredLocalParticipantWitness||!provided||typeof provided!=='object')throw fail();const input={...provided},source=input.source,journal=input.journal,uploads=input.uploads,authority=participantAuthority(input.checkAuthority),signal=independentRecoverySignal(input.signal);
  if(!assets.owns(uploads))throw fail();const scope=restoredLocalJournalBinding(journal).borrowRead(source,authority,signal);let complete=false;
  try{const selected=assets.identity.call(uploads);if(!JSON.parse(scope.identity.plan).cohort)throw fail('restored_local_handoff_parent_required');if(selected.operation!==scope.identity.operation||selected.plan!==scope.identity.plan)throw fail('restored_local_handoff_input_mismatch');const port=independentHistoryNative(source),data=scope.readSource(),stamp=port.stamp(),check=()=>{scope.check();assets.check.call(uploads);port.checkManaged();const actual=port.read();if(port.stamp()!==stamp||actual.documentCheckpoint!==data.documentCheckpoint||actual.reviewCheckpoint!==data.reviewCheckpoint||actual.versions.length!==data.versions.length||actual.versions.some((packet,index)=>packet!==data.versions[index]))throw fail('restored_local_handoff_changed');};
   const current=()=>{scope.checkCurrent();assets.check.call(uploads);port.checkManaged();if(port.stamp()!==stamp)throw fail('restored_local_handoff_changed');};
   check();await scope.readSnapshot();check();await assets.verify.call(uploads,check);check();const value:State={source,journal,uploads,scope,check,current,exposed:false},result=new RestoredLocalParticipantWitness(key,value);check();value.exposed=true;complete=true;return result;
  }finally{if(!complete)scope.release();}
 }
 check():void{state(this).check();}
 prepareHandoff<P extends SharedSelectionPolicy>(source:Session<P>){const s=state(this);if(s.source!==source)throw fail('restored_local_handoff_source_mismatch');
  const current=()=>{if(states.get(this)!==s)throw fail('restored_local_handoff_closed');s.current();};
  return prepareNativeInputHandoff({source,check:()=>{current();s.check();current();},current,uploads:()=>assets.release.call(s.uploads),release:()=>{states.delete(this);s.scope.release();},file:()=>file.call(s.journal),blob:(asset,generation)=>blob.call(s.journal,asset,generation),closed:()=>fail('restored_local_handoff_closed')});
 }
 take<P extends SharedSelectionPolicy>(source:Session<P>){const handoff=this.prepareHandoff(source);try{handoff.check();handoff.checkCurrent();handoff.consume();return handoff.value;}catch(error){handoff.abandon();throw error;}
 }
 release():void{const s=states.get(this);if(!s)return;if(!s.exposed)throw fail('restored_local_handoff_closed');states.delete(this);s.scope.release();}
}
