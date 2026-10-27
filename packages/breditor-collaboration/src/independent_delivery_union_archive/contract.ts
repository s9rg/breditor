/** Complete immutable participant union. All files are DATA, never actor or serving custody. */
import type{AssetLimits,RichAssetReconciliationChoice}from'@breditor/experimental-rich-content';
import type{SharedArchiveIntegrityOptions}from'../archive_integrity/contract.js';
import type{SharedAssetBytesPending}from'../asset_bytes/types.js';
import type{SharedIndependentDeliveryParticipantSelection}from'../independent_delivery_participant/contract.js';
import type{SharedIndependentDeliveryUnionReadFactory}from'../independent_delivery_union/contract.js';
import type{SharedNativeBranchUnionAuthorization}from'../native_branch_union_types.js';
export interface SharedIndependentDeliveryUnionParticipantFile{readonly selection:SharedIndependentDeliveryParticipantSelection;readonly file:Blob}
/** Four disjoint future namespaces. DATA construction reserves/creates none. */
export interface SharedIndependentDeliveryUnionLayout{readonly database:string;readonly recoveryDatabase:string;readonly sourceDatabase:string;readonly uploadsDatabase:string}
export interface SharedIndependentDeliveryUnionArchivePlan{
 readonly format:'breditor/independent-delivery-union-plan';readonly formatVersion:1;
 readonly layout:SharedIndependentDeliveryUnionLayout;
 readonly current:SharedIndependentDeliveryParticipantSelection;readonly incoming:SharedIndependentDeliveryParticipantSelection;readonly output:SharedIndependentDeliveryParticipantSelection;
 readonly limits:Readonly<AssetLimits>;readonly choices:readonly RichAssetReconciliationChoice[];
}
export interface SharedIndependentDeliveryUnionArchiveChoice{
 readonly format:'breditor/independent-delivery-union-choice';readonly formatVersion:1;
 /** The canonical manifest pins every independently SHA-256-checked component. This is not a whole-file hash. */
 readonly plan:SharedIndependentDeliveryUnionArchivePlan;readonly selection:Readonly<{bytes:number;manifestSha256:string}>;
}
export interface SharedIndependentDeliveryUnionArchiveFile{readonly choice:SharedIndependentDeliveryUnionArchiveChoice;readonly file:Blob}
/** Fresh original-role grants are supplied on every semantic admission, not loaded from the file. */
export interface SharedIndependentDeliveryUnionArchiveReadOptions extends SharedArchiveIntegrityOptions{
 readonly session:SharedIndependentDeliveryUnionReadFactory;readonly authorizations:readonly SharedNativeBranchUnionAuthorization[];readonly limits?:Partial<AssetLimits>;
}
export interface SharedIndependentDeliveryUnionArchiveBuildOptions extends SharedIndependentDeliveryUnionArchiveReadOptions{
 readonly layout:SharedIndependentDeliveryUnionLayout;readonly current:SharedIndependentDeliveryUnionParticipantFile;readonly incoming:SharedIndependentDeliveryUnionParticipantFile;
 readonly choices:readonly RichAssetReconciliationChoice[];
}
export type SharedIndependentDeliveryUnionArchivePending=Readonly<{kind:'pending';pending:readonly SharedAssetBytesPending[]}>;
