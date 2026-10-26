/** Immutable complete-room preparation DATA. Neither a file nor a persisted
 * choice retires a writer, authorizes replacement, acknowledges a source save,
 * or activates a room. Mutable execution must freshly admit both native inputs. */
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import type {PhysicalRoomCatalogV3Entry} from '../physical_room_catalog_v3/contract.js';
import type {PhysicalOperationV3Namespace} from '../physical_room_operation_v3/contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
export interface RoomPreparationTarget {readonly id:string;readonly sourceFamily:RecordPayloadFamily;readonly family:RecordPayloadFamily;readonly namespaces:readonly PhysicalOperationV3Namespace[]}
export type RoomPreparationParticipant=PhysicalRoomCatalogV3Entry&Readonly<{sourceFamily:RecordPayloadFamily;namespaces:readonly PhysicalOperationV3Namespace[];sha256:string;mime:string}>;
export interface RoomPreparationPlan {readonly format:'breditor/native-room-preparation-plan';readonly formatVersion:1;readonly database:string;readonly before:SelectedRoomCurrentSelection;readonly retained:SelectedRoomCurrentSelection;readonly participants:readonly RoomPreparationParticipant[]}
export interface RoomPreparationSelection {readonly format:'breditor/native-room-preparation-selection';readonly formatVersion:1;readonly bytes:number;readonly sha256:string}
export interface RoomPreparationChoice {readonly format:'breditor/native-room-preparation-choice';readonly formatVersion:1;readonly plan:RoomPreparationPlan;readonly selection:RoomPreparationSelection}
export interface RoomPreparationFile {readonly choice:RoomPreparationChoice;readonly file:Blob}
export interface RoomPreparationPart {readonly bytes:number;readonly sha256:string;readonly mime:string}
export interface RoomPreparationManifest {readonly format:'breditor/native-room-preparation';readonly formatVersion:1;readonly plan:RoomPreparationPlan;readonly parts:readonly RoomPreparationPart[]}
