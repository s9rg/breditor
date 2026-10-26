/** Explicit parent plan and monotone publication. Flags never replace actual
 * component ownership; first publication requires exact original snapshots. */
import {generationFields} from '../generation_source/identity.js';
import {independentParticipantDigest} from '../independent_participant/codec.js';
import type {LocalParticipantChoice} from './participant_prepare.js';
import {localJournalFailure as fail} from './journal_failure.js';
export interface LocalParticipantRecord{readonly format:'breditor/shared-independent-local-operation-participant';readonly formatVersion:1;readonly plan:string;readonly operation:string;readonly phase:'preparing'|'prepared'|'operational'}
export async function localParticipantRecord(choice:Pick<LocalParticipantChoice,'database'|'journalDatabase'|'sourceDatabase'|'base'|'guard'>):Promise<LocalParticipantRecord>{
 const plan=JSON.stringify({format:'breditor/shared-independent-local-operation-participant-plan',formatVersion:1,database:choice.database,journalDatabase:choice.journalDatabase,sourceDatabase:choice.sourceDatabase,recoveryDatabase:choice.base.options.database,recoveryPlan:choice.base.record.plan});if(new TextEncoder().encode(plan).length>128*1024)throw fail('independent_local_participant_policy');
 choice.guard();const operation=await independentParticipantDigest(new Blob(['breditor/local-operation-participant/1\0',plan]),choice.base.options.signal);choice.guard();return{format:'breditor/shared-independent-local-operation-participant',formatVersion:1,plan,operation,phase:'preparing'};
}
export function readLocalParticipantRecord(raw:unknown,expected:LocalParticipantRecord):LocalParticipantRecord{
 if(!generationFields(raw,'format,formatVersion,plan,operation,phase'))throw fail('independent_local_participant_record');const r=raw as unknown as LocalParticipantRecord;
 if(r.format!==expected.format||r.formatVersion!==1||r.plan!==expected.plan||r.operation!==expected.operation||!['preparing','prepared','operational'].includes(r.phase))throw fail('independent_local_participant_record');return{format:r.format,formatVersion:1,plan:r.plan,operation:r.operation,phase:r.phase};
}
export function checkLocalParticipantTransition(before:LocalParticipantRecord,next:LocalParticipantRecord):void{readLocalParticipantRecord(next,before);const phases=['preparing','prepared','operational'];if(phases.indexOf(next.phase)!==phases.indexOf(before.phase)+1)throw fail('independent_local_participant_record');}
