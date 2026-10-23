/** Family-aware actual four-name custody. Imported records and structural
 * descriptors cannot issue native/upload child tickets. Legacy snapshot
 * opening facades keep their existing private brand and entry points. */
import {RecoveryOpeningCustody} from '../participant_recovery/opening_custody.js';
import {RecoveryCleanupScope,type RecoveryCleanupTicket} from '../participant_recovery/cleanup_scope.js';
import {nativeInputJournalFamily,type NativeInputJournalFamily} from './journal_families.js';
import type {NativeInputJournalChoice,NativeInputCutIntent} from './journal_contract.js';
import {SharedEditorError} from '../core.js';
const key=Object.freeze({});
let borrow:(parent:unknown,family:object,context:IDBFactory,subset:readonly string[],names:readonly string[],cleanup:()=>Promise<void>,kind:'native'|'uploads',fail:(suffix?:string)=>SharedEditorError)=>RecoveryCleanupTicket;
export class NativeInputParticipantOpening{
 readonly #family:object;readonly #context:IDBFactory;readonly #names:readonly string[];readonly #native:readonly string[];readonly #uploads:string;readonly #root:RecoveryOpeningCustody;readonly #children:RecoveryCleanupScope;readonly #fail:(suffix?:string)=>SharedEditorError;
 #child:RecoveryCleanupTicket|undefined;#closed=false;#rollingBack=false;#exposed=false;
 private constructor(token:object,family:object,context:IDBFactory,names:readonly string[],native:readonly string[],uploads:string,root:RecoveryOpeningCustody,children:RecoveryCleanupScope,fail:(suffix?:string)=>SharedEditorError){if(token!==key)throw new SharedEditorError('native_input_opening_policy','Use an actual intrinsic opening');this.#family=family;this.#context=context;this.#names=Object.freeze([...names].sort());this.#native=Object.freeze([...native].sort());this.#uploads=uploads;this.#root=root;this.#children=children;this.#fail=fail;Object.freeze(this);}
 static async reserve<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(family:NativeInputJournalFamily<A,C,O,R,F>,context:IDBFactory,names:readonly string[],native:readonly string[],uploads:string,cleanup:()=>Promise<void>):Promise<NativeInputParticipantOpening>{
  if(this!==NativeInputParticipantOpening)throw nativeInputJournalFamily(family).error('participant_policy');const fail=nativeInputJournalFamily(family).error,errors={policy:()=>fail('participant_policy'),busy:()=>fail('participant_busy'),storage:()=>fail('participant_cleanup')};
  if(names.length!==4||new Set(names).size!==4||native.length!==2||new Set(native).size!==2||native.some(n=>!names.includes(n))||!names.includes(uploads)||native.includes(uploads)||typeof cleanup!=='function')throw errors.policy();
  const children=new RecoveryCleanupScope(errors.storage),root=await RecoveryOpeningCustody.reserve(context,names,async()=>{await children.drain();await cleanup();},errors);try{const result=new NativeInputParticipantOpening(key,family,context,names,native,uploads,root,children,fail);result.#exposed=true;return result;}catch(error){await root.rollback();throw error;}
 }
 complete():void{if(!this.#exposed)throw this.#fail('participant_closed');if(this.#closed||this.#rollingBack||this.#child||this.#children.pending)throw this.#fail('participant_busy');this.#root.complete();this.#closed=true;}
 rollback():Promise<void>{if(!this.#exposed)throw this.#fail('participant_closed');if(this.#closed)return Promise.resolve();this.#rollingBack=true;return this.#root.rollback().then(()=>{this.#closed=true;});}
 static{borrow=(parent,family,context,subset,names,cleanup,kind,fail)=>{
  if(!parent||typeof parent!=='object'||!(#family in parent)||parent.#family!==family||!parent.#exposed||parent.#closed||parent.#rollingBack||context!==parent.#context||names.length!==4||JSON.stringify([...subset].sort())!==JSON.stringify(kind==='native'?parent.#native:[parent.#uploads])||JSON.stringify([...names].sort())!==JSON.stringify(parent.#names)||typeof cleanup!=='function')throw fail('participant_policy');
  if(parent.#child||parent.#children.pending)throw fail('participant_busy');const actual=parent.#children.retain(cleanup);parent.#child=actual;let done=false;return Object.freeze({complete(){if(done||parent.#closed||parent.#rollingBack||parent.#child!==actual)throw fail('participant_busy');actual.complete();parent.#child=undefined;done=true;},async rollback(){if(done)return;await actual.rollback();if(parent.#child===actual)parent.#child=undefined;done=true;}});
 };}
}
export function nativeInputJournalOpening<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(parent:unknown,family:NativeInputJournalFamily<A,C,O,R,F>,context:IDBFactory,pair:readonly string[],names:readonly string[],cleanup:()=>Promise<void>){return borrow(parent,family,context,pair,names,cleanup,'native',nativeInputJournalFamily(family).error);}
export function nativeInputUploadsOpening<A,C extends NativeInputJournalChoice,O,R extends NativeInputCutIntent,F extends object>(parent:unknown,family:NativeInputJournalFamily<A,C,O,R,F>,context:IDBFactory,uploads:readonly string[],names:readonly string[],cleanup:()=>Promise<void>){return borrow(parent,family,context,uploads,names,cleanup,'uploads',nativeInputJournalFamily(family).error);}
