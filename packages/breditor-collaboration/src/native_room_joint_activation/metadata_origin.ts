/** Bind original metadata to the actual complete activation graph under one
 * genuine source/metadata lifetime. No caller-provided bundle or stored ACK can
 * replace these four literal files. Continuation still needs a fresh actual
 * promoted target witness and the complete original native-history replay. */
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {checkSelectedNativeDeliveryScope} from '../relay/native_delivery.js';
import {readLocalMetadataActivationInScope,readLocalMetadataHandoverActivationInScope,type SelectedLocalMetadataDelivery} from '../selected_local_metadata_delivery/coordinator.js';
import {detachLocalMetadataBundle} from '../selected_local_metadata_delivery/bundle.js';
import type {LocalMetadataRoomBundle} from '../selected_local_metadata_delivery/contract.js';
import type {RoomActivationIntentChoice} from '../room_native_activation_intent/contract.js';
import type {RoomHandoverActivationIntentChoice} from '../room_native_handover_activation_intent/contract.js';
import {roomMetadataTargetIdentity,type RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import type {JointActivationMetadataOriginSelection} from './metadata_origin_contract.js';
import type {JointHandoverMetadataOriginSelection} from './handover_contract.js';
import {fail} from './policy.js';
const key=Object.freeze({});
type OriginSelection=JointActivationMetadataOriginSelection|JointHandoverMetadataOriginSelection;
let bundle:(owner:JointActivationMetadataOrigin<OriginSelection>,witness:RoomMetadataTargetWitness,scope:SelectedNativeRecoveryScope)=>LocalMetadataRoomBundle;
/** Only trusted SDK continuation code receives the original bundle. A matching
 * selection, structural copy or unrelated promoted executor cannot mint it. */
export const jointActivationMetadataBundle=(owner:JointActivationMetadataOrigin<OriginSelection>,witness:RoomMetadataTargetWitness,scope:SelectedNativeRecoveryScope)=>bundle(owner,witness,scope);
function selectOrigin<Format extends OriginSelection['format'],Activation extends OriginSelection['activation']>(
 origin:LocalMetadataRoomBundle,format:Format,activation:Activation,
){
 return Object.freeze({format,formatVersion:1 as const,activation,prepared:origin.parent.prepared.choice,current:origin.parent.current.selection,
  review:Object.freeze({bytes:origin.parent.delivery.bytes,sha256:origin.parent.delivery.sha256}),
  metadata:Object.freeze({bytes:origin.metadata.bytes,sha256:origin.metadata.sha256})});
}
async function detachCurrentOrigin(scope:SelectedNativeRecoveryScope,original:LocalMetadataRoomBundle){
 scope.check();
 const origin=detachLocalMetadataBundle(original);
 if(JSON.stringify((await scope.retainCurrent()).current.selection)!==JSON.stringify(origin.parent.current.selection))throw fail();
 scope.check();
 return origin;
}
export class JointActivationMetadataOrigin<Selection extends OriginSelection=JointActivationMetadataOriginSelection> {
 readonly #origin:LocalMetadataRoomBundle;readonly #selection:Selection;
 private constructor(token:object,origin:LocalMetadataRoomBundle,selection:Selection){
  if(token!==key)throw fail();
  this.#origin=origin;this.#selection=selection;Object.freeze(this);
 }
 /** This fresh read verifies the complete existing immutable intent and the
  * actual current metadata journals. Its saved phase is never an activation or
  * serving grant. Capture makes no request and creates no destination. */
 static async capture(scope:SelectedNativeRecoveryScope,metadata:SelectedLocalMetadataDelivery,choice:RoomActivationIntentChoice):Promise<JointActivationMetadataOrigin>{
  checkSelectedNativeDeliveryScope(scope);scope.check();
  const retained=await readLocalMetadataActivationInScope(metadata,scope,choice);
  const origin=await detachCurrentOrigin(scope,retained.capture.recovery.bundle.original.packets.references.parent);
  return new JointActivationMetadataOrigin(key,origin,selectOrigin(origin,'breditor/joint-activation-metadata-origin',retained.choice));
 }
 static async captureAcrossHandover(
  scope:SelectedNativeRecoveryScope,metadata:SelectedLocalMetadataDelivery,choice:RoomHandoverActivationIntentChoice,
 ):Promise<JointActivationMetadataOrigin<JointHandoverMetadataOriginSelection>>{
  checkSelectedNativeDeliveryScope(scope);scope.check();
  const retained=await readLocalMetadataHandoverActivationInScope(metadata,scope,choice);
  const origin=await detachCurrentOrigin(scope,retained.capture.capture.recovery.bundle.original.packets.references.parent);
  return new JointActivationMetadataOrigin(key,origin,selectOrigin(origin,'breditor/joint-handover-activation-metadata-origin',retained.choice));
 }
 selection():Selection{return this.#selection;}
 static{bundle=(owner,witness,scope)=>{
  if(!owner||typeof owner!=='object'||!(#origin in owner))throw fail();
  const actual=roomMetadataTargetIdentity(witness,scope);
  if(JSON.stringify(actual.execution.plan.preparation.plan.before)!==JSON.stringify(owner.#origin.parent.current.selection))throw fail();
  return owner.#origin;
 };}
}
