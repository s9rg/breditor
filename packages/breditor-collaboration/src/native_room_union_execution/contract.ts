/** Explicit union-aware execution DATA; not actor custody or activation. */
import type{NativeRoomUnionChoice,NativeRoomUnionFile,NativeRoomUnionReadOptions,NativeRoomUnionAuthorization}from'../native_room_union/contract.js';
import type{RoomExecutionLayout,RoomExecutionAssetChoices,RoomExecutionAssetPlan}from'../native_room_execution/contract.js';
import type{PhysicalRoomCatalogV3Selection}from'../physical_room_catalog_v3/contract.js';
import type{SelectedRoomCurrentFile}from'../selected_room_current/contract.js';
import type{SharedAssetBytesOptions,SharedAssetBytesResolver}from'../asset_bytes/types.js';
export interface NativeRoomUnionExecutionPlan{readonly format:'breditor/native-room-union-execution-plan';readonly formatVersion:1;readonly preparation:NativeRoomUnionChoice;readonly layout:RoomExecutionLayout;readonly catalog:PhysicalRoomCatalogV3Selection;readonly assets:readonly RoomExecutionAssetPlan[]}
export interface NativeRoomUnionExecutionChoice{readonly format:'breditor/native-room-union-execution-choice';readonly formatVersion:1;readonly plan:NativeRoomUnionExecutionPlan;readonly selection:Readonly<{bytes:number;manifestSha256:string}>}
export interface NativeRoomUnionExecutionFile{readonly choice:NativeRoomUnionExecutionChoice;readonly file:Blob}
export type NativeRoomUnionExecutionReadOptions=NativeRoomUnionReadOptions;
export interface NativeRoomUnionExecutionCaptureInput{readonly preparation:NativeRoomUnionFile;readonly layout:RoomExecutionLayout;readonly decisions:readonly RoomExecutionAssetChoices[]}
export interface NativeRoomUnionExecutionPreviewOptions{readonly preparation:NativeRoomUnionChoice;readonly retained:SelectedRoomCurrentFile;readonly layout:RoomExecutionLayout;readonly decisions:readonly RoomExecutionAssetChoices[];readonly authorizations:readonly NativeRoomUnionAuthorization[];readonly assets?:SharedAssetBytesOptions;readonly resolveAsset?:SharedAssetBytesResolver}
export interface NativeRoomUnionExecutionPrepareOptions extends Omit<NativeRoomUnionExecutionPreviewOptions,'preparation'|'layout'|'decisions'>{readonly expected:NativeRoomUnionExecutionChoice}
