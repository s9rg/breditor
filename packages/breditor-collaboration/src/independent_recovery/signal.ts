/** Admit an actual signal before any request can create storage. Canonical
 * event methods avoid a late caller-method exception orphaning that request. */
import {independentRecoveryFailure as fail} from './policy.js';
const aborted=globalThis.AbortSignal?Object.getOwnPropertyDescriptor(globalThis.AbortSignal.prototype,'aborted')?.get:undefined,add=globalThis.EventTarget?.prototype.addEventListener,remove=globalThis.EventTarget?.prototype.removeEventListener;
export function independentRecoverySignal(value:AbortSignal|undefined):AbortSignal|undefined{if(value===undefined)return undefined;try{if(!aborted||!add||!remove||typeof aborted.call(value)!=='boolean')throw Error();}catch{throw fail('independent_recovery_policy');}return value;}
export function onIndependentRecoveryAbort(signal:AbortSignal|undefined,listener:()=>void):()=>void{if(!signal)return()=>{};if(!add||!remove)throw fail('independent_recovery_policy');add.call(signal,'abort',listener,{once:true});return()=>remove.call(signal,'abort',listener);}
