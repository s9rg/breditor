/** Actual private actor routes across sequential staging/final constructors.
 * Selecting a route does not borrow. Only the concrete native factory takes a
 * loan, and another factory waits for canonical return of the previous handles.
 * No function identity, option field, stored phase or host callback grants this.
 */
import {SharedEditorError} from '../core.js';
import {ActorLeaseEscrow} from './actor_lease_escrow.js';
import {SharedWriterLeaseEscrow,checkSharedWriterLeaseEscrow,type SharedWriterLease} from './writer_lease.js';
import {bindActorLeaseInput,takeActorDocumentLease,replaceReturnedActorLeaseInput,checkActorLeaseInputBorrower,checkActorLeaseInputPromoted,type ActorLeaseFactoryInput,type ActorLeaseFactoryFamily} from './actor_lease_input.js';
const selected=new WeakMap<object,DeferredActorLeaseInput>(),key=Object.freeze({}),idle=ActorLeaseEscrow.prototype.checkIdle;
const fail=(suffix='policy')=>new SharedEditorError('actor_route_'+suffix,'Use the actual recovery-owned actor route and canonically return each staging loan before final native admission');
let take:(owner:DeferredActorLeaseInput,input:object,family:ActorLeaseFactoryFamily,database:string,room:string,writer:string,actor:string|null)=>Promise<SharedWriterLease>;
export interface ActorLeaseRouteTargets{readonly databases:readonly string[];readonly finalDatabase:string}
function targets(value:ActorLeaseRouteTargets):ActorLeaseRouteTargets{if(!value||typeof value!=='object'||Reflect.ownKeys(value).length!==2)throw fail();const fields=Object.getOwnPropertyDescriptors(value),a=fields['databases'],b=fields['finalDatabase'];if(!a||!('value'in a)||!b||!('value'in b)||!Array.isArray(a.value)||a.value.length<1||a.value.length>16||typeof b.value!=='string')throw fail();const names:string[]=[];for(let index=0;index<a.value.length;index++){const d=Object.getOwnPropertyDescriptor(a.value,String(index));if(!d||!('value'in d)||typeof d.value!=='string'||!d.value||d.value.length>200||names.includes(d.value))throw fail();names.push(d.value);}if(Reflect.ownKeys(a.value).length!==names.length+1||!names.includes(b.value))throw fail();return Object.freeze({databases:Object.freeze(names),finalDatabase:b.value});}
export class DeferredActorLeaseInput{
 readonly #family;readonly #room;readonly #writer;readonly #actor;readonly #scope;readonly #targets;
 #current:ActorLeaseFactoryInput<object>|undefined;#database:string|undefined;#finalCore:object|undefined;
 #taking:Promise<SharedWriterLease>|undefined;#closing=false;#closed=false;#promoted=false;#cleanup:Promise<void>|undefined;
 private constructor(token:object,family:ActorLeaseFactoryFamily,room:string,writer:string,actor:string|null,scope:ActorLeaseEscrow|SharedWriterLeaseEscrow,chosen:ActorLeaseRouteTargets){if(token!==key)throw fail();this.#family=family;this.#room=room;this.#writer=writer;this.#actor=actor;this.#scope=scope;this.#targets=chosen;Object.freeze(this);}
 static create(family:ActorLeaseFactoryFamily,room:string,writer:string,actor:string|null,scope:ActorLeaseEscrow|SharedWriterLeaseEscrow,chosen:ActorLeaseRouteTargets):DeferredActorLeaseInput{const names=targets(chosen);if(!['shared','review','segmented','independent','continued-delivery'].includes(family)||family==='continued-delivery'&&actor===null)throw fail();if(actor===null)checkSharedWriterLeaseEscrow(scope as SharedWriterLeaseEscrow,room,writer,'idle');else idle.call(scope as ActorLeaseEscrow,room,writer,actor);return new DeferredActorLeaseInput(key,family,room,writer,actor,scope,names);}
 #open():void{if(this.#closing||this.#closed||this.#promoted)throw fail('closed');}
 select<T extends object>(input:T):T{this.#open();if(!input||typeof input!=='object'||Array.isArray(input))throw fail();const old=selected.get(input);if(old&&old!==this)throw fail();selected.set(input,this);return input;}
 static{take=(owner,input,family,database,room,writer,actor)=>{owner.#open();if(owner.#taking)throw fail('in_use');if(family!==owner.#family||room!==owner.#room||writer!==owner.#writer||actor!==owner.#actor||!owner.#targets.databases.includes(database))throw fail('identity');const job=Promise.resolve().then(async()=>{owner.#open();if(owner.#current)await owner.#current.rollbackAfterFailure();owner.#open();const loan=bindActorLeaseInput(input,family,database,room,writer,actor,owner.#scope);owner.#current=loan;owner.#database=database;owner.#finalCore=undefined;replaceReturnedActorLeaseInput(loan.input,input);const document=takeActorDocumentLease(loan.input,family,database,room,writer,actor);if(!document)throw fail();return await document;});owner.#taking=job;return job.finally(()=>{if(owner.#taking===job)owner.#taking=undefined;});};}
 /** The last borrower must be the actual final-namespace constructor. */
 checkFinal(core:object):void{this.#checkFinal(core);}
 #checkFinal(core:object):void{if(this.#closing||this.#closed||this.#taking||!this.#current||this.#database!==this.#targets.finalDatabase)throw fail('final');checkActorLeaseInputBorrower(this.#current.input,core);this.#finalCore=core;}
 /** Rechecked for the whole cohort before its first promotion flag changes. */
 checkFinalCurrent():void{if(!this.#finalCore)throw fail('final');this.#checkFinal(this.#finalCore);}
 /** SDK-only flag write after the actual whole-cohort escrow commit. It neither
  * releases a lock nor executes a callback/native destructor. */
 markPromoted():void{if(!this.#current||this.#closing||this.#closed||this.#taking)throw fail('final');checkActorLeaseInputPromoted(this.#current.input);this.#promoted=true;}
 closed():boolean{return this.#closed;}
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;if(this.#taking)return Promise.reject(fail('in_use'));this.#cleanup=(async()=>{if(!this.#promoted)await this.#current?.rollbackAfterFailure();this.#current=undefined;this.#finalCore=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
/** Only an already selected genuine route crosses known SDK normalizations. */
export function inheritDeferredActorLeaseInput<T extends object>(from:object,to:T):T{const route=selected.get(from),old=selected.get(to);if(route){if(old&&old!==route)throw fail();selected.set(to,route);}return to;}
export function deferredActorDocumentLease(input:object,family:ActorLeaseFactoryFamily|'continued-local',database:string,room:string,writer:string,actor:string|null):Promise<SharedWriterLease>|undefined{const route=selected.get(input);if(!route)return undefined;
 if(family==='continued-local')throw fail('identity');
 return take(route,input,family,database,room,writer,actor);}

const finalRead=DeferredActorLeaseInput.prototype.checkFinal;
/** Closed registry composition; no mutable core is returned to a caller. */
export function checkDeferredActorFinal(owner:DeferredActorLeaseInput,core:object):void{finalRead.call(owner,core);}
