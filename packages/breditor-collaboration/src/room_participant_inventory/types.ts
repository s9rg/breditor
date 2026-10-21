import type {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import type {SharedParticipantBackup} from "../participant_backup/archive.js";
import type {SharedWriterClock} from "../types.js";
import type {SharedReviewWriterClock} from "../review_types.js";
import type {SharedGenerationParticipantBackup} from "../generation_participant/backup.js";
import type {SharedGenerationSourceCapture} from "../generation_source/capture.js";
/** Native semantic cut declaration. Its enclosing file supplies the storage family
 * and record bound; detached data neither authenticates nor fences a host. */
export interface SharedRoomBackupCut {
 readonly document:string;readonly owner:string;readonly assetBinding:string;
 readonly profile:Readonly<{kind:"original"}>|Readonly<{kind:"structuralV2"|"layoutV3";standardInlineV1:boolean}>;
 readonly writerTransportVersion:1|2;readonly records:number;readonly terminalLogDigest:readonly number[];
}
/** Select independently from owner-authenticated native capture, never from incoming metadata. */
export interface SharedRoomParticipantInventoryIdentity {readonly room:SharedRoomBackupCut;readonly sha256:readonly number[]}
export interface SharedRecoveryDocumentRegistration {readonly principal:string;readonly observer:boolean;readonly clock:Readonly<SharedWriterClock>}
export interface SharedRecoveryReviewRegistration {readonly principal:string;readonly observer:boolean;readonly clock:Readonly<SharedReviewWriterClock>}
export interface SharedRoomParticipantInventoryMetadata {
 readonly format:"breditor/room-participant-inventory";readonly formatVersion:1;
 readonly room:SharedRoomBackupCut;readonly schemaFingerprint:string;readonly richLanguage:1|2|3;
 readonly accounts:readonly Readonly<{principal:string;owner:boolean;documentRole:"reader"|"editor"|null;reviewRole:"comment"|"moderator"|null;suggestionRole:"propose"|"review"|null}>[];
 readonly writers:readonly SharedRecoveryDocumentRegistration[];
 readonly review:Readonly<{binding:string;writers:readonly SharedRecoveryReviewRegistration[]}>|null;
 readonly versionsBinding:string|null;readonly suggestionsBinding:string|null;readonly revisionsBinding:string|null;
 readonly serverAuthors:readonly Readonly<{kind:"genesis"|"suggestionEffect";clock:Readonly<SharedWriterClock>}>[];
}
/** Both handles must be live and name the exact captured document and retained packet records. */
export interface SharedRoomParticipantSource {readonly backup:SharedParticipantBackup;readonly source:SharedAssetReferenceCapture}
/** Explicit separate source family. Native generation histories and retained packet
 * bytes remain intact; neither handle can be replaced by a detached JSON summary. */
export interface SharedRoomGenerationParticipantSource {readonly backup:SharedGenerationParticipantBackup;readonly source:SharedGenerationSourceCapture}
export type SharedRoomParticipantMissing=
 |Readonly<{kind:"document";principal:string;writer:string;reason:"missing"|"server_ahead"}>
 |Readonly<{kind:"review";principal:string;actor:string;reason:"missing"|"server_ahead"}>
 |Readonly<{kind:"unbound_review";participant:string;principal:string;actor:string}>;
/** Detached diagnostic data only. No credential, upload, global-store or activation authority. */
export interface SharedRoomParticipantCoverage {
 readonly kind:"covered"|"pending";readonly registeredStreamsCovered:boolean;
 readonly checkedParticipants:readonly Readonly<{participant:string;principal:string;writer:string;observer:boolean;localThrough:string;acceptedThrough:string}>[];
 readonly missing:readonly SharedRoomParticipantMissing[];
}
