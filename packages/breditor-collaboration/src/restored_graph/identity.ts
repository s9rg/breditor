/** Private data admission for explicitly restored provenance. No owner or grant. */
import {generationFields,freezeGeneration} from '../generation_source/identity.js';
import {independentDeliveryParticipantSelection} from '../independent_delivery_participant/policy.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import {operationBackupSelection, operationPortableHash} from '../independent_operation/portable_identity.js';
import {operationDatabaseName} from '../independent_operation/journal_identity.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';

export async function readRestoredOperationIdentity(raw:unknown,originalInput:SharedIndependentDeliveryParticipantSelection){
 const original=independentDeliveryParticipantSelection(originalInput);
 if(!generationFields(raw,'plan,operation,origin,sourceDatabase'))throw fail('restored_operation_identity');
 const {plan:planText,operation,origin,sourceDatabase:source}=raw;
 if(typeof planText!=='string'||new TextEncoder().encode(planText).length>132*1024||!operationPortableHash(operation)||origin!==original.sha256)throw fail('restored_operation_identity');
 const plan:unknown=JSON.parse(planText);
 if(!plan||typeof plan!=='object'||Array.isArray(plan))throw fail('restored_operation_identity');
 const coordinated='format'in plan&&plan.format==='breditor/shared-coordinated-restored-operation-plan';
 if(!generationFields(plan,coordinated?'format,formatVersion,input,journal,source,cohort':'format,formatVersion,input,journal,source')||plan['format']!==(coordinated?'breditor/shared-coordinated-restored-operation-plan':'breditor/shared-restored-operation-plan')||(plan['formatVersion']!==1&&plan['formatVersion']!==2)||!generationFields(plan['input'],'kind,selection,fileSha256'))throw fail('restored_operation_identity');
 const kind=plan['input']['kind'],selection=operationBackupSelection(plan['input']['selection']),fileSha256=plan['input']['fileSha256'];
 if((plan['formatVersion']===1?kind!=='snapshot-v1'&&kind!=='lineage-v1':kind!=='lineage-v2')||!operationPortableHash(fileSha256)||JSON.stringify(selection.original)!==JSON.stringify(original))throw fail('restored_operation_identity');
 const journal=operationDatabaseName(plan['journal']),sourceDatabase=operationDatabaseName(plan['source']);
 if(source!==sourceDatabase||journal===sourceDatabase)throw fail('restored_operation_identity');
 let cohort:Readonly<{coordinatorDatabase:string;uploadsDatabase:string}>|undefined;
 if(coordinated){if(!generationFields(plan['cohort'],'coordinatorDatabase,uploadsDatabase'))throw fail('restored_operation_identity');cohort=Object.freeze({coordinatorDatabase:operationDatabaseName(plan['cohort']['coordinatorDatabase']),uploadsDatabase:operationDatabaseName(plan['cohort']['uploadsDatabase'])});if(new Set([journal,sourceDatabase,...Object.values(cohort)]).size!==4)throw fail('restored_operation_identity');}
 const input=Object.freeze({kind,selection,fileSha256}),version=plan['formatVersion'],canonical=JSON.stringify({format:plan['format'],formatVersion:version,input,journal,source:sourceDatabase,...(cohort?{cohort}:{})});
 if(canonical!==planText||await segmentedDigest((coordinated?'breditor/coordinated-restored-operation/':'breditor/restored-operation/')+version+'\0'+planText)!==operation)throw fail('restored_operation_identity');
 return freezeGeneration({identity:{plan:planText,operation,origin:original.sha256,sourceDatabase},input,journal,sourceDatabase,...(cohort?{cohort}:{})});
}
