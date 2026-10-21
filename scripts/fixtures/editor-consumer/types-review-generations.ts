// The explicit native family is available only through the existing opt-in Wasm export.
import {SharedEditorOwner,SharedObservation} from '@breditor/collaboration/wasm';
declare const owner: SharedEditorOwner;
declare const observed: SharedObservation;
const version: string=owner.review_history_generation_version();
const family: string=owner.review_history_family();
owner.enable_review_history_generations(observed,'review-root','review-one');
owner.enable_observer_review_history_generations(observed,'observer-root','observer-one');
owner.seal_review_history_generation(observed,'review-two');
owner.seal_observer_review_history_generation(observed,'observer-two');
owner.enable_segmented_review(observed,'current-host-policy','native-checkpoint');
const nativeCheckpoint: string=owner.review_segmented_checkpoint(observed);
// @ts-expect-error Native owners cannot be fabricated through public constructors.
new SharedEditorOwner();
// @ts-expect-error Serialized observations cannot replace a genuine owner token.
owner.seal_review_history_generation('saved observation','review-three');
void [version,family,nativeCheckpoint];
