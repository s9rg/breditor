/** Independently selected original and both namespaces form a new tagged plan.
 * Neither a head hash nor an original file grants author or storage custody. */
import {independentParticipantSelection} from '../independent_participant/policy.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {independentRecoveryName} from '../independent_recovery/policy.js';
import {localJournalFailure as fail} from './journal_failure.js';
export interface LocalOperationJournalIdentity{readonly plan:string;readonly operation:string;readonly origin:string;readonly database:string;readonly sourceDatabase:string}
export async function localOperationJournalIdentity(databaseInput:string,sourceInput:string,selected:SharedIndependentParticipantSelection):Promise<LocalOperationJournalIdentity>{
 const database=independentRecoveryName(databaseInput),sourceDatabase=independentRecoveryName(sourceInput),expected=independentParticipantSelection(selected);if(database===sourceDatabase)throw fail('independent_local_operation_policy');const plan=JSON.stringify({format:'breditor/shared-independent-local-operation-plan',formatVersion:1,database,sourceDatabase,expected});if(new TextEncoder().encode(plan).length>128*1024)throw fail('independent_local_operation_policy');return Object.freeze({plan,operation:await segmentedDigest('breditor/local-operation-plan/1\0'+plan),origin:expected.sha256,database,sourceDatabase});
}
