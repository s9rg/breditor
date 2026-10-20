/** A declared participant and complete explicit generation source; no account or provider grants. */
import type {AssetLimits,RichAssetStore} from "@breditor/experimental-rich-content";
import type {SharedGenerationSourceIdentity,SharedGenerationSourceSelection} from "../generation_source/contract.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedAssetBytesResolver} from "../asset_bytes/types.js";
export interface SharedGenerationParticipantIdentity {readonly participant:string;readonly principal:string;readonly source:SharedGenerationSourceIdentity;readonly assets:"whole-store"}
export interface SharedGenerationParticipantSelection {readonly identity:SharedGenerationParticipantIdentity;readonly sha256:string}
export interface SharedGenerationParticipantOptions {readonly limits?:Partial<AssetLimits>;readonly signal?:AbortSignal}
export interface SharedGenerationParticipantCaptureOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedGenerationParticipantOptions {
 readonly participant:string;readonly principal:string;readonly source:SharedGenerationSourceSelection<P>;
 readonly assets:RichAssetStore;readonly checkAuthority:()=>void;readonly resolveAsset?:SharedAssetBytesResolver;
}
