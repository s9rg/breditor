/** Durable generation-journal reconstruction DATA. These records preserve
 * complete evidence and explicit targets, never actor or serving authority. */
import type {GenerationNativeExecutionIdentity,GenerationNativeExecutionHead,GenerationNativeExecutionSnapshot} from '../selected_generation_execution/contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
import type {RoomExecutionChoice,RoomExecutionFile,RoomExecutionLayout,RoomExecutionAssetChoices,RoomExecutionReadOptions} from '../native_room_execution/contract.js';
import type {RoomPreparationTarget} from '../native_room_preparation/contract.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver,SharedAssetBytesPending} from '../asset_bytes/types.js';
export interface GenerationReconstructionPlan{readonly format:'breditor/generation-room-reconstruction-plan';readonly formatVersion:1;readonly database:string;readonly identity:GenerationNativeExecutionIdentity;readonly head:GenerationNativeExecutionHead;readonly current:SelectedRoomCurrentSelection;readonly retained:SelectedRoomCurrentSelection;readonly execution:RoomExecutionChoice}
export interface GenerationReconstructionSelection{readonly format:'breditor/generation-room-reconstruction-selection';readonly formatVersion:1;readonly bytes:number;readonly sha256:string}
export interface GenerationReconstructionChoice{readonly format:'breditor/generation-room-reconstruction-choice';readonly formatVersion:1;readonly plan:GenerationReconstructionPlan;readonly selection:GenerationReconstructionSelection}
export interface GenerationReconstructionFile{readonly choice:GenerationReconstructionChoice;readonly file:Blob}
export interface GenerationReconstructionCapture{readonly database:string;readonly snapshot:GenerationNativeExecutionSnapshot;readonly execution:RoomExecutionFile}
export interface GenerationReconstructionInspectionOptions{readonly database:string;readonly identity:GenerationNativeExecutionIdentity;readonly preparationDatabase:string;readonly participants:readonly RoomPreparationTarget[];readonly layout:RoomExecutionLayout;readonly decisions:readonly RoomExecutionAssetChoices[];readonly assets?:SharedAssetBytesOptions;readonly resolveAsset?:SharedAssetBytesResolver}
export type GenerationReconstructionInspection=Readonly<{kind:'pending';participants:readonly Readonly<{id:string;pending:readonly SharedAssetBytesPending[]}>[]}>|Readonly<{kind:'prepared-data';data:GenerationReconstructionFile}>;
export type GenerationReconstructionReadOptions=RoomExecutionReadOptions;

/** A fresh materialization decision binds actual current source bytes too.
 * It creates only the ordinary immutable execution intent, never a target. */
export interface GenerationReconstructionMaterializationChoice{readonly format:'breditor/generation-room-reconstruction-materialize';readonly formatVersion:1;readonly reconstruction:GenerationReconstructionChoice;readonly current:SelectedRoomCurrentSelection}
