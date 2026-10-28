/** Detached generation-family provider availability under the genuine seven-family
 * parent. Not registered-stream closure, queue acknowledgement or activation. */
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import type {PhysicalOperationV3HistoryRead} from './history_read_contract.js';
import type {PhysicalHistoryUploadPin} from './history_assets_contract.js';
export interface ServerGenerationOperationHistoryAssetsRead {
 readonly format:'breditor/server-generation-operation-v3-assets-read';readonly formatVersion:1;
 readonly scope:'held-protected-history-and-whole-upload-provider-bytes';
 readonly kind:'checked'|'pending';readonly control:SharedServerLogGenerationRecoveryControlSelection;
 readonly history:PhysicalOperationV3HistoryRead;readonly uploads:readonly PhysicalHistoryUploadPin[];
 readonly provider:SharedServerLogGenerationRecoveryAssetRead|null;
}
