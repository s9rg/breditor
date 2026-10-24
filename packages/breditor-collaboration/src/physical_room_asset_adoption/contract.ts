/** Separate durable local staging, not replacement of a native participant,
 * authenticated provider receipt, server writer grant or room activation. */
import type {AssetLimits} from '@breditor/experimental-rich-content';
import type {PhysicalAssetSourcePin,PhysicalAssetNativePin} from '../physical_room_operation_v3/asset_read_contract.js';
import type {PhysicalOperationV3Family} from '../physical_room_operation_v3/contract.js';
export interface RoomAssetAdoptionChoice {readonly id:string;readonly targetDatabase:string;readonly base:Readonly<{file:Blob;sha256:string}>}
export interface RoomAssetAdoptionOptions {readonly database:string;readonly checkAuthority:()=>void;readonly signal?:AbortSignal}
export interface RoomAssetAdoptionBeginOptions extends RoomAssetAdoptionOptions {readonly participants:readonly RoomAssetAdoptionChoice[]}
export interface RoomAssetAdoptionTarget {
 readonly id:string;readonly family:PhysicalOperationV3Family;readonly sourceDatabase:string;readonly targetDatabase:string;
 readonly sourceUploadsSha256:string;readonly native:PhysicalAssetNativePin;readonly limits:Readonly<AssetLimits>;
 readonly base:Readonly<{bytes:number;sha256:string}>;readonly selected:Readonly<{bytes:number;sha256:string}>;
 readonly state:'reserved'|'started'|'complete';
}
export interface RoomAssetAdoptionRecord {
 readonly format:'breditor/physical-room-asset-adoption';readonly formatVersion:1;readonly database:string;
 readonly source:PhysicalAssetSourcePin;readonly phase:'prepared'|'ready';
 readonly participants:readonly RoomAssetAdoptionTarget[];readonly unreconciledParticipants:readonly string[];
}
