/** Detached image identities, never URLs, provider receipts or deletion authority. */
export interface RichRetainedAssetReference {readonly asset:string;readonly generation:string}
/** Complete owner-only native inventory. Separate versions/outboxes/extensions are excluded. */
export interface RichRetainedAssetReferencesRead {
 readonly format:"breditor/rich-retained-asset-references";readonly formatVersion:1;
 readonly schema:Readonly<{name:string;version:number;fingerprint:string}>;
 readonly document:string;readonly revision:string;
 readonly retention:"local-history"|"shared-causal";
 readonly references:readonly RichRetainedAssetReference[];
}
