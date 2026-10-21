/** Point-in-time actual source/queue/provider reconciliation. No durable receipt or activation. */
import type {RasterMime,AssetStatus} from '@breditor/experimental-rich-content';
import type {SharedAssetCapturePending} from '../asset_references_capture.js';
import type {SharedPhysicalRecoveryControlSelection} from '../physical_recovery_control/contract.js';
import type {SharedPhysicalRecoveryAssetRead} from '../physical_recovery_control/asset_contract.js';
import type {SharedPhysicalRoomRecoveryCatalogSelection,SharedPhysicalRoomRecoveryCatalogCheck} from '../physical_room_catalog/contract.js';
export interface SharedPhysicalClientUploadSnapshot {
 readonly id:string;readonly family:'original'|'generation';readonly bytes:number;readonly sha256:string;
 /** Queue/epoch state is observed, not promoted by available server bytes. No opaque receipt is exposed. */
 readonly records:readonly Readonly<{asset:string;mime:RasterMime;bytes:number;width:number;height:number;status:AssetStatus;epoch:number;attempts:number}>[];
}
export interface SharedPhysicalRoomNativeAssetsCheck {
 readonly format:'breditor/shared-physical-room-native-assets-check';readonly formatVersion:1;
 readonly control:SharedPhysicalRecoveryControlSelection;readonly catalog:SharedPhysicalRoomRecoveryCatalogSelection;
 readonly scope:'held-client-native-packets-whole-uploads-and-current-provider-bytes';readonly kind:'checked'|'pending';
 readonly coverage:SharedPhysicalRoomRecoveryCatalogCheck;
 readonly assets:Readonly<{kind:'checked'|'pending';dependencies:readonly Readonly<{id:string;pending:readonly SharedAssetCapturePending[]}>[];provider:SharedPhysicalRecoveryAssetRead|null;uploads:readonly SharedPhysicalClientUploadSnapshot[];pendingUploads:readonly Readonly<{id:string;asset:string;status:Exclude<AssetStatus,'uploaded'>}>[]}>;
}
