import type {GenerationComponentRow} from './components.js';
/** Durable generation-journal reconstruction DATA. These records preserve
 * complete evidence and explicit targets, never actor or serving authority. */
import type {GenerationNativeExecutionIdentity,GenerationNativeExecutionHead,GenerationNativeExecutionSnapshot} from '../selected_generation_execution/contract.js';
import type {SelectedRoomCurrentSelection} from '../selected_room_current/contract.js';
import type {RoomExecutionChoice,RoomExecutionFile,RoomExecutionLayout,RoomExecutionAssetChoices,RoomExecutionReadOptions} from '../native_room_execution/contract.js';
import type {RoomPreparationTarget} from '../native_room_preparation/contract.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver,SharedAssetBytesPending} from '../asset_bytes/types.js';
export interface GenerationComponentReconstructionPlan{readonly format:'breditor/generation-component-reconstruction-plan';readonly formatVersion:1;readonly database:string;readonly identity:GenerationNativeExecutionIdentity;readonly head:GenerationNativeExecutionHead;readonly current:SelectedRoomCurrentSelection;readonly journalRetained:SelectedRoomCurrentSelection;readonly retained:SelectedRoomCurrentSelection;readonly components:readonly GenerationComponentRow[];readonly execution:RoomExecutionChoice}
export interface GenerationComponentReconstructionSelection{readonly format:'breditor/generation-component-reconstruction-selection';readonly formatVersion:1;readonly bytes:number;readonly sha256:string}
export interface GenerationComponentReconstructionChoice{readonly format:'breditor/generation-component-reconstruction-choice';readonly formatVersion:1;readonly plan:GenerationComponentReconstructionPlan;readonly selection:GenerationComponentReconstructionSelection}
export interface GenerationComponentReconstructionFile{readonly choice:GenerationComponentReconstructionChoice;readonly file:Blob}
export interface GenerationComponentReconstructionCapture{readonly database:string;readonly snapshot:GenerationNativeExecutionSnapshot;readonly components:readonly GenerationComponentRow[];readonly execution:RoomExecutionFile}
export interface GenerationComponentReconstructionInspectionOptions{readonly database:string;readonly identity:GenerationNativeExecutionIdentity;readonly preparationDatabase:string;readonly participants:readonly RoomPreparationTarget[];readonly layout:RoomExecutionLayout;readonly decisions:readonly RoomExecutionAssetChoices[];readonly assets?:SharedAssetBytesOptions;readonly resolveAsset?:SharedAssetBytesResolver}
export type GenerationComponentReconstructionInspection=Readonly<{kind:'pending';participants:readonly Readonly<{id:string;pending:readonly SharedAssetBytesPending[]}>[]}>|Readonly<{kind:'prepared-data';data:GenerationComponentReconstructionFile}>;
export type GenerationComponentReconstructionReadOptions=RoomExecutionReadOptions;

/** A fresh materialization decision binds actual current source bytes too.
 * It creates only the ordinary immutable execution intent, never a target. */
export interface GenerationComponentReconstructionMaterializationChoice{readonly format:'breditor/generation-component-reconstruction-materialize';readonly formatVersion:1;readonly reconstruction:GenerationComponentReconstructionChoice;readonly current:SelectedRoomCurrentSelection}
