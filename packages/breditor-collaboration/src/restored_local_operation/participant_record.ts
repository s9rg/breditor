/** Explicit parent phases are data, never native/upload ownership proofs. */
import {generationFields} from '../generation_source/identity.js';
import {segmentedDigest} from '../persistence/segmented_checkpoint.js';
import {restoredLocalInput as incoming,type DetachedRestoredLocalInput} from './input.js';
import {restoredLocalFailure as fail} from './failure.js';
export interface RestoredLocalParentRecord{readonly format:'breditor/shared-restored-local-operation-participant';readonly formatVersion:1;readonly plan:string;readonly operation:string;readonly phase:'preparing'|'prepared'|'operational'}
export async function restoredLocalParentRecord(input:DetachedRestoredLocalInput):Promise<RestoredLocalParentRecord>{
 const id=incoming.identity.call(input),selected=JSON.parse(id.plan);if(!selected.cohort)throw fail('restored_local_participant_policy');
 const plan=JSON.stringify({format:'breditor/shared-restored-local-operation-participant-plan',formatVersion:1,inputOperation:id.operation,inputFileSha256:selected.input.fileSha256,parentDatabase:selected.cohort.parentDatabase,journalDatabase:id.database,sourceDatabase:id.sourceDatabase,uploadsDatabase:selected.cohort.uploadsDatabase});
 if(new TextEncoder().encode(plan).length>128*1024)throw fail();return{format:'breditor/shared-restored-local-operation-participant',formatVersion:1,plan,operation:await segmentedDigest('breditor/restored-local-participant/1\0'+plan),phase:'preparing'};
}
export function readRestoredLocalParentRecord(raw:unknown,expected:RestoredLocalParentRecord):RestoredLocalParentRecord{
 if(!generationFields(raw,'format,formatVersion,plan,operation,phase'))throw fail('restored_local_participant_record');const r=raw as unknown as RestoredLocalParentRecord;
 if(r.format!==expected.format||r.formatVersion!==1||r.plan!==expected.plan||r.operation!==expected.operation||!['preparing','prepared','operational'].includes(r.phase))throw fail('restored_local_participant_record');return{format:r.format,formatVersion:1,plan:r.plan,operation:r.operation,phase:r.phase};
}
export function checkRestoredLocalParentTransition(before:RestoredLocalParentRecord,next:RestoredLocalParentRecord){readRestoredLocalParentRecord(next,before);const phases=['preparing','prepared','operational'];if(phases.indexOf(next.phase)!==phases.indexOf(before.phase)+1)throw fail('restored_local_participant_record');}
