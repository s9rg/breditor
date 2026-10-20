/** Separately selected native factory; never sniff a checkpoint or fall back to an older replay. */
import {SharedEditorError} from "./core.js";
import type {SharedRustProfile} from "./profile.js";
import type {SharedRustOwner} from "./types.js";
export function supportsSharedSegmentedHistory(profile:SharedRustProfile):boolean{return profile.segmented_history_version?.()==="1"&&typeof profile.restore_segmented==="function";}
/** Host must reacquire the exact writer's exclusive lease before restoring or exposing an owner. */
export function restoreSharedSegmentedEditor(profile:SharedRustProfile,room:string,checkpoint:string):SharedRustOwner{
 if(!supportsSharedSegmentedHistory(profile))throw new SharedEditorError("segmented_history_unavailable","Use matching native segmented recovery");
 return profile.restore_segmented!(room,checkpoint);
}
