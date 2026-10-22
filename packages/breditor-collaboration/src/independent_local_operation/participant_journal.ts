/** Admit an actual journal inside the parent's genuine reserved subset. Only
 * explicit resume may reconcile an already retained first-stage journal. */
import type {PreparedIndependentRecovery} from '../independent_recovery/prepare.js';
import {existingDatabase} from '../participant_recovery/journal.js';
import {openLocalJournalForParticipant} from './cut_journal.js';
import type {LocalOperationParticipantOpening} from './participant_opening.js';
import type {LocalParticipantChoice} from './participant_prepare.js';
import type {LocalParticipantRecord} from './participant_record.js';
import {localJournalFailure as fail} from './journal_failure.js';
export async function prepareLocalParticipantJournal(opening:LocalOperationParticipantOpening,choice:LocalParticipantChoice,p:PreparedIndependentRecovery,record:LocalParticipantRecord,resume:boolean){
 choice.guard();let existing=false;if(resume){const db=await existingDatabase(choice.journalDatabase);existing=!!db;db?.close();choice.guard();if(record.phase!=='preparing'&&!existing)throw fail('independent_local_participant_missing');}
 const options={database:choice.journalDatabase,sourceDatabase:choice.sourceDatabase,expected:p.options.expected,session:p.options.session,checkAuthority:choice.lifetime,writerRecovery:'host-reacquired' as const,limits:p.options.limits,...(p.options.signal?{signal:p.options.signal}:{})};
 const begin={...options,backup:p.backup};return openLocalJournalForParticipant(opening,existing?options:begin,existing);
}
