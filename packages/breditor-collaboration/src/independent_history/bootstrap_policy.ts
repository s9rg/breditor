import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
/** Private scoped policy for the first actual native read/create/replay/save.
 * It is not selected by serialized fields and does not invent a delivery binding.
 * Once bootstrap succeeds, ordinary source policy and operation guards remain
 * responsible for later writes; the completed recovery grant is not retained. */
const selected=new WeakMap<object,()=>void>();
const signals=new WeakMap<object,AbortSignal>(),add=globalThis.EventTarget?.prototype.addEventListener,remove=globalThis.EventTarget?.prototype.removeEventListener;
export function withIndependentBootstrapPolicy<T extends object>(input:T,check:()=>void,signal?:AbortSignal):T{
 check();const copy=inheritActorLeaseInput(input,{...input});selected.set(copy,check);if(signal)signals.set(copy,signal);return copy;
}
/** Explicit internal forwarding across the delivery facade's option snapshot. */
export function forwardIndependentBootstrapPolicy<T extends object>(from:object,to:T):T{
 const check=selected.get(from);if(check){check();selected.set(to,check);const signal=signals.get(from);if(signal)signals.set(to,signal);}return to;
}
export function independentBootstrapPolicy(input:object):(()=>void)|undefined{return selected.get(input);}
export function independentBootstrapSignal(input:object):AbortSignal|undefined{return signals.get(input);}
/** Runtime-only subscription for the actual first save, not a persisted grant. */
export function onIndependentBootstrapAbort(signal:AbortSignal|undefined,listener:()=>void):()=>void{if(!signal)return()=>{};if(!add||!remove)throw new TypeError('Native bootstrap cancellation requires EventTarget support');add.call(signal,'abort',listener,{once:true});return()=>remove.call(signal,'abort',listener);}
