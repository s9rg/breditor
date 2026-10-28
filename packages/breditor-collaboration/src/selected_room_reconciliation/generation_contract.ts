/** Generation-specific same-cut observations, never a queue acknowledgement,
 * comment affiliation, restored native custody or permission to serve. */
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
import type {SharedServerLogGenerationRecoveryAssetRead} from '../generation_recovery_control/asset_contract.js';
import type {SelectedRoomProviderRead} from '../selected_room_provider/contract.js';
import type {SelectedNativeCutRead} from './contract.js';
export interface SelectedGenerationProviderRead extends Omit<SelectedRoomProviderRead,'format'|'control'|'provider'>{
 readonly format:'breditor/selected-generation-provider-read';
 readonly control:SharedServerLogGenerationRecoveryControlSelection;
 readonly provider:SharedServerLogGenerationRecoveryAssetRead|null;
}
/** Each index addresses the same report's canonical accepted-author vector.
 * Ahead means preserved local work, NOT an accepted/retry receipt. */
export interface SelectedGenerationHeadRequirement {
 readonly participant:string;readonly lane:'document'|'review';readonly authorIndex:number;
 readonly relation:'local-ahead'|'server-ahead';readonly localThrough:string;readonly acceptedThrough:string;
}
export interface SelectedGenerationReconciliationRead {
 readonly format:'breditor/selected-generation-reconciliation-read';readonly formatVersion:1;
 readonly scope:'held-complete-native-source-and-whole-uploads-at-generation-cut';
 /** Checked means selected registered heads agree and bytes are available.
  * Full outbox/historical-copy closure and activation remain separate. */
 readonly kind:'checked'|'pending';readonly native:SelectedNativeCutRead;
 readonly heads:readonly SelectedGenerationHeadRequirement[];
 readonly provider:SelectedGenerationProviderRead;
}
