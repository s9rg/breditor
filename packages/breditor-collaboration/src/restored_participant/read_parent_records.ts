/** Read the actual coordinated graph parent record and literal protected file.
 * Source reference admission separately replays both historical input anchors. */
import {readRestoredParticipantDatabase} from './database.js';
import {readRestoredParticipantRecord} from './record.js';
import {independentDeliveryParticipantDigest} from '../independent_delivery_participant/codec.js';
import type {RestoredOperationInput} from '../restored_operation/input.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
export async function readRestoredDeliveryParentRecords(db:IDBDatabase,input:RestoredOperationInput,plan:string,check:()=>void,signal:AbortSignal|undefined){
 check();const actual=await readRestoredParticipantDatabase(db);check();const parent=readRestoredParticipantRecord(actual.record,plan);if(parent.source!=='complete'||parent.uploads!=='complete')throw fail('restored_participant_not_ready');if(await independentDeliveryParticipantDigest(actual.file,signal)!==input.fileSha256)throw fail('restored_participant_input_changed');check();
 return{format:'breditor/fresh-restored-delivery-parent-records' as const,formatVersion:1 as const,parent,input:{kind:input.kind,selection:input.selection,fileSha256:input.fileSha256},file:{role:'parent-input' as const,bytes:actual.file.size,sha256:input.fileSha256}};
}
