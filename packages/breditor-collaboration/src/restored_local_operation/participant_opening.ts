/** Actual four-name opening custody. A genuine child may borrow only its exact
 * native pair inside that same context/cohort; no saved field issues this right. */
import {RecoveryOpeningCustody} from '../participant_recovery/opening_custody.js';
import {RecoveryCleanupScope,type RecoveryCleanupTicket} from '../participant_recovery/cleanup_scope.js';
import {restoredLocalFailure as fail} from './failure.js';
const key=Object.freeze({}),errors={policy:()=>fail('restored_local_participant_policy'),busy:()=>fail('restored_local_participant_busy'),storage:()=>fail('restored_local_participant_cleanup')};
let borrow:(parent:RestoredLocalParticipantOpening,context:IDBFactory,subset:readonly string[],cohort:readonly string[],cleanup:()=>Promise<void>)=>RecoveryCleanupTicket;
let borrowAssets:typeof borrow;
export class RestoredLocalParticipantOpening{
 readonly #context:IDBFactory;readonly #names:readonly string[];readonly #subset:readonly string[];readonly #uploads:string;readonly #root:RecoveryOpeningCustody;readonly #children:RecoveryCleanupScope;
 #child:RecoveryCleanupTicket|undefined;#closed=false;#rollingBack=false;
 private constructor(token:object,context:IDBFactory,names:readonly string[],subset:readonly string[],uploads:string,root:RecoveryOpeningCustody,children:RecoveryCleanupScope){if(token!==key)throw errors.policy();this.#context=context;this.#names=Object.freeze([...names].sort());this.#subset=Object.freeze([...subset].sort());this.#uploads=uploads;this.#root=root;this.#children=children;Object.freeze(this);}
 static async reserve(context:IDBFactory,names:readonly string[],subset:readonly string[],uploads:string,cleanup:()=>Promise<void>):Promise<RestoredLocalParticipantOpening>{
  if(this!==RestoredLocalParticipantOpening||names.length!==4||new Set(names).size!==4||subset.length!==2||new Set(subset).size!==2||subset.some(name=>!names.includes(name))||!names.includes(uploads)||subset.includes(uploads)||typeof cleanup!=='function')throw errors.policy();
  const children=new RecoveryCleanupScope(errors.storage),root=await RecoveryOpeningCustody.reserve(context,names,async()=>{await children.drain();await cleanup();},errors);return new RestoredLocalParticipantOpening(key,context,names,subset,uploads,root,children);
 }
 complete():void{if(this.#closed||this.#rollingBack||this.#child||this.#children.pending)throw errors.busy();this.#root.complete();this.#closed=true;}
 rollback():Promise<void>{if(this.#closed)return Promise.resolve();this.#rollingBack=true;return this.#root.rollback().then(()=>{this.#closed=true;});}
 static{const selected=(parent:RestoredLocalParticipantOpening,context:IDBFactory,subset:readonly string[],cohort:readonly string[],cleanup:()=>Promise<void>,kind:'native'|'assets')=>{
  if(!parent||typeof parent!=='object'||!(#context in parent)||parent.#closed||parent.#rollingBack||context!==parent.#context||cohort.length!==4||JSON.stringify([...subset].sort())!==JSON.stringify(kind==='native'?parent.#subset:[parent.#uploads])||JSON.stringify([...cohort].sort())!==JSON.stringify(parent.#names)||typeof cleanup!=='function')throw errors.policy();
  if(parent.#child||parent.#children.pending)throw errors.busy();const actual=parent.#children.retain(cleanup);parent.#child=actual;let done=false;return Object.freeze({complete(){if(done||parent.#closed||parent.#rollingBack||parent.#child!==actual)throw errors.busy();actual.complete();parent.#child=undefined;done=true;},async rollback(){if(done)return;await actual.rollback();if(parent.#child===actual)parent.#child=undefined;done=true;}});
 };borrow=(...args)=>selected(...args,'native');borrowAssets=(...args)=>selected(...args,'assets');}
}
export const restoredLocalJournalOpening=(parent:RestoredLocalParticipantOpening,context:IDBFactory,subset:readonly string[],cohort:readonly string[],cleanup:()=>Promise<void>)=>borrow(parent,context,subset,cohort,cleanup);
export const restoredLocalAssetsOpening=(parent:RestoredLocalParticipantOpening,context:IDBFactory,subset:readonly string[],cohort:readonly string[],cleanup:()=>Promise<void>)=>borrowAssets(parent,context,subset,cohort,cleanup);
