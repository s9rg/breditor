/** Current-inventory observations under the same actual retained owner. No adoption or ACK. */
import type {SelectedNativeCutRead,SelectedNativeCutWitness} from '../selected_room_reconciliation/contract.js';
import type {PhysicalOperationV3NativeRead} from '../physical_room_operation_v3/native_read_contract.js';
import type {SharedServerLogGenerationDeliveryRecoveryControlSelection} from '../generation_delivery_control/contract.js';
import type {SharedServerLogGenerationParticipantIdentity} from '../server_generation_inventory/contract.js';
import type {SelectedGenerationProviderRead,SelectedGenerationHeadRequirement} from '../selected_room_reconciliation/generation_contract.js';
export interface SelectedDeliveryNativeCutRead extends Omit<SelectedNativeCutRead,'format'|'scope'|'ownStreams'>{
 readonly format:'breditor/selected-delivery-native-cut-read';readonly scope:'retained-native-clients-against-authenticated-current-inventory';
 readonly control:SharedServerLogGenerationDeliveryRecoveryControlSelection;readonly inventory:SharedServerLogGenerationParticipantIdentity;
 readonly ownStreams:Pick<PhysicalOperationV3NativeRead,'kind'|'registeredStreamsCovered'|'participants'|'missing'|'unreconciledParticipants'>;
}
export interface SelectedDeliveryNativeCutWitness extends Omit<SelectedNativeCutWitness,'data'>{readonly data:SelectedDeliveryNativeCutRead}
export interface SelectedDeliveryProviderRead extends Omit<SelectedGenerationProviderRead,'format'|'control'>{readonly format:'breditor/selected-delivery-provider-read';readonly control:SharedServerLogGenerationDeliveryRecoveryControlSelection}
export interface SelectedDeliveryReconciliationRead{
 readonly format:'breditor/selected-delivery-reconciliation-read';readonly formatVersion:1;readonly scope:'same-retained-owner-current-inventory-native-and-whole-uploads';
 readonly kind:'checked'|'pending';readonly native:SelectedDeliveryNativeCutRead;readonly heads:readonly SelectedGenerationHeadRequirement[];readonly provider:SelectedDeliveryProviderRead;
}
