/** Actual source/upload handoff witness. A durable parent must
 * retain and verify its own cohort record before consuming this witness. */
import type {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {RestoredLocalOperationJournal as Journal} from './journal.js';
import {RestoredLocalOperationJournal,restoredLocalJournalBinding} from './journal.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {independentRecoverySignal} from '../independent_recovery/signal.js';
import {restoredLocalFailure as fail} from './failure.js';
import {restoredLocalUploads as assets,type RestoredLocalParticipantUploads} from './participant_assets.js';
const file=RestoredLocalOperationJournal.prototype.file,blob=RestoredLocalOperationJournal.prototype.blob,key=Object.freeze({});
type Scope=ReturnType<ReturnType<typeof restoredLocalJournalBinding>['borrowRead']>;
interface State{readonly source:object;readonly journal:Journal;readonly uploads:RestoredLocalParticipantUploads;readonly scope:Scope;readonly check:()=>void}
const states=new WeakMap<RestoredLocalParticipantWitness,State>();
export class RestoredLocalParticipantWitness{
 private constructor(token:object,value:State){if(token!==key)throw fail();states.set(this,value);Object.freeze(this);}
 static async prepare(provided:{source:object;journal:Journal;uploads:RestoredLocalParticipantUploads;checkAuthority:()=>void;signal?:AbortSignal}){
  if(this!==RestoredLocalParticipantWitness||!provided||typeof provided!=='object')throw fail();const input={...provided},source=input.source,journal=input.journal,uploads=input.uploads,authority=participantAuthority(input.checkAuthority),signal=independentRecoverySignal(input.signal);
  if(!assets.owns(uploads))throw fail();const scope=restoredLocalJournalBinding(journal).borrowRead(source,authority,signal);let complete=false;
  try{const selected=assets.identity.call(uploads);if(!JSON.parse(scope.identity.plan).cohort)throw fail('restored_local_handoff_parent_required');if(selected.operation!==scope.identity.operation||selected.plan!==scope.identity.plan)throw fail('restored_local_handoff_input_mismatch');const port=independentHistoryNative(source),data=scope.readSource(),stamp=port.stamp(),check=()=>{scope.check();assets.check.call(uploads);port.checkManaged();const actual=port.read();if(port.stamp()!==stamp||actual.documentCheckpoint!==data.documentCheckpoint||actual.reviewCheckpoint!==data.reviewCheckpoint||actual.versions.length!==data.versions.length||actual.versions.some((packet,index)=>packet!==data.versions[index]))throw fail('restored_local_handoff_changed');};
   check();await scope.readSnapshot();check();await assets.verify.call(uploads,check);check();const result=new RestoredLocalParticipantWitness(key,{source,journal,uploads,scope,check});complete=true;return result;
  }finally{if(!complete)scope.release();}
 }
 check():void{const s=states.get(this);if(!s)throw fail('restored_local_handoff_closed');s.check();}
 take<P extends SharedSelectionPolicy>(source:Session<P>){const s=states.get(this);if(!s)throw fail('restored_local_handoff_closed');if(s.source!==source)throw fail('restored_local_handoff_source_mismatch');s.check();
  // No authority callback or await follows the exact native/policy comparison.
  const uploads=assets.release.call(s.uploads);states.delete(this);s.scope.release();return Object.freeze({source:Object.freeze({session:source}),uploads,input:Object.freeze({file:()=>file.call(s.journal),blob:(asset:string,generation:string)=>blob.call(s.journal,asset,generation)})});
 }
 release():void{const s=states.get(this);if(!s)return;states.delete(this);s.scope.release();}
}
