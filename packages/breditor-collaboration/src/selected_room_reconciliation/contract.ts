/** Detached same-cut diagnostics. None of these records is native custody,
 * permission to reconnect, a credential, a durable acknowledgement or activation. */
import type {PhysicalRoomCatalogV3Selection} from '../physical_room_catalog_v3/contract.js';
import type {PhysicalOperationV3NativeRead} from '../physical_room_operation_v3/native_read_contract.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import type {SelectedRoomProviderRead} from '../selected_room_provider/contract.js';
export interface SelectedDocumentAuthor {
 readonly kind:'registered'|'genesis'|'suggestionEffect';readonly writer:string;readonly principal:string|null;
 readonly acceptedThrough:string;
}
export interface SelectedReviewAuthor {
 readonly actor:string;readonly principal:string;readonly acceptedThrough:string;
}
export interface SelectedNativeCutParticipant {
 readonly id:string;readonly family:RecordPayloadFamily;
 /** Canonical counters aligned to documentAuthors. Every non-behind prefix
  * was compared natively; no digest or author identity is duplicated per cell. */
 readonly documentHeads:readonly string[];
 /** Bound counters align to reviewAuthors. Unbound/absent lanes have no
  * global prefix proof and an empty vector; this never affiliates a local lane. */
 readonly review:Readonly<{kind:'bound'|'unbound'|'absent';binding:string|null;heads:readonly string[]}>;
 readonly retainedStores:readonly ('suggestions'|'suggestion-revisions'|'version-catalog')[];
}
export interface SelectedNativeCutRead {
 readonly format:'breditor/selected-room-native-cut-read';readonly formatVersion:1;
 readonly scope:'every-selected-native-client-against-all-accepted-authors';readonly catalog:PhysicalRoomCatalogV3Selection;
 readonly kind:'covered'|'pending';readonly ownStreams:PhysicalOperationV3NativeRead;
 readonly documentAuthors:readonly SelectedDocumentAuthor[];readonly reviewAuthors:readonly SelectedReviewAuthor[];
 readonly participants:readonly SelectedNativeCutParticipant[];
}
/** Actual root-owned cores and canonical inventory outlive temporary readers.
 * This checks native bytes/lifetime only, not disposed read scopes or permission. */
export interface SelectedNativeCutWitness {readonly data:SelectedNativeCutRead;finalCheck():void}
export interface SelectedRoomReconciliationRead {
 readonly format:'breditor/selected-room-reconciliation-read';readonly formatVersion:1;
 readonly scope:'held-complete-native-source-and-whole-uploads-at-authenticated-cut';
 readonly kind:'checked'|'pending';readonly native:SelectedNativeCutRead;readonly provider:SelectedRoomProviderRead;
}
