/** Historical local names/hash describe provenance only. The independently
 * selected original and exact local journal domain must both agree. */
import {generationFields} from '../generation_source/identity.js';
import {independentParticipantSelection} from '../independent_participant/policy.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import {localOperationJournalIdentity,type LocalOperationJournalIdentity} from './journal_identity.js';
import type {LocalOperationBackupSelection} from './portable_contract.js';
import {localJournalFailure as fail} from './journal_failure.js';
export const localPortableHash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function localOperationBackupSelection(input:unknown):LocalOperationBackupSelection{if(!generationFields(input,'original,manifestSha256')||!localPortableHash(input['manifestSha256']))throw fail('independent_local_operation_backup_selection');return{original:independentParticipantSelection(input['original']),manifestSha256:input['manifestSha256']};}
export async function readLocalPortableIdentity(input:unknown,original:SharedIndependentParticipantSelection):Promise<LocalOperationJournalIdentity>{
 if(!generationFields(input,'plan,operation,origin,database,sourceDatabase')||typeof input['plan']!=='string'||new TextEncoder().encode(input['plan']).length>128*1024||!localPortableHash(input['operation'])||input['origin']!==original.sha256||typeof input['database']!=='string'||typeof input['sourceDatabase']!=='string')throw fail('independent_local_operation_backup_identity');
 const selected=await localOperationJournalIdentity(input['database'],input['sourceDatabase'],original);if(JSON.stringify(selected)!==JSON.stringify({plan:input['plan'],operation:input['operation'],origin:input['origin'],database:input['database'],sourceDatabase:input['sourceDatabase']}))throw fail('independent_local_operation_backup_identity');return selected;
}
