import type * as Root from '../../../packages/breditor-collaboration/dist/index.js';
import {checkNativeRecoveryReservation} from '../../../packages/breditor-collaboration/dist/core.js';
import type {NativeRecoveryReservation} from '../../../packages/breditor-collaboration/dist/native_recovery/contract.js';
import {retirePreparedRoomKeepingActors,type PreparedRoomRetirementOptions} from '../../../packages/breditor-collaboration/dist/native_room_retirement/coordinator.js';
import {takeSelectedRetiredActors,type RetainedSelectedAssetOwner} from '../../../packages/breditor-collaboration/dist/physical_room_asset_successor/owner.js';
import {closeRetainedPhysicalKeepingActors,type RetainedPhysicalRoot} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/retained_root.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../../../packages/breditor-collaboration/dist/physical_room_operation_v3/history_read_contract.js';
type Assert<T extends true>=T;type Private=Assert<Extract<'checkNativeRecoveryReservation'|'retirePreparedRoomKeepingActors'|'takeSelectedRetiredActors',keyof typeof Root> extends never?true:false>;
declare const owner:RetainedSelectedAssetOwner,root:RetainedPhysicalRoot,reservation:NativeRecoveryReservation,reads:PhysicalOperationV3HistoryReadOptions,options:PreparedRoomRetirementOptions;
checkNativeRecoveryReservation(reservation,owner.clients.map(row=>row.core));void closeRetainedPhysicalKeepingActors(root,reservation);void retirePreparedRoomKeepingActors(owner,reads,options);const actors=takeSelectedRetiredActors(owner);void actors.close();
// @ts-expect-error The exact actual native reservation is required at the root.
closeRetainedPhysicalKeepingActors(root);
// @ts-expect-error A phase or detached result cannot supply an actual owner.
takeSelectedRetiredActors({state:'old-writers-closed'});
// @ts-expect-error A copied check interface is not the complete reservation.
checkNativeRecoveryReservation({check(){}},owner.clients.map(row=>row.core));
// @ts-expect-error Actor ownership does not grant authenticated serving activation.
actors.activate();
export type {Private};
