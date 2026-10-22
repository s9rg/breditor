/** One genuine parent reserves all six names before authority callbacks. Its
 * journal borrows only the selected two-name subset, not a public bypass flag.
 * Failed child cleanup remains in the real parent rollback ledger for retry. */
import {RecoveryOpeningCustody} from '../participant_recovery/opening_custody.js';
import {RecoveryCleanupScope,type RecoveryCleanupTicket} from '../participant_recovery/cleanup_scope.js';
import {localJournalFailure as fail} from './journal_failure.js';
const key=Object.freeze({});
const errors={policy:()=>fail('independent_local_participant_policy'),busy:()=>fail('independent_local_participant_busy'),storage:()=>fail('independent_local_participant_cleanup')};
let borrow:(owner:LocalOperationParticipantOpening,context:IDBFactory,names:readonly string[],cleanup:()=>Promise<void>)=>RecoveryCleanupTicket;
export class LocalOperationParticipantOpening {
 readonly #context:IDBFactory;readonly #journalNames:readonly string[];readonly #root:RecoveryOpeningCustody;readonly #children:RecoveryCleanupScope;
 #child:RecoveryCleanupTicket|undefined;#closed=false;#rollingBack=false;
 private constructor(token:object,context:IDBFactory,names:readonly string[],root:RecoveryOpeningCustody,children:RecoveryCleanupScope){if(token!==key)throw errors.policy();this.#context=context;this.#journalNames=Object.freeze([...names].sort());this.#root=root;this.#children=children;Object.freeze(this);}
 static async reserve(context:IDBFactory,names:readonly string[],journalNames:readonly string[],cleanup:()=>Promise<void>):Promise<LocalOperationParticipantOpening>{
  if(this!==LocalOperationParticipantOpening||names.length!==6||new Set(names).size!==6||journalNames.length!==2||new Set(journalNames).size!==2||journalNames.some(name=>!names.includes(name))||typeof cleanup!=='function')throw errors.policy();
  const children=new RecoveryCleanupScope(errors.storage),root=await RecoveryOpeningCustody.reserve(context,names,async()=>{await children.drain();await cleanup();},errors);
  return new LocalOperationParticipantOpening(key,context,journalNames,root,children);
 }
 complete():void{if(this.#closed||this.#rollingBack||this.#child||this.#children.pending)throw errors.busy();this.#root.complete();this.#closed=true;}
 rollback():Promise<void>{if(this.#closed)return Promise.resolve();this.#rollingBack=true;return this.#root.rollback().then(()=>{this.#closed=true;});}
 static{borrow=(owner,context,names,cleanup)=>{
  if(!owner||typeof owner!=='object'||!(#context in owner)||owner.#closed||owner.#rollingBack)throw errors.policy();
  if(context!==owner.#context||names.length!==2||JSON.stringify([...names].sort())!==JSON.stringify(owner.#journalNames)||typeof cleanup!=='function')throw errors.policy();
  if(owner.#child||owner.#children.pending)throw errors.busy();const actual=owner.#children.retain(cleanup);owner.#child=actual;let complete=false;
  return Object.freeze({complete(){if(complete||owner.#closed||owner.#rollingBack||owner.#child!==actual)throw errors.busy();actual.complete();owner.#child=undefined;complete=true;},async rollback(){if(complete)return;await actual.rollback();if(owner.#child===actual)owner.#child=undefined;complete=true;}});
 };}
}
/** Exact brand/context/subset admission. Supplied objects issue no ownership. */
export const localParticipantJournalOpening=(owner:LocalOperationParticipantOpening,context:IDBFactory,names:readonly string[],cleanup:()=>Promise<void>)=>borrow(owner,context,names,cleanup);
