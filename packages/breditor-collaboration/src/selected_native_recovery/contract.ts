/** SDK-only operation context around the genuine selected owner. This is not
 * an incoming capability, durable journal, server grant or activation result.
 * Native imports and fresh complete reads run in separate exclusive phases. */
import type {NativeRecoveryReservation} from '../native_recovery/contract.js';
import type {RetainedNativeClient} from '../complete_operation_cohort/retained_native_read.js';
import type {SelectedAssetCurrentCut} from '../physical_room_asset_successor/owner.js';
import type {SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import type {SelectedRoomReconciliationRead} from '../selected_room_reconciliation/contract.js';
export interface SelectedNativeRecoveryScope{
 readonly clients:readonly RetainedNativeClient[];
 readonly native:Omit<NativeRecoveryReservation,'close'>;
 readonly signal:AbortSignal;
 check():void;
 capture():Promise<SelectedAssetCurrentCut>;
 readReconciliation(host:SharedPhysicalRoomRecoveryHost):Promise<SelectedRoomReconciliationRead>;
}
