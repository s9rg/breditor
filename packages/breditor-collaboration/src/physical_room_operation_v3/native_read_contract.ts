/** Detached native-only diagnostics. No byte-provider, pending-store closure,
 * selected-credential, server-currentness or activation capability is issued. */
import type {PhysicalRoomCatalogV3Selection} from '../physical_room_catalog_v3/contract.js';
import type {SharedRoomParticipantMissing} from '../room_participant_inventory/types.js';
import type {PhysicalOperationV3Family} from './contract.js';
type History='original'|'segmented-v1';
export interface PhysicalOperationV3NativeParticipant{
 readonly id:string;readonly family:PhysicalOperationV3Family;readonly participant:string;readonly principal:string;readonly writer:string;
 readonly document:Readonly<{history:History;localThrough:string;acceptedThrough:string}>;
 readonly review:Readonly<{actor:string;history:History;localThrough:string;acceptedThrough:string|null;binding:string|null}>|null;
}
export interface PhysicalOperationV3NativeRead{
 readonly format:'breditor/physical-room-operation-native-read';readonly formatVersion:1;
 readonly catalog:PhysicalRoomCatalogV3Selection;readonly scope:'held-current-native-lanes-against-cached-inventory';
 readonly kind:'pending'|'covered';readonly registeredStreamsCovered:boolean;
 readonly participants:readonly PhysicalOperationV3NativeParticipant[];
 readonly missing:readonly SharedRoomParticipantMissing[];readonly unreconciledParticipants:readonly string[];
}
