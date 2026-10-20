/** Current host choices are captured separately from immutable recovery/operation intent. */
import {participantAuthority} from "../participant_backup/policy.js";
import {checkAssetBytesSignal} from "../asset_bytes/guards.js";
import {generationParticipantSelection} from "../generation_participant/policy.js";
import {snapshotGenerationRecovery,prepareGenerationRecovery,generationRecoveryName,type PreparedGenerationRecovery} from "../generation_participant/prepare_recovery.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedGenerationOperationBeginOptions,SharedGenerationOperationResumeOptions} from "./contract.js";
import {generationOperationFailure as fail} from "./policy.js";
export interface GenerationOperationLife{changed:boolean}
export function generationOperationFence(db:IDBDatabase,life:GenerationOperationLife):void{db.onversionchange=()=>{life.changed=true;db.close();};}
export function operationDatabaseName<P extends SharedSelectionPolicy>(database:string,p:PreparedGenerationRecovery<P>):void{generationRecoveryName(database);if([p.options.database,...Object.values(p.options.destinations)].includes(database))throw fail("generation_operation_policy");}
export function beginGenerationOperationSnapshot<P extends SharedSelectionPolicy>(input:SharedGenerationOperationBeginOptions<P>){
 if(!input||typeof input!=="object"||Object.keys(input).some(k=>!["database","recovered","expected","checkAuthority","signal"].includes(k)))throw fail("generation_operation_policy");return {...input,database:generationRecoveryName(input.database),expected:generationParticipantSelection(input.expected)};
}
export function operationCurrentGuard(checkAuthority:()=>void,signal:AbortSignal|undefined,life:GenerationOperationLife):()=>void{const authority=participantAuthority(checkAuthority);return()=>{if(life.changed)throw fail("generation_operation_versionchange");checkAssetBytesSignal(signal);authority();if(life.changed)throw fail("generation_operation_versionchange");checkAssetBytesSignal(signal);};}
export function guardedGenerationPrepared<P extends SharedSelectionPolicy>(p:PreparedGenerationRecovery<P>,guard:()=>void):PreparedGenerationRecovery<P>{const before=p.guard;return {...p,guard(){guard();before();guard();}};}
export function prepareTransferredGenerationOperation<P extends SharedSelectionPolicy>(old:PreparedGenerationRecovery<P>,file:Blob,checkAuthority:()=>void,signal?:AbortSignal):Promise<PreparedGenerationRecovery<P>>{
 const {signal:_oldSignal,...options}=old.options;return prepareGenerationRecovery(snapshotGenerationRecovery({...options,checkAuthority,...(signal?{signal}:{})},false),file);
}
export function snapshotGenerationOperationResume<P extends SharedSelectionPolicy>(input:SharedGenerationOperationResumeOptions<P>){
 if(!input||typeof input!=="object"||Object.keys(input).some(k=>!["database","recoveryDatabase","expected","destinations","session","checkAuthority","signal","limits"].includes(k)))throw fail("generation_operation_policy");
 const {database,recoveryDatabase,...rest}=input,operation=generationRecoveryName(database),base=snapshotGenerationRecovery({...rest,database:generationRecoveryName(recoveryDatabase)},false);if([base.options.database,...Object.values(base.options.destinations)].includes(operation))throw fail("generation_operation_policy");return {database:operation,base};
}
