/** Original pure paired version/progress admission; no persistence, autosave or writer lease. */
import {SharedEditorError} from "../core.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedReviewRelayProgress,SharedReviewRelayStorageIdentity} from "../relay/review_types.js";
export function admitPairedVersions<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,versions:readonly string[]):Map<string,string>{
 const result=new Map<string,string>();for(const packet of versions){const info=core.readVersion(packet);if(result.has(info.id))throw new SharedEditorError("version_catalog","Duplicate immutable version in recovery");result.set(info.id,packet);}return result;
}
export function checkPairedNativeProgress<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,relay:SharedReviewRelayStorageIdentity|undefined,principal:string,progress:SharedReviewRelayProgress):void{
 if(relay?.reviewEditing==="read_only"&&core.localReviewClock().through!=="0")throw new SharedEditorError("review_observer_authored","An observer's native recovery cannot contain an authored metadata suffix");
 if(progress.accepted){const own=core.localReviewClock();if(own.actor!==progress.accepted.actor)throw new SharedEditorError("review_relay_identity","Native review writer differs from saved progress");const local=core.reviewWriterClock(own.actor,principal,progress.accepted.through);if(local.prefixDigest!==progress.accepted.prefixDigest)throw new SharedEditorError("review_relay_fork","Saved acceptance does not match native retained history");}
}
