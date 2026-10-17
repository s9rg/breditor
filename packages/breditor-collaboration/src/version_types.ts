/** Immutable imported attribution is descriptive, not authentication or a role grant. */
export interface SharedDocumentVersionInfo {id:string;name:string;author:string;createdAtMs:string}
export type SharedVersionTarget={kind:"document"}|{kind:"block";id:string};
export type SharedVersionAspect="placement"|"text"|"inline_formatting"|"children"|"entity";
export interface SharedVersionChange {target:SharedVersionTarget;beforeKind:string|null;afterKind:string|null;aspects:readonly SharedVersionAspect[];propertiesChanged:readonly string[]}
export interface SharedVersionAsset {asset:string;generation:string}
export interface SharedVersionComparison {versionId:string;identical:boolean;changes:readonly SharedVersionChange[];versionAssets:readonly SharedVersionAsset[];currentAssets:readonly SharedVersionAsset[]}
/** Exclusive disposable generated native proof. The host cannot construct or edit a restore plan. */
export interface SharedNativeVersionPlan {document_json():string;version_json():string;comparison_json():string;free():void}
/** Separate complete pairing; earlier owners retain their original capabilities without version support. */
export interface SharedVersionsRustCapability {
 document_versions_version?():string;
 capture_document_version?(observation:unknown,input:string):string;
 read_document_version?(input:string):string;
 compare_document_version?(observation:unknown,input:string):string;
 prepare_document_version_restore?(observation:unknown,input:string,prefix:string):SharedNativeVersionPlan;
 apply_document_version_restore?(plan:SharedNativeVersionPlan):boolean;
}
