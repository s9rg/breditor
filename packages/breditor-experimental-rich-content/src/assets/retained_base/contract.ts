/** A retained local decision, not a provider receipt, owner lease or activation.
 * Three complete files preserve the losing states as well as the selected base. */
import type {AssetLimits} from '../types.js';
import type {RichAssetReconciliationChoice} from '../reconciliation/types.js';
export type RichAssetBasePart='current'|'original'|'selected';
export interface RichAssetBaseFile {readonly bytes:number;readonly sha256:string}
export interface RichAssetBaseMetadata {
 readonly format:'breditor/reconciled-asset-base';readonly formatVersion:1;
 readonly sourceDatabase:string;readonly limits:Readonly<AssetLimits>;
 readonly choices:readonly RichAssetReconciliationChoice[];
 readonly files:Readonly<Record<RichAssetBasePart,RichAssetBaseFile>>;
 readonly sha256:string;
}
export interface RichAssetBaseReadOptions {readonly limits?:Partial<AssetLimits>;readonly signal?:AbortSignal}
export class RichAssetBaseError extends Error {
 constructor(readonly code:'asset_base_format'|'asset_base_budget'|'asset_base_integrity'|'asset_base_predecessor'|'asset_base_closed'|'asset_base_aborted',message:string){super(message);this.name='RichAssetBaseError';}
}
export const ASSET_BASE_MIME='application/vnd.breditor.reconciled-asset-base';
