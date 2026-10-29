/** SDK-private bridge from an ACTUAL native reservation to its exact work
 * owner. This is neither a native ingress callback nor a server/auth grant. */
import type {NativeRecoveryReservation} from './contract.js';
import type {RelayRecoveryWork,RelayWorkAdmission} from '../relay/work_custody.js';
import type {SharedReviewAccess} from '../review_types.js';
interface Owner {work:RelayRecoveryWork;setReviewAccess:(core:object,access:SharedReviewAccess)=>boolean}
const owners=new WeakMap<NativeRecoveryReservation,Owner>();
const fail=()=>Object.assign(Error('Use the actual held native recovery reservation'),{code:'native_recovery_work_source'});
/** Trusted genuine Core reservation constructor only. */
export function registerNativeRecoveryWork(owner:NativeRecoveryReservation,work:RelayRecoveryWork,setReviewAccess:Owner['setReviewAccess']):void{if(owners.has(owner))throw fail();owners.set(owner,{work,setReviewAccess});}
/** Exact live membership and the original native facade checks still apply.
 * A copied reservation/method set or stale serialized key cannot mint admission. */
export function nativeRecoveryWorkAdmission(owner:NativeRecoveryReservation,core:object):RelayWorkAdmission{const source=owners.get(owner);if(!source)throw fail();owner.check();return source.work.admit(core);}
/** Permission update through the same real native exclusion, never a temporary
 * unlock. Callers still independently clamp the current server grant. */
export function nativeRecoverySetReviewAccess(owner:NativeRecoveryReservation,core:object,access:SharedReviewAccess):boolean{const source=owners.get(owner);if(!source)throw fail();owner.check();return source.setReviewAccess(core,access);}
