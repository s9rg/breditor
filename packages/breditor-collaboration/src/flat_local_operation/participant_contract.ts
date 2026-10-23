/** Actual four-name graph ownership under fresh host policy. The literal input
 * is provenance, not a backup of subsequent edits or an activation credential. */
import type {SharedSelectionPolicy} from '../types.js';
import type {NativeInputParticipantParts} from '../native_input_operation/participant_witness.js';
import type {FlatLocalInputOptions} from './policy.js';
export type FlatLocalParticipantOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<FlatLocalInputOptions<P>,'cohort'>&{readonly cohort:Readonly<{parentDatabase:string;uploadsDatabase:string}>};
export type FlatLocalParticipantParts<P extends SharedSelectionPolicy=SharedSelectionPolicy>=NativeInputParticipantParts<P>;
