/** Asset staging admission from the SAME complete-record reservation. Never
 * acquire a second native reader (or trust a detached source DTO) between the
 * selected document/history bytes and the selected upload bases. */
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {PhysicalOperationV3Custody} from './operation.js';
import type {PhysicalHistoryAssetVisit} from './history_read.js';
import type {PhysicalAssetReadScope,PhysicalAssetNativePin} from './asset_read_contract.js';
import type {PhysicalRoomRecordCutParticipant} from '../physical_room_record_cut/contract.js';
import {checkRecordCutSource} from '../physical_room_record_cut/manifest.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {physicalOperationV3Failure as fail} from './policy.js';
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw fail('physical_operation_v3_diverged');return value as Record<string,unknown>;}
function checkpoint(value:unknown):string{if(typeof value!=='string'||!value)throw fail('physical_operation_v3_diverged');return value;}
function kind(value:unknown):'original'|'segmented-v1'{if(value!=='original'&&value!=='segmented-v1')throw fail('physical_operation_v3_diverged');return value;}
/** Only called on private SDK payload producers, never decoded incoming data.
 * Family layouts stay explicit; the new approval contract rejects a review
 * lane that was not selected rather than pretending it was captured. */
async function native(row:PhysicalRoomRecordCutParticipant,digest:(file:Blob)=>Promise<string>):Promise<PhysicalAssetNativePin>{
 checkRecordCutSource(row.payload.state,row.family);const source=object(object(row.payload.state)['source']);let document:string,review:string|null,documentKind:PhysicalAssetNativePin['document']['kind'],reviewKind:'original'|'segmented-v1';
 if(row.family==='original'){const value=object(source['native']),live=object(value['live']);document=checkpoint(live['documentCheckpointJson']??live['checkpoint']);documentKind='original';reviewKind='original';review=live['reviewCheckpointJson']===undefined?null:checkpoint(live['reviewCheckpointJson']);}
 else if(row.family==='generation'){const live=object(object(source['records'])['live']);document=checkpoint(live['checkpoint']);const selected=live['review'];review=selected===null?null:checkpoint(object(selected)['checkpoint']);documentKind=source['formatVersion']===2?'continued-v2':'segmented-v1';reviewKind='original';}
 else{const value=object(source['live']),live=row.family==='independent-delivery'||row.family==='restored-graph'?object(value['source']):value,identity=object(live['identity']);document=checkpoint(live['documentCheckpoint']);review=checkpoint(live['reviewCheckpoint']);documentKind=kind(identity['documentHistory']);reviewKind=kind(identity['reviewHistory']);}
 return frozen({document:{kind:documentKind,sha256:await digest(new Blob([document]))},review:review===null?{kind:'absent'}:{kind:reviewKind,sha256:await digest(new Blob([review]))}});
}
export async function recordAssetScope(s:PhysicalOperationV3Custody,scope:PhysicalHistoryAssetVisit):Promise<PhysicalAssetReadScope>{
 if(!scope.root||!scope.recordPayloads)throw fail('physical_operation_v3_policy');scope.check();const records=scope.recordPayloads(),participants=[];
 for(const child of s.children){const id=child.selected.target.id,row=records.find(row=>row.id===id),file=scope.uploads.find(row=>row.id===id)?.file,sourceDatabase=child.selected.target.namespaces.find(row=>row.role==='uploads')?.database;if(!row||row.family!==child.selected.target.family||!file||!sourceDatabase)throw fail('physical_operation_v3_diverged');const input=child.selected.input,limits=checkRichAssetLimits(input.family==='original'||input.family==='generation'?input.recovery.limits:input.family==='independent-local'||input.family==='independent-delivery'?input.options.recovery.limits:input.options.limits);
  participants.push(frozen({id,family:child.selected.target.family,sourceDatabase,native:await native(row,scope.digest),limits,uploads:file,uploadsSha256:await scope.digest(file)}));scope.check();
 }
 participants.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);const chosen=new Set(participants.map(row=>row.id));return Object.freeze({source:frozen({operationDatabase:s.database,catalogDatabase:s.held.database,catalog:s.held.state.selection,intentSha256:await scope.digest(new Blob([JSON.stringify(s.record)]))}),namespaces:Object.freeze([s.database,s.held.database,...s.record.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))]),participants:Object.freeze(participants),unreconciledParticipants:Object.freeze(s.held.state.metadata.participants.filter(row=>!chosen.has(row.id)).map(row=>row.id)),check:scope.check,digest:scope.digest});
}
