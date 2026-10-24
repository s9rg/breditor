/** Actual snapshot parent record and literal input. Neither the old input
 * wrapper's grant nor a cached metadata value can replace the stored file. */
import type {RestoredLocalParticipantState} from './participant_state.js';
import type {SharedSelectionPolicy} from '../types.js';
import {readRestoredLocalParentDatabase} from './participant_database.js';
import {readRestoredLocalParentRecord} from './participant_record.js';
import {assetBytesDigest} from '../asset_bytes/format.js';
import {restoredLocalFailure as fail} from './failure.js';
export async function readSnapshotLocalParentRecords<P extends SharedSelectionPolicy>(s:RestoredLocalParticipantState<P>,check:()=>void){
 check();if(!s.db)throw fail('restored_local_participant_missing');const actual=await readRestoredLocalParentDatabase(s.db,check);check();if(actual.file.size!==s.file.size||actual.file.type!==s.file.type||await assetBytesDigest(new Uint8Array(await actual.file.arrayBuffer()))!==s.fileSha256)throw fail('restored_local_participant_input_changed');check();const parent=readRestoredLocalParentRecord(actual.record,s.record);if(parent.phase!=='operational'||JSON.stringify(parent)!==JSON.stringify(s.record))throw fail('restored_local_participant_record');
 return{format:'breditor/fresh-snapshot-local-parent-records' as const,formatVersion:1 as const,parent,selection:s.choice.expected,file:{role:'parent-input' as const,bytes:actual.file.size,sha256:s.fileSha256}};
}
