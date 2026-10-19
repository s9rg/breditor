import {SharedParticipantBackup} from "../participant_backup/archive.js";
import {prepareRecovery,type PreparedRecovery} from "../participant_recovery/prepare.js";
import {operationFailure,operationName} from "./errors.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedParticipantOperationResumeOptions} from "./types.js";

export function operationDestination<P extends SharedSelectionPolicy>(database:string,p:PreparedRecovery<P>):void{
 operationName(database);if([p.database,...Object.values(p.destinations)].includes(database))throw operationFailure("operation_policy");
}
/** Snapshot the original plan with an independently owned admitted file and fresh authority guard. */
export function prepareTransferredOrigin<P extends SharedSelectionPolicy>(p:PreparedRecovery<P>,backup:SharedParticipantBackup,checkAuthority:()=>void,signal?:AbortSignal):Promise<PreparedRecovery<P>>{
 return prepareRecovery({database:p.database,backup,expected:p.expected,destinations:p.destinations,session:p.session,...(p.suggestions?{suggestions:p.suggestions}:{}),...(p.revisions?{revisions:p.revisions}:{}),...(p.versions?{versions:p.versions}:{}),limits:p.limits,checkAuthority,...(signal?{signal}:{})});
}
export function prepareOperationalResume<P extends SharedSelectionPolicy>(options:SharedParticipantOperationResumeOptions<P>,backup:SharedParticipantBackup):Promise<PreparedRecovery<P>>{
 const {database:_operation,recoveryDatabase,currentPolicy:_policy,...selected}=options;return prepareRecovery({...selected,database:recoveryDatabase,backup});
}
