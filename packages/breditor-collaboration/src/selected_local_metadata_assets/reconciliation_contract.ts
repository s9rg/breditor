/** Same-owner reconciliation DATA. No recovered bytes, current operator
 * observation or completed outbox supplies runtime custody or serving rights. */
import type {SharedServerLogGenerationDeliveryRecoveryHost} from '../generation_delivery_control/host.js';
import type {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import type {SelectedDeliveryReconciliationRead} from '../selected_delivery_reconciliation/contract.js';
import type {SelectedGenerationHeadRequirement} from '../selected_room_reconciliation/generation_contract.js';
import type {LocalMetadataAssetAvailabilityBundle} from './availability_contract.js';
export interface LocalMetadataReconciliationInput {
 readonly host:SharedServerLogGenerationDeliveryRecoveryHost;
 readonly inventory:SharedServerLogGenerationParticipantInventory;
}
export type LocalMetadataReconciliationPending=
 |Readonly<{kind:'head';requirement:SelectedGenerationHeadRequirement}>
 |Readonly<{kind:'registration';participant:string;actor:string|null}>
 |Readonly<{kind:'review-progress';participant:string}>
 |Readonly<{kind:'metadata';participant:string;store:'suggestions'|'revisions'|'versions';index:number;operation:'publish'|'decide'|'revise'}>
 |Readonly<{kind:'references'|'provider'}>;
export interface LocalMetadataReconciledReview {
 readonly participant:string;readonly actor:string;readonly binding:string;
 /** Canonical counters align with legacy.native.reviewAuthors. Every prefix
  * at a non-behind accepted head is verified on the actual held native core. */
 readonly heads:readonly string[];
 readonly acceptedThrough:string|null;readonly receiptVerified:boolean;
}
export interface LocalMetadataReconciliationRead {
 readonly format:'breditor/selected-local-metadata-reconciliation-read';readonly formatVersion:1;
 readonly scope:'same-held-native-room-local-review-bindings-all-metadata-and-provider';
 readonly kind:'checked'|'pending';
 /** Original diagnostic semantics remain literal, including local unbound
  * lanes. Only the separate genuine reviews below establish their binding. */
 readonly legacy:SelectedDeliveryReconciliationRead;
 readonly assets:LocalMetadataAssetAvailabilityBundle;
 readonly reviews:readonly LocalMetadataReconciledReview[];
 readonly pending:readonly LocalMetadataReconciliationPending[];
}
