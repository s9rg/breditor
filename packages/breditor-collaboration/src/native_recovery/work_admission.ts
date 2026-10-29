/** SDK-private work and ingress bridges from the ACTUAL native reservation.
 * Exact membership and native checks remain required; no server/auth grant. */
import type {NativeRecoveryReservation} from './contract.js';
import type {RelayRecoveryWork,RelayWorkAdmission} from '../relay/work_custody.js';
import type {SharedReviewAccess} from '../review_types.js';
import type {SharedDocumentSuggestionEffectProof} from '../suggestion_effect_proof.js';
import type {SharedOwnedSuggestionAcceptance} from '../reviewed_history_types.js';
interface Owner {work:RelayRecoveryWork;setReviewAccess:(core:object,access:SharedReviewAccess)=>boolean;adoptSuggestionHistory:(core:object,proof:SharedDocumentSuggestionEffectProof,packet:string,acceptance:SharedOwnedSuggestionAcceptance)=>boolean}
const owners=new WeakMap<NativeRecoveryReservation,Owner>();
const fail=()=>Object.assign(Error('Use the actual held native recovery reservation'),{code:'native_recovery_work_source'});
/** Trusted genuine Core reservation constructor only. */
export function registerNativeRecoveryWork(owner:NativeRecoveryReservation,work:RelayRecoveryWork,setReviewAccess:Owner['setReviewAccess'],adoptSuggestionHistory:Owner['adoptSuggestionHistory']):void{if(owners.has(owner))throw fail();owners.set(owner,{work,setReviewAccess,adoptSuggestionHistory});}
/** Exact live membership and the original native facade checks still apply.
 * A copied reservation/method set or stale serialized key cannot mint admission. */
export function nativeRecoveryWorkAdmission(owner:NativeRecoveryReservation,core:object):RelayWorkAdmission{const source=owners.get(owner);if(!source)throw fail();owner.check();return source.work.admit(core);}
/** Permission update through the same real native exclusion, never a temporary
 * unlock. Callers still independently clamp the current server grant. */
export function nativeRecoverySetReviewAccess(owner:NativeRecoveryReservation,core:object,access:SharedReviewAccess):boolean{const source=owners.get(owner);if(!source)throw fail();owner.check();return source.setReviewAccess(core,access);}

/** Exact held facade and original opaque native proof only. This supplies native
 * scheduling; the caller must authenticate the original decision independently. */
export function nativeRecoveryAdoptSuggestionHistory(owner:NativeRecoveryReservation,core:object,proof:SharedDocumentSuggestionEffectProof,packet:string,acceptance:SharedOwnedSuggestionAcceptance):boolean{
 const source=owners.get(owner);if(!source)throw fail();owner.check();return source.adoptSuggestionHistory(core,proof,packet,acceptance);
}
