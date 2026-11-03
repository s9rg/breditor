/** Real target witnesses and scoped original-journal observations remain private. */
import * as api from '@breditor/collaboration';
import {withOriginalMetadataJournals,type OriginalMetadataJournalObservation} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_continuation/original_journals.js';
import type {SelectedNativeRecoveryScope} from '../../../packages/breditor-collaboration/dist/selected_native_recovery/contract.js';
import type {RoomMetadataTargetWitness} from '../../../packages/breditor-collaboration/dist/native_room_execution_run/attempt.js';
import type {LocalMetadataRoomBundle} from '../../../packages/breditor-collaboration/dist/selected_local_metadata_delivery/contract.js';
declare const scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness,bundle:LocalMetadataRoomBundle;
const seen:Promise<number>=withOriginalMetadataJournals(scope,witness,bundle,async(inspection,observation:OriginalMetadataJournalObservation)=>{scope.check();void observation.review.actualRevision;return inspection.snapshot.current.lanes.length;});void seen;
// @ts-expect-error Copied witness data cannot admit original journal reads.
void withOriginalMetadataJournals(scope,{},bundle,async()=>{});
// @ts-expect-error A saved JSON selection is not a genuine target scope.
void withOriginalMetadataJournals({},witness,bundle,async()=>{});
// @ts-expect-error Private composition is not a public application-root promise.
void api.withOriginalMetadataJournals;
