/** New DATA preparation contract. No source custody, receipt authentication or activation. */
import type{SharedIndependentDeliveryRecovery}from'../independent_delivery/contract.js';
import type{SharedIndependentDeliveryRecoveryFactory}from'../independent_delivery_recovery/contract.js';
import type{SharedNativeBranchUnionAuthorization,SharedNativeBranchUnionOutcome}from'../native_branch_union_types.js';
import type{SharedRetainedSuggestionsRecoveryResult}from'../suggestions/reconcile_types.js';
import type{SharedRetainedRevisionsRecoveryResult}from'../suggestion_revisions/reconcile_types.js';
import type{SharedRetainedVersionRecoveryResult}from'../versions/reconcile_types.js';
/** Explicit matching native factories, readonly in both lanes. Saved JSON never chooses policy. */
export type SharedIndependentDeliveryUnionReadFactory=Omit<SharedIndependentDeliveryRecoveryFactory,'readOnly'|'review'>&{
 readonly readOnly:true;readonly review:Omit<SharedIndependentDeliveryRecoveryFactory['review'],'access'>&{readonly access:'read_only'};
};
export interface SharedIndependentDeliveryUnionOptions{
 /** Complete original serialized recoveries. Exact input strings remain in the result. */
 readonly currentJson:string;readonly incomingJson:string;
 readonly session:SharedIndependentDeliveryUnionReadFactory;
 /** Independently authenticated original role/prefix windows, not checkpoint claims. */
 readonly authorizations:readonly SharedNativeBranchUnionAuthorization[];
 readonly checkAuthority:()=>void;readonly signal?:AbortSignal;
}
export interface SharedIndependentDeliveryUnionPreparation{
 readonly format:'breditor/shared-independent-delivery-union-preparation';readonly formatVersion:1;
 /** Originals include stopped retries and receipts even when the result knows a later terminal outcome. */
 readonly inputs:Readonly<{currentJson:string;incomingJson:string}>;
 readonly recovery:SharedIndependentDeliveryRecovery;
 readonly native:SharedNativeBranchUnionOutcome;
 readonly retained:Readonly<{suggestions:SharedRetainedSuggestionsRecoveryResult|null;revisions:SharedRetainedRevisionsRecoveryResult|null;versions:SharedRetainedVersionRecoveryResult|null}>;
}
