/** Admit an actual signal before any request can create storage. Canonical
 * event methods avoid a late caller-method exception orphaning that request. */
import {independentRecoveryFailure as fail} from './policy.js';
const aborted=globalThis.AbortSignal?Object.getOwnPropertyDescriptor(globalThis.AbortSignal.prototype,'aborted')?.get:undefined,add=globalThis.EventTarget?.prototype.addEventListener,remove=globalThis.EventTarget?.prototype.removeEventListener;
export function independentRecoverySignal(value:AbortSignal|undefined):AbortSignal|undefined{if(value===undefined)return undefined;try{if(!aborted||!add||!remove||typeof aborted.call(value)!=='boolean')throw Error();}catch{throw fail('independent_recovery_policy');}return value;}
export function onIndependentRecoveryAbort(signal:AbortSignal|undefined,listener:()=>void):()=>void{if(!signal)return()=>{};if(!add||!remove)throw fail('independent_recovery_policy');add.call(signal,'abort',listener,{once:true});return()=>remove.call(signal,'abort',listener);}

/** Observe cancellation during preparation, before the final native-state fence.
 * Even a canonical signal getter/event method may invoke a Proxy's traps in a
 * host runtime. Neither final check nor synchronous release may read that input.
 * The real journal hold schedules listener cleanup after all cohort consumption.
 * Synthetic abort events do not cancel a live signal or retire its listener. */
export function observeIndependentRecoveryAbort(value:AbortSignal|undefined,lifetime:Promise<unknown>):{aborted():boolean;release():void}{
 const signal=independentRecoverySignal(value);let active=true,cancelled=false;
 if(!signal)return{aborted:()=>false,release:()=>{active=false;}};
 const read=()=>{try{cancelled=cancelled||aborted!.call(signal)===true;}catch{cancelled=true;}};
 const listener=()=>{if(active)read();};
 const cleanup=()=>{active=false;try{remove!.call(signal,'abort',listener);}catch{/* No native owners are retained by cleanup. */}};
 try{read();add!.call(signal,'abort',listener);read();}catch{cleanup();throw fail('independent_recovery_policy');}
 void lifetime.then(cleanup,cleanup);
 return{aborted:()=>cancelled,release:()=>{active=false;}};
}
