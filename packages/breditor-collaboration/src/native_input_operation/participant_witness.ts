/** Exact native/upload transfer witness. Family and source custody are genuine;
 * a retained phase or structurally matching value cannot issue a handoff. */
import type {RichAssetStore} from '@breditor/experimental-rich-content';
import {SharedEditorError} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';import type {SharedIndependentHistoryPersistentSession as Session} from '../independent_history/session.js';
import {independentHistoryNative} from '../independent_history/native_port.js';
import {participantAuthority} from '../participant_backup/policy.js';import {independentRecoverySignal} from '../independent_recovery/signal.js';
import {nativeInputJournalFamily,type NativeInputJournalFamily} from './journal_families.js';
import type {NativeInputJournalChoice,NativeInputCutIntent,NativeInputReadScope} from './journal_contract.js';
import {NativeInputParticipantUploads,nativeInputUploads as uploads} from './participant_uploads.js';
export interface NativeInputParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly source:Readonly<{session:Session<P>}>;readonly uploads:RichAssetStore;readonly input:Readonly<{file():Blob;blob(asset:string,generation:string):Blob|undefined}>}
interface State{readonly fail:(suffix?:string)=>SharedEditorError;readonly source:object;readonly uploads:NativeInputParticipantUploads;readonly scope:NativeInputReadScope<NativeInputCutIntent>;readonly check:()=>void;readonly file:()=>Blob;readonly blob:(asset:string,generation:string)=>Blob|undefined;exposed:boolean}
const key=Object.freeze({}),states=new WeakMap<NativeInputParticipantWitness,State>();
function state(owner:NativeInputParticipantWitness):State{const s=states.get(owner);if(!s)throw new SharedEditorError('native_input_witness_closed','Use a genuine live native/upload witness');if(!s.exposed)throw s.fail('handoff_closed');return s;}
export class NativeInputParticipantWitness{
 readonly #constructorKey=key;
 private constructor(token:object,value:State){if(token!==this.#constructorKey)throw new SharedEditorError('native_input_witness_policy','Use a genuine native/upload witness opener');states.set(this,value);Object.freeze(this);}
 static async prepare<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(family:NativeInputJournalFamily<A,C,O,R,F>,provided:{source:object;journal:F;uploads:NativeInputParticipantUploads;checkAuthority:()=>void;signal?:AbortSignal}):Promise<NativeInputParticipantWitness>{
  const intrinsic=nativeInputJournalFamily(family),fail=intrinsic.error;if(this!==NativeInputParticipantWitness||!provided||typeof provided!=='object')throw fail('handoff_policy');const input={...provided};if(Object.keys(input).some(k=>!['source','journal','uploads','checkAuthority','signal'].includes(k)))throw fail('handoff_policy');
  const source=input.source,journal=input.journal,assets=input.uploads,authorize=participantAuthority(input.checkAuthority),signal=independentRecoverySignal(input.signal);if(!uploads.belongs(assets,family))throw fail('handoff_policy');const scope=intrinsic.journal.binding(journal).borrowRead(source,authorize,signal);let done=false;
  try{const identity=uploads.identity.call(assets);if(!uploads.cohort.call(assets))throw fail('handoff_parent_required');if(identity.operation!==scope.identity.operation||identity.plan!==scope.identity.plan)throw fail('handoff_input_mismatch');
   const port=independentHistoryNative(source),data=scope.readSource(),stamp=port.stamp(),check=()=>{scope.check();uploads.check.call(assets);port.checkManaged();const actual=port.read();if(port.stamp()!==stamp||actual.documentCheckpoint!==data.documentCheckpoint||actual.reviewCheckpoint!==data.reviewCheckpoint||actual.versions.length!==data.versions.length||actual.versions.some((packet,index)=>packet!==data.versions[index]))throw fail('handoff_changed');};
   check();await scope.readSnapshot();check();await uploads.verify.call(assets,check);check();const value:State={fail,source,uploads:assets,scope,check,file:()=>intrinsic.journal.file(journal),blob:(asset,generation)=>intrinsic.journal.blob(journal,asset,generation),exposed:false},result=new NativeInputParticipantWitness(key,value);check();value.exposed=true;done=true;return result;
  }finally{if(!done)scope.release();}
 }
 check():void{state(this).check();}
 take<P extends SharedSelectionPolicy>(source:Session<P>):Readonly<NativeInputParticipantParts<P>>{const s=state(this);if(s.source!==source)throw s.fail('handoff_source_mismatch');let committed=false,assets:RichAssetStore|undefined;const ready=()=>{if(!committed||!assets)throw s.fail('handoff_closed');};
  // Prepare/freeze every wrapper BEFORE the final native comparison. Even a
  // trusted reentrant freeze hook cannot read or release untransferred owners.
  const native=Object.freeze({get session(){ready();return source;}}),input=Object.freeze({file:()=>{ready();return s.file();},blob:(asset:string,generation:string)=>{ready();return s.blob(asset,generation);}}),parts=Object.freeze({get source(){ready();return native;},get uploads(){ready();return assets!;},get input(){ready();return input;}});
  s.check();
  // No permission callback, wrapper construction or await follows this check.
  assets=uploads.release.call(s.uploads);states.delete(this);s.scope.release();committed=true;return parts;
 }
 release():void{const s=states.get(this);if(!s)return;if(!s.exposed)throw s.fail('handoff_closed');states.delete(this);s.scope.release();}
}
