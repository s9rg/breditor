/** Explicit closure of old writers from a genuine durable preparation. This
 * is an execution prerequisite, not replacement target creation, native union,
 * a save ACK, a remote writer grant or authenticated room activation. */
import type {RetainedSelectedAssetOwner,SelectedActorExecutionReservation} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {RoomPreparationChoice} from '../native_room_preparation/contract.js';
import type {NativeReconstructionInputOptions} from '../selected_native_reconstruction/input_scope.js';
import {withNativeReconstructionRetirement,withNativeReconstructionActorRetirement,withNativeReconstructionReservedActorRetirement} from '../selected_native_reconstruction/input_scope.js';
import {roomPreparationChoice} from '../native_room_preparation/plan.js';
import {fields,fail} from '../native_room_preparation/policy.js';
import {verifyPreparedRetirement} from './verify_prepared.js';
export interface PreparedRoomRetirementResult{readonly format:'breditor/prepared-room-retirement';readonly formatVersion:1;readonly preparation:RoomPreparationChoice;readonly state:'old-writers-closed';readonly scope:'local-native-and-selected-asset-custody-only'}
export type PreparedRoomRetirementOptions=Omit<NativeReconstructionInputOptions,'resolveAsset'>&Readonly<{expected:RoomPreparationChoice;approve:(choice:RoomPreparationChoice)=>boolean|Promise<boolean>}>;
/** Every attempt reads the EXISTING immutable intent and rebuilds every output
 * through its concrete native adapter. A selected file/phase never substitutes
 * for that work or for this call's affirmative decision. */
function runPreparedRetirement<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:PreparedRoomRetirementOptions,keepActors:boolean,reservation?:SelectedActorExecutionReservation):Promise<PreparedRoomRetirementResult>{
 const raw=fields(options,['expected','retained','approve'],['assets']),expected=roomPreparationChoice(raw['expected']),approve=raw['approve'] as PreparedRoomRetirementOptions['approve'];if(typeof approve!=='function')throw fail('room_preparation_policy');const input={retained:raw['retained'],...(raw['assets']===undefined?{}:{assets:raw['assets']})} as NativeReconstructionInputOptions;
 const borrow:typeof withNativeReconstructionRetirement=reservation?(owner,provided,input,expected,complete,visit)=>withNativeReconstructionReservedActorRetirement(owner,reservation,provided,input,expected,complete,visit):keepActors?withNativeReconstructionActorRetirement:withNativeReconstructionRetirement;
 return borrow(owner,provided,input,expected.plan.participants.map(row=>({id:row.id,families:[row.sourceFamily]})),true,async context=>{
  await verifyPreparedRetirement(context,expected,approve);
  return Object.freeze({format:'breditor/prepared-room-retirement' as const,formatVersion:1 as const,preparation:expected,state:'old-writers-closed' as const,scope:'local-native-and-selected-asset-custody-only' as const});
 });
}

/** Original explicit closure keeps its established actor-release semantics. */
export function retirePreparedRoom<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:PreparedRoomRetirementOptions):Promise<PreparedRoomRetirementResult>{return runPreparedRetirement(owner,provided,options,false);}
/** Complete saved recipes and a fresh affirmative decision are required again.
 * This alternative retains all actual author locks BEFORE parent cleanup.
 * The same actual owner retains them if cleanup fails; finish canonical Close
 * before taking them through takeSelectedRetiredActors. No target or server
 * activation is created, and the stored/result DATA cannot supply custody. */
export const retirePreparedRoomKeepingActors:typeof retirePreparedRoom=(owner,provided,options)=>runPreparedRetirement(owner,provided,options,true);

/** Reserved warm-executor entry. A competing attempt or ordinary old-owner
 * closure cannot take custody while this actual reservation remains held. */
export function retireReservedPreparedRoomKeepingActors<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,reservation:SelectedActorExecutionReservation,provided:PhysicalOperationV3HistoryReadOptions<P>,options:PreparedRoomRetirementOptions):Promise<PreparedRoomRetirementResult>{return runPreparedRetirement(owner,provided,options,true,reservation);}
