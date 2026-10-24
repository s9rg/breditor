/** Point-in-time authenticated availability, not durable approval, registered
 * stream closure, queue settlement or an activation/ownership capability. */
import type {RichAssetArchiveEntry} from '@breditor/experimental-rich-content';
import type {SharedPhysicalRecoveryControlSelection} from '../physical_recovery_control/contract.js';
import type {SharedPhysicalRecoveryAssetRead} from '../physical_recovery_control/asset_contract.js';
import type {PhysicalOperationV3HistoryRead} from './history_read_contract.js';
import type {PhysicalOperationV3Family} from './contract.js';
export interface PhysicalHistoryUploadPin {
 readonly id:string;readonly family:PhysicalOperationV3Family;readonly database:string;
 readonly bytes:number;readonly sha256:string;readonly entries:readonly RichAssetArchiveEntry[];
}
export interface PhysicalOperationV3HistoryAssetsRead {
 readonly format:'breditor/physical-operation-v3-assets-read';readonly formatVersion:1;
 readonly scope:'held-protected-history-and-whole-upload-provider-bytes';
 readonly kind:'checked'|'pending';readonly control:SharedPhysicalRecoveryControlSelection;
 readonly history:PhysicalOperationV3HistoryRead;readonly uploads:readonly PhysicalHistoryUploadPin[];
 readonly provider:SharedPhysicalRecoveryAssetRead|null;
}
