/** Genuine constructor-owned local persistence, never a supplied save callback.
 * Internal recovery composition only; saving is not delivery acknowledgement. */
import type {SharedReviewRelayProgress,SharedReviewRelayStorageIdentity} from '../relay/review_types.js';
export interface SessionReviewIO{identity():SharedReviewRelayStorageIdentity|null;progress():SharedReviewRelayProgress;persist(progress:SharedReviewRelayProgress):Promise<void>}
export interface SessionDeliveryIO{readonly core:object;readonly review?:SessionReviewIO;check():void;save():void;flush():Promise<void>}
const sessions=new WeakMap<object,SessionDeliveryIO>();
const fail=()=>Object.assign(Error('Use the genuine constructor-owned persistence source'),{code:'delivery_source_unavailable'});
/** Trusted native/compound session constructors only. Each callback closes
 * over actual private fields or captured SDK method intrinsics. */
export function registerSessionDeliveryIO(session:object,io:SessionDeliveryIO):void{
 if(sessions.has(session))throw fail();const {core,check,save,flush}=io;
 const selected=io.review,review=selected?Object.freeze({identity(){check();const value=selected.identity();check();return value;},progress(){check();const value=selected.progress();check();return value;},async persist(progress:SharedReviewRelayProgress){check();await selected.persist(progress);check();}}):undefined;
 sessions.set(session,Object.freeze({core,...(review?{review}:{}),check,save(){check();save();check();},async flush(){check();await flush();check();}}));
}
/** Neither a copied source, a public Core getter nor matching backup fields
 * can select a source or install a persistence operation in this registry. */
export function sessionDeliveryIO(session:object,core:object):SessionDeliveryIO{const io=sessions.get(session);if(!io||io.core!==core)throw fail();return io;}
