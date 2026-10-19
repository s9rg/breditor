import type {AssetLimits,RichAssetStore} from "@breditor/experimental-rich-content";
import type {SharedBackupIdentity} from "../backups/types.js";
import type {SharedAssetReferenceCaptureOptions,SharedAssetCaptureSourceKind} from "../asset_references_capture.js";
import type {SharedAssetBytesResolver,SharedAssetBytesPending} from "../asset_bytes/types.js";
import type {SharedSelectionPolicy} from "../types.js";
/** Host-declared participant scope, never account authentication or writer fencing. */
export interface SharedParticipantBackupIdentity {
 readonly participant:string;readonly principal:string;readonly source:Readonly<SharedBackupIdentity>;
 /** Explicit complete producer list, in the ordinary native capture order. No inferred omissions. */
 readonly stores:readonly SharedAssetCaptureSourceKind[];
 /** The entire supplied raster database, not just this document's visible images, is included. */
 readonly assets:"whole-store";
}
/** Retain independently from the file. Incoming metadata never selects a recovery identity. */
export interface SharedParticipantBackupSelection {readonly identity:SharedParticipantBackupIdentity;readonly sha256:string}
export interface SharedParticipantBackupOptions {readonly limits?:Partial<AssetLimits>;readonly signal?:AbortSignal}
export interface SharedParticipantBackupCaptureOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedParticipantBackupOptions {
 readonly identity:SharedParticipantBackupIdentity;readonly source:SharedAssetReferenceCaptureOptions<P>;readonly assets:RichAssetStore;
 /** Synchronous throw-on-revocation host check. Returning a value or promise is invalid. */
 readonly checkAuthority:()=>void;
 /** Missing/non-content-addressed history bytes require an explicit current host resolver. */
 readonly resolveAsset?:SharedAssetBytesResolver;
}
export type SharedParticipantBackupPending=readonly SharedAssetBytesPending[];
