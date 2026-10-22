/** One-time ownership of the exact native object, not a serialized identity or permission.
 * Initialization is synchronously reserved. Constructor transfer and factory cleanup consume
 * the object permanently, including failed construction, so a second scope cannot free it. */
import {SharedEditorError} from './shared_editor_error.js';
import type {SharedRustOwner} from './types.js';
const claims=new WeakMap<object,object>(),consumed=Object.freeze({});
const reused=()=>new SharedEditorError('owner_reused','A Rust owner can only be transferred once');
/** Reserve transfer before constructor option/native callbacks can reenter. */
export function claimSharedRustOwner(owner:SharedRustOwner):void {
 if(claims.has(owner))throw reused();claims.set(owner,consumed);
}
/** A callback cannot adopt an owner while its initial policy is being applied. */
export function initializeUnclaimedSharedRustOwner<T>(owner:SharedRustOwner,work:()=>T):T {
 if(claims.has(owner))throw reused();const reservation=Object.freeze({});claims.set(owner,reservation);
 try{return work();}finally{if(claims.get(owner)===reservation)claims.delete(owner);}
}
/** A failed factory never owns an object another editor already consumed or reserved.
 * Genuine owning editors still free through their own dispose/failure paths. */
export function freeUnclaimedSharedRustOwner<T extends {free():void}>(owner:T):void {
 if(claims.has(owner))return;claims.set(owner,consumed);owner.free();
}
