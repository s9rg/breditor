/** Canonical borrowed reads for a genuine captured generation owner. No mutable
 * core, storage, lease, edit or transport capability escapes through this view. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedCapturedRecoveryRead} from "../asset_references_capture.js";
import {sourceNativeRecoveryRead} from '../source_native_read.js';

export function generationNativeRead(core:SharedRichEditor<SharedSelectionPolicy>):SharedCapturedRecoveryRead {
 return sourceNativeRecoveryRead(core);
}
