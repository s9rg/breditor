/** Explicit mixed-mode whole-room preparation; every file is DATA, not retirement or activation. */
import type{RichAssetReconciliationChoice}from'@breditor/experimental-rich-content';
import type{RoomPreparationTarget,RoomPreparationParticipant}from'../native_room_preparation/contract.js';
import type{SelectedRoomCurrentFile,SelectedRoomCurrentSelection}from'../selected_room_current/contract.js';
import type{SharedIndependentDeliveryUnionArchiveChoice}from'../independent_delivery_union_archive/contract.js';
import type{SharedNativeBranchUnionAuthorization}from'../native_branch_union_types.js';
import type{RoomExecutionReadOptions}from'../native_room_execution/contract.js';
import type{SharedAssetBytesOptions,SharedAssetBytesResolver,SharedAssetBytesPending}from'../asset_bytes/types.js';
export type NativeRoomUnionTarget=RoomPreparationTarget&(Readonly<{mode:'continuation'}>|Readonly<{mode:'independent-delivery-union';unionDatabase:string;choices:readonly RichAssetReconciliationChoice[]}>);
export type NativeRoomUnionParticipant=RoomPreparationParticipant&(Readonly<{mode:'continuation'}>|Readonly<{mode:'independent-delivery-union';union:SharedIndependentDeliveryUnionArchiveChoice}>);
/** Original permission windows are fresh caller data, never recovered from the saved plan. */
export interface NativeRoomUnionAuthorization{readonly id:string;readonly authorizations:readonly SharedNativeBranchUnionAuthorization[]}
export interface NativeRoomUnionPlan{readonly format:'breditor/native-room-union-plan';readonly formatVersion:1;readonly database:string;readonly before:SelectedRoomCurrentSelection;readonly retained:SelectedRoomCurrentSelection;readonly participants:readonly NativeRoomUnionParticipant[]}
export interface NativeRoomUnionChoice{readonly format:'breditor/native-room-union-choice';readonly formatVersion:1;readonly plan:NativeRoomUnionPlan;readonly selection:Readonly<{bytes:number;manifestSha256:string}>}
export interface NativeRoomUnionFile{readonly choice:NativeRoomUnionChoice;readonly file:Blob}
export interface NativeRoomUnionReadOptions extends RoomExecutionReadOptions{readonly authorizations:readonly NativeRoomUnionAuthorization[]}
export interface NativeRoomUnionPreviewOptions{readonly database:string;readonly participants:readonly NativeRoomUnionTarget[];readonly retained:SelectedRoomCurrentFile;readonly authorizations:readonly NativeRoomUnionAuthorization[];readonly assets?:SharedAssetBytesOptions;readonly resolveAsset?:SharedAssetBytesResolver}
export interface NativeRoomUnionPrepareOptions extends Omit<NativeRoomUnionPreviewOptions,'database'|'participants'>{readonly expected:NativeRoomUnionChoice}
export type NativeRoomUnionInspection=Readonly<{kind:'prepared-data';data:NativeRoomUnionFile}>|Readonly<{kind:'pending';participants:readonly Readonly<{id:string;pending:readonly SharedAssetBytesPending[]}>[]}>;
