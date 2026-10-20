/** Named adapters require actual durable generation custody. Plain old constructors still refuse it. */
import {SharedRelaySync} from "../relay/sync.js";
import {SharedReviewRelaySync} from "../relay/review_sync.js";
import type {SharedReviewRelayOptions,SharedReviewRelayIdentity} from "../relay/review_types.js";
import type {SharedSelectionPolicy} from "../types.js";
import {SharedRelayError} from "../relay/validation.js";
import type {SharedSegmentedRelaySession} from "./session.js";
import type {SharedSegmentedRelaySyncOptions} from "./contract.js";
import {segmentedRelaySessionPort,withSegmentedDocumentPort,withSegmentedReviewPort} from "./admission.js";

export function createSharedSegmentedRelaySync<P extends SharedSelectionPolicy>(session:SharedSegmentedRelaySession<P>,input:SharedSegmentedRelaySyncOptions<P>):SharedRelaySync<P>{
 const port=segmentedRelaySessionPort(session);
 if("persistLocal" in input||"selectionEditing" in input)throw new SharedRelayError("segmented_relay_factory_policy");
 const options=withSegmentedDocumentPort({...input,selectionEditing:session.core.selectionPolicy(),persistLocal:()=>port.flush()},port);
 const sync=new SharedRelaySync<P>(session.core,options as never);try{port.track(sync);return sync;}catch(error){sync.dispose();throw error;}
}
export type SharedSegmentedReviewRelaySyncOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedReviewRelayOptions<P>,"storage"|"identity">&{identity:P extends "document-v1"?SharedReviewRelayIdentity&{writerTransport:"atomic-v2"}:SharedReviewRelayIdentity};
export function createSharedSegmentedReviewRelaySync<P extends SharedSelectionPolicy>(session:SharedSegmentedRelaySession<P>,input:SharedSegmentedReviewRelaySyncOptions<P>):SharedReviewRelaySync<P>{
 const port=segmentedRelaySessionPort(session);if("storage" in input||!port.binding.review)throw new SharedRelayError("segmented_review_factory_policy");
 const options=withSegmentedReviewPort({...input,storage:session},port),sync=new SharedReviewRelaySync<P>(options);
 try{port.track(sync);return sync;}catch(error){sync.dispose();throw error;}
}
