/** Canonical historical operation identity. Names/hashes describe provenance, never current grants. */
import {generationFields} from '../generation_source/identity.js';
import {independentDeliveryParticipantSelection} from '../independent_delivery_participant/policy.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import {operationDatabaseName} from './journal_identity.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import type {IndependentOperationJournalIdentity} from './cut_intent.js';
import type {IndependentOperationBackupSelection} from './portable_contract.js';
import {operationJournalFailure as fail} from './journal_failure.js';
export const operationPortableHash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function operationBackupSelection(input:unknown):IndependentOperationBackupSelection{if(!generationFields(input,'original,manifestSha256')||!operationPortableHash(input['manifestSha256']))throw fail('independent_operation_backup_selection');return{original:independentDeliveryParticipantSelection(input['original']),manifestSha256:input['manifestSha256']};}
export async function readPortableOperationIdentity(input:unknown,original:SharedIndependentDeliveryParticipantSelection):Promise<IndependentOperationJournalIdentity>{
 if(!generationFields(input,'plan,operation,origin,sourceDatabase')||typeof input['plan']!=='string'||new TextEncoder().encode(input['plan']).length>132*1024||!operationPortableHash(input['operation'])||input['origin']!==original.sha256)throw fail();const plan=JSON.parse(input['plan']);if(!generationFields(plan,'format,formatVersion,recovery,journal,source')||plan['format']!=='breditor/shared-independent-operation-plan'||plan['formatVersion']!==1||typeof plan['recovery']!=='string')throw fail();const journal=operationDatabaseName(plan['journal']),sourceDatabase=operationDatabaseName(plan['source']);if(input['sourceDatabase']!==sourceDatabase)throw fail();
 const recovery=JSON.parse(plan['recovery']);if(!generationFields(recovery,'format,formatVersion,expected,destinations')||recovery['format']!=='breditor/shared-independent-delivery-participant-plan'||recovery['formatVersion']!==1||!generationFields(recovery['destinations'],'source,uploads'))throw fail();const expected=independentDeliveryParticipantSelection(recovery['expected']),destinations={source:operationDatabaseName(recovery['destinations']['source']),uploads:operationDatabaseName(recovery['destinations']['uploads'])};
 if(JSON.stringify(expected)!==JSON.stringify(original)||new Set([journal,sourceDatabase,...Object.values(destinations)]).size!==4||JSON.stringify({format:recovery['format'],formatVersion:1,expected,destinations})!==plan['recovery']||JSON.stringify({format:plan['format'],formatVersion:1,recovery:plan['recovery'],journal,source:sourceDatabase})!==input['plan']||await segmentedDigest('breditor/independent-operation/1\0'+input['plan'])!==input['operation'])throw fail();return{plan:input['plan'],operation:input['operation'],origin:original.sha256,sourceDatabase};
}
