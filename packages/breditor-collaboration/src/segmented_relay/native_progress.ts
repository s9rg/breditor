/** Counters and receipts are admitted against the actual retained native owners, not final text. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import {SharedRelayError,transportVersion} from "../relay/validation.js";
import {admitNativeDeliveryProgress} from '../delivery_state/native_progress.js';
import type {SharedSegmentedRelayProgress} from "./contract.js";
export function admitRelayProgress<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,progress:SharedSegmentedRelayProgress):void {
 transportVersion(progress.binding.document.writerTransport);
 if(core.segmentedHistoryPolicy()!=="segmented-v1")throw new SharedRelayError("segmented_relay_source");
 admitNativeDeliveryProgress(core,progress);
}
