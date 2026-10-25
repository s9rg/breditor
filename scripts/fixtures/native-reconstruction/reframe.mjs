/** Reframe deliberately invalid source DATA for semantic refusal tests. Literal
 * files, full upload stores and root identities are retained; no source/custody
 * constructor, writer grant or actual stored journal row is manufactured. */
import {encodePhysicalRoomRecordCut} from '../../../packages/breditor-collaboration/dist/physical_room_record_cut/capture.js';
import {encodeSelectedRoomCurrent} from '../../../packages/breditor-collaboration/dist/selected_room_current/archive.js';
import {prepareArchiveIntegrity} from '../../../packages/breditor-collaboration/dist/archive_integrity/context.js';
export async function reframeReconstructionRecords(input,wasm,id,mutate){
 input.check();const reader=input.nativeCut(),record=reader.root(),participants=[],uploads=[],selected=[];
 const integrity={wasm,checkAuthority:input.check},context=prepareArchiveIntegrity(integrity),approval=input.approval();
 for(const row of record.participants){const state=await reader.records(row.id);if(row.id===id)mutate(state.source);participants.push({id:row.id,family:row.family,payload:{family:row.family,state,files:reader.inputs(row.id)}});uploads.push({id:row.id,family:row.family,file:reader.uploads(row.id)});const policy=approval.choice.adoption.participants.find(value=>value.id===row.id),file=input.selectedUploads(row.id);selected.push({id:row.id,database:policy.targetDatabase,file,sha256:await context.digest(file)});}
 const root=await encodePhysicalRoomRecordCut({root:{operationDatabase:record.database,catalogDatabase:record.source.catalogDatabase,record,files:[...reader.catalogFiles()].map(([name,file])=>({name,file}))},history:reader.history(),participants,uploads},context);input.check();return encodeSelectedRoomCurrent({approval,root,uploads:selected},integrity);
}
