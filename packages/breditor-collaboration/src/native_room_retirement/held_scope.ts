/** Complete retirement preflight in the SAME genuine source session used by
 * metadata recovery/activation. This never closes the scope itself: the outer
 * reserved owner performs its synchronous final fence before releasing native
 * exclusion and retains the actual stopped actors. Inspection DATA is no grant. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {PreparedRoomRetirementOptions} from './coordinator.js';
import {withHeldNativeReconstructionInputs} from '../selected_native_reconstruction/held_input_scope.js';
import {roomPreparationChoice} from '../native_room_preparation/plan.js';
import {fields,fail} from '../native_room_preparation/policy.js';
import {verifyPreparedRetirement} from './verify_prepared.js';
import {checkSelectedNativeDeliveryScope} from '../relay/native_delivery.js';
import {pinReservedSelectedActorPreparation} from '../physical_room_asset_successor/owner.js';
export interface HeldPreparedRoomRetirementInspection {
 readonly format:'breditor/held-prepared-room-retirement-inspection';readonly formatVersion:1;
 readonly preparation:import('../native_room_preparation/contract.js').RoomPreparationChoice;
 readonly state:'complete-original-cut-verified';readonly scope:'same-held-native-source-lifetime';
}
export function verifyHeldPreparedRoomRetirement(scope:SelectedNativeRecoveryScope,options:PreparedRoomRetirementOptions):Promise<HeldPreparedRoomRetirementInspection>{
 checkSelectedNativeDeliveryScope(scope);
 const raw=fields(options,['expected','retained','approve'],['assets']),expected=roomPreparationChoice(raw['expected']),approve=raw['approve'] as PreparedRoomRetirementOptions['approve'];if(typeof approve!=='function')throw fail('room_preparation_policy');
 return withHeldNativeReconstructionInputs(scope,{retained:raw['retained'],...(raw['assets']===undefined?{}:{assets:raw['assets']})} as PreparedRoomRetirementOptions,expected.plan.participants.map(row=>({id:row.id,families:[row.sourceFamily]})),true,async context=>{
  await verifyPreparedRetirement(context,expected,approve);context.check();pinReservedSelectedActorPreparation(scope,JSON.stringify(expected));context.check();
  return Object.freeze({format:'breditor/held-prepared-room-retirement-inspection',formatVersion:1,preparation:expected,state:'complete-original-cut-verified',scope:'same-held-native-source-lifetime'});
 },true);
}
