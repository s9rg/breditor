/** Re-admit actual independent-local parent DATA before native reconstruction.
 * Read-only factories and literal files grant neither phase, namespace custody
 * nor source ACKs. Every declared plan must bind the complete record-cut layout. */
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import {snapshotIndependentRecovery} from '../independent_recovery/prepare.js';
import {checkIndependentRecoveryRecord} from '../independent_recovery/record.js';
import {localParticipantRecord,readLocalParticipantRecord} from '../independent_local_operation/participant_record.js';
import {localOperationJournalIdentity} from '../independent_local_operation/journal_identity.js';
import {PhysicalRoomRecordCutArchive as Cut} from '../physical_room_record_cut/archive.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {fields,fail} from './policy.js';
const root=Cut.prototype.root,inputs=Cut.prototype.inputs,same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export async function admitLocalReconstructionParent(source:Loaded,id:string,provided:unknown,session:SharedIndependentRecoveryFactory,options:SharedAssetBytesOptions,check:()=>void){
 source.check();const entry=source.participant(id);if(entry.family!=='independent-local')throw fail('native_reconstruction_policy');
 const cut=source.nativeCut(),member=root.call(cut).participants.find(row=>row.id===id);if(!member||member.family!=='independent-local')throw fail();
 const namespace=(role:string)=>{const row=member.namespaces.find(row=>row.role===role);if(!row)throw fail();return row.database;},names=['operation','journal','source','recovery','recovery-source','uploads'].map(namespace);if(new Set(names).size!==6)throw fail();
 const files=inputs.call(cut,id);if(files.length!==1||files[0]?.role!=='source-origin')throw fail();
 const base=snapshotIndependentRecovery({database:namespace('recovery'),expected:entry.selection,destinations:{source:namespace('recovery-source'),uploads:namespace('uploads')},session,checkAuthority:check,...options},false),expected=await localParticipantRecord({database:namespace('operation'),journalDatabase:namespace('journal'),sourceDatabase:namespace('source'),base,guard:check});check();
 const payload=fields(provided,['format','formatVersion','parent','recovery','original','file']),file=fields(payload['file'],['role','bytes','sha256']),parent=readLocalParticipantRecord(payload['parent'],expected),recovery=checkIndependentRecoveryRecord(payload['recovery'],base.record);
 if(payload['format']!=='breditor/fresh-independent-local-parent-records'||payload['formatVersion']!==1||parent.phase!=='operational'||recovery.phase!=='ready'||recovery.source!=='complete'||recovery.uploads!=='complete'||!same(payload['original'],entry.selection)||file['role']!=='recovery-origin'||file['bytes']!==files[0].file.size||file['sha256']!==entry.selection.sha256)throw fail();
 const identity=await localOperationJournalIdentity(namespace('journal'),namespace('source'),entry.selection);check();return identity;
}
