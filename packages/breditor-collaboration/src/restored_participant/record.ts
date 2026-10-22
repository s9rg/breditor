/** Ordered upload/source publication. Data stages are not actual owners or activation. */
import {generationFields} from '../generation_source/identity.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
export interface RestoredParticipantRecord {readonly format:'breditor/shared-restored-participant';readonly formatVersion:1;readonly plan:string;readonly uploads:'reserved'|'started'|'complete';readonly source:'reserved'|'started'|'complete'}
const stages=['reserved','started','complete'];
export const initialRestoredParticipant=(plan:string):RestoredParticipantRecord=>({format:'breditor/shared-restored-participant',formatVersion:1,plan,uploads:'reserved',source:'reserved'});
export function readRestoredParticipantRecord(raw:unknown,plan:string):RestoredParticipantRecord{
 if(!generationFields(raw,'format,formatVersion,plan,uploads,source'))throw fail('restored_participant_record');const r=raw as unknown as RestoredParticipantRecord;
 if(r.format!=='breditor/shared-restored-participant'||r.formatVersion!==1||r.plan!==plan||!stages.includes(r.uploads)||!stages.includes(r.source)||r.uploads!=='complete'&&r.source!=='reserved')throw fail('restored_participant_record');return{format:r.format,formatVersion:1,plan,uploads:r.uploads,source:r.source};
}
export function checkRestoredParticipantTransition(before:RestoredParticipantRecord,next:RestoredParticipantRecord):void{
 readRestoredParticipantRecord(before,before.plan);readRestoredParticipantRecord(next,before.plan);
 if(before.uploads!=='complete'?next.source!==before.source||stages.indexOf(next.uploads)!==stages.indexOf(before.uploads)+1:next.uploads!=='complete'||stages.indexOf(next.source)!==stages.indexOf(before.source)+1)throw fail('restored_participant_record');
}
