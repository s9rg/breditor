/** Exact actual graph/snapshot operational handoff; not an archive or activation. */
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {RichAssetStore} from '@breditor/experimental-rich-content';
export interface RestoredOperationParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>{readonly source:Readonly<{session:SharedIndependentDeliverySession<P>}>;readonly uploads:RichAssetStore}
