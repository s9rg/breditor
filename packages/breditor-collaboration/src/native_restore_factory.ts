import {initializeSharedReadOnly} from "./initialize_read_only.js";
import {freeUnclaimedSharedRustOwner} from './raw_owner_lifetime.js';
import type {SharedRustOwner} from "./types.js";

type RestoreFactory=(...args:unknown[])=>SharedRustOwner|Promise<SharedRustOwner>;
interface RestoreBinding{readonly factory:RestoreFactory;readonly receiver:object}
const stagedFactories=new WeakMap<object,RestoreBinding>();
/** Internal provenance for the catalog's own initial-policy wrapper, never incoming metadata. */
export function stagedReadOnlyFactory<T>(factory:T,receiver:object,guard:()=>void):T{
 if(typeof factory!=="function")throw new TypeError("A native restore factory is required");
 const wrapped=async(...args:unknown[])=>{guard();const raw:SharedRustOwner=await Reflect.apply(factory,receiver,args);try{guard();return initializeSharedReadOnly(raw,true);}catch(error){freeUnclaimedSharedRustOwner(raw);throw error;}};
 stagedFactories.set(wrapped,Object.freeze({factory:factory as RestoreFactory,receiver}));return wrapped as unknown as T;
}
/** A new exclusive replay needs a raw owner, not a second one-shot initialization. */
export function nativeRestoreBinding<T>(factory:T,receiver:object):Readonly<{factory:T;receiver:object}>{
 const staged=typeof factory==="function"?stagedFactories.get(factory):undefined;
 return staged?{factory:staged.factory as T,receiver:staged.receiver}:{factory,receiver};
}
