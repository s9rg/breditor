/** Additional comparison data. Original reconciliation and ACK meanings stay unchanged. */
import type {LocalMetadataReconciliationInput,LocalMetadataReconciliationRead} from '../selected_local_metadata_assets/reconciliation_contract.js';
import type {SelectedServerMetadataCatalog} from '../server_metadata_read/contract.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
export type LocalMetadataReceiptContainmentInput=LocalMetadataReconciliationInput;
export type OriginalReceiptKind='version'|'catalog-version'|'publication'|'decision'|'revision'|'conflict-decision'|'conflict-successor'|'versions-cursor';
export interface OriginalReceiptRequirement {readonly participant:string;readonly point:string;readonly receipt:OriginalReceiptKind;readonly id:string;readonly relation:'missing'|'different'|'server-behind'}
export interface OriginalReceiptPoint {readonly participant:string;readonly point:string;readonly examined:number;readonly matched:number}
export interface LocalMetadataReceiptContainmentRead {
 readonly format:'breditor/selected-local-metadata-receipt-containment';readonly formatVersion:1;
 readonly scope:'same-held-native-original-local-receipts-in-current-server-catalogs';
 readonly kind:'contained'|'pending';readonly reconciliation:LocalMetadataReconciliationRead;
 readonly catalog:SelectedServerMetadataCatalog<SharedServerLogGenerationRecoveryControlSelection>;
 readonly points:readonly OriginalReceiptPoint[];readonly pending:readonly OriginalReceiptRequirement[];
}
