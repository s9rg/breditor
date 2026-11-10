/** SDK-only operation context around the genuine selected owner. This is not
 * an incoming capability, durable journal, server grant or activation result.
 * Native imports and fresh complete reads run in separate exclusive phases. */
import type {NativeRecoveryReservation} from '../native_recovery/contract.js';
import type {RetainedNativeClient} from '../complete_operation_cohort/retained_native_read.js';
import type {SelectedAssetCurrentCut} from '../physical_room_asset_successor/owner.js';
import type {SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import type {SharedServerLogGenerationRecoveryHost} from '../generation_recovery_control/host.js';
import type {SelectedGenerationReconciliationRead} from '../selected_room_reconciliation/generation_contract.js';
import type {SelectedRoomReconciliationRead} from '../selected_room_reconciliation/contract.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
export interface SelectedNativeRetainedCurrent{readonly current:SelectedRoomCurrentFile;readonly integrity:SharedArchiveIntegrityOptions}
export interface SelectedNativeRecoveryScope{
 readonly clients:readonly RetainedNativeClient[];
 readonly native:Omit<NativeRecoveryReservation,'close'>;
 readonly signal:AbortSignal;
 check():void;
 capture():Promise<SelectedAssetCurrentCut>;
 /** Complete encoding uses the actual held read scope's integrity runtime;
  * detached caller metadata cannot substitute that scope or its source files. */
 retainCurrent():Promise<SelectedNativeRetainedCurrent>;
 /** Retirement-only final complete capture. The SDK retains its genuine source
  * witness through final callbacks; no detached report can install that guard. */
 retainRetirementCurrent():Promise<SelectedNativeRetainedCurrent>;
 /** Admit native/source/whole-upload ancestry from complete retained data to
  * a newly captured actual cut, not a caller-supplied alleged current snapshot. */
 retainExtending(previous:SelectedRoomCurrentFile):Promise<SelectedNativeRetainedCurrent>;
 retainExtendingAll(previous:readonly SelectedRoomCurrentFile[]):Promise<SelectedNativeRetainedCurrent>;
 readReconciliation(host:SharedPhysicalRoomRecoveryHost):Promise<SelectedRoomReconciliationRead>;
 readGenerationReconciliation(host:SharedServerLogGenerationRecoveryHost):Promise<SelectedGenerationReconciliationRead>;
 readDeliveryReconciliation(host:import('../generation_delivery_control/host.js').SharedServerLogGenerationDeliveryRecoveryHost,inventory:import('../server_generation_inventory/read.js').SharedServerLogGenerationParticipantInventory):Promise<import('../selected_delivery_reconciliation/contract.js').SelectedDeliveryReconciliationRead>;
 readHandoverDeliveryReconciliation(host:import('../generation_delivery_path_control/host.js').SharedServerLogGenerationDeliveryPathRecoveryHost,inventory:import('../server_generation_inventory/read.js').SharedServerLogGenerationParticipantInventory):Promise<import('../selected_delivery_reconciliation/contract.js').SelectedDeliveryReconciliationRead>;
}

/** Private reconstruction composition. Factories are detached only after the
 * genuine cohort is reserved, and cancellation bounds every native restore.
 * These readers return DATA; they are not additional writer or serving rights. */
export interface SelectedNativeReconstructionScope extends SelectedNativeRecoveryScope{
 /** Observe an additional real read/asset signal before the first capture.
  * This can only cancel this finite read job, never grant editing or custody. */
 observeReadSignal(signal:AbortSignal|undefined):void;
 readonly reads:import('../physical_room_operation_v3/history_read_contract.js').PhysicalOperationV3HistoryReadOptions['reads'];
}
