/** Only an actual opened relay-generation session can mint these private per-call adapter ports. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedReviewRelayProgress} from "../relay/review_types.js";
import type {SharedSegmentedRelayBinding,SharedSegmentedRelayProgress,SharedSegmentedDocumentProgress,SharedSegmentedReviewReceipt} from "./contract.js";
import {SharedRelayError} from "../relay/validation.js";
export interface SegmentedRelayPort {
 readonly core:SharedRichEditor<SharedSelectionPolicy>;
 readonly binding:SharedSegmentedRelayBinding;
 check():void;flush():Promise<void>;
 durable():SharedSegmentedRelayProgress;
 persistDocument(progress:SharedSegmentedDocumentProgress):Promise<void>;
 persistReview(progress:SharedReviewRelayProgress,receipt?:SharedSegmentedReviewReceipt):Promise<void>;
 track(adapter:{dispose():void}):void;
}
const sessions=new WeakMap<object,SegmentedRelayPort>(),documents=new WeakMap<object,SegmentedRelayPort>(),reviews=new WeakMap<object,SegmentedRelayPort>();
export function registerSegmentedRelaySession(session:object,port:SegmentedRelayPort):void{if(sessions.has(session))throw new SharedRelayError("segmented_relay_session_reused");sessions.set(session,port);}
export function segmentedRelaySessionPort(session:object):SegmentedRelayPort{const port=sessions.get(session);if(!port)throw new SharedRelayError("segmented_relay_session_required");port.check();return port;}
export function withSegmentedDocumentPort<T extends object>(input:T,port:SegmentedRelayPort):T{const copy={...input};documents.set(copy,port);return copy;}
export function withSegmentedReviewPort<T extends object>(input:T,port:SegmentedRelayPort):T{const copy={...input};reviews.set(copy,port);return copy;}
export const segmentedDocumentPort=(input:object):SegmentedRelayPort|undefined=>documents.get(input);
export const segmentedReviewPort=(input:object):SegmentedRelayPort|undefined=>reviews.get(input);
