/** Actual flat parent input is identified by its verified canonical manifest,
 * preserving the original flat protocol rather than a snapshot digest rule. */
import type {FlatLocalParticipantState} from './participant_state.js';
import type {SharedSelectionPolicy} from '../types.js';
import {readFlatLocalParentDatabase} from './participant_database.js';
import {readFlatLocalParentRecord} from './participant_record.js';
import {verifyFlatLocalLiteral} from './literal_file.js';
import {flatLocalFailure as fail} from './failure.js';
export async function readFlatLocalParentRecords<P extends SharedSelectionPolicy>(s:FlatLocalParticipantState<P>,check:()=>void){
 check();if(!s.db)throw fail('flat_local_input_participant_missing');const actual=await readFlatLocalParentDatabase(s.db,check);check();await verifyFlatLocalLiteral(actual.file,{bytes:s.file.size,mime:s.file.type,manifestSha256:s.choice.expected.manifestSha256},check);check();const parent=readFlatLocalParentRecord(actual.record,s.record);if(parent.phase!=='operational'||JSON.stringify(parent)!==JSON.stringify(s.record))throw fail('flat_local_input_participant_record');
 return{format:'breditor/fresh-flat-local-parent-records' as const,formatVersion:1 as const,parent,selection:s.choice.expected,file:{role:'parent-input' as const,bytes:actual.file.size,manifestSha256:s.choice.expected.manifestSha256}};
}
