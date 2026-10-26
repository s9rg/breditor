/** Original parent DATA is checked through its original plan/record codecs.
 * Historical review access and limits remain inert old plan data, never current
 * permission or new decode policy. No source, token or transport opens here. */
import {SharedParticipantBackup as Backup} from '../participant_backup/archive.js';
import type {SharedParticipantRecoveryOptions,SharedParticipantRecoverySession} from '../participant_recovery/types.js';
import {prepareRecovery} from '../participant_recovery/prepare.js';
import {checkRecoveryRecord} from '../participant_recovery/journal.js';
import {operationRecord,checkOperationRecord} from '../participant_operation/record.js';
import type {OriginalRecordReferenceOptions} from '../persistence/original_record_reference_capture.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import type {AssetLimits} from '@breditor/experimental-rich-content';
import {independentParticipantDigest as digest} from '../independent_participant/codec.js';
import {PhysicalRoomRecordCutArchive as Cut} from '../physical_room_record_cut/archive.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {fields,fail} from './policy.js';
const root=Cut.prototype.root,inputs=Cut.prototype.inputs,selection=Backup.prototype.selection,same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export async function admitOriginalReconstructionParent(source:Loaded,id:string,backup:Backup,read:Pick<OriginalRecordReferenceOptions,'restore'|'editor'>,options:SharedAssetBytesOptions,check:()=>void){
 source.check();const entry=source.participant(id);if(entry.family!=='original'||!same(selection.call(backup),entry.selection))throw fail('native_reconstruction_policy');
 const cut=source.nativeCut(),member=root.call(cut).participants.find(row=>row.id===id);if(!member||member.family!=='original')throw fail();
 const namespace=(role:string)=>{const row=member.namespaces.find(row=>row.role===role);if(!row)throw fail();return row.database;},stores=entry.selection.identity.stores;
 const destinations={document:namespace('document'),uploads:namespace('uploads'),...(stores.includes('suggestions')?{suggestions:namespace('suggestions')}:{}),...(stores.includes('suggestion-revisions')?{revisions:namespace('revisions')}:{}),...(stores.includes('version-catalog')?{versions:namespace('versions')}:{})};
 const files=inputs.call(cut,id);if(files.length!==1||files[0]?.role!=='operation-origin')throw fail();if(await digest(files[0].file,options.signal)!==entry.selection.sha256)throw fail();check();
 const stored=fields(await source.records(id),['parent','source']),payload=fields(stored['parent'],['format','formatVersion','scope','selection','operation','recovery','files']);check();
 if(payload['format']!=='breditor/original-operational-record-read'||payload['formatVersion']!==1||payload['scope']!=='held-original-parent-marker-and-archive'||!same(payload['selection'],entry.selection))throw fail();
 const recovery=fields(payload['recovery'],['format','formatVersion','plan','phase','steps']);if(typeof recovery['plan']!=='string')throw fail();let raw:unknown;try{raw=JSON.parse(recovery['plan']);}catch{throw fail();}
 const plan=fields(raw,['selection','destinations','session','suggestions','revisions','versions','limits']),session=fields(plan['session'],['kind','review','relay','reviewedHistory']);
 if(!same(plan['selection'],entry.selection))throw fail();const p=entry.selection.identity.source;
 // This throwing sentinel cannot contact a host. prepareRecovery only validates
 // immutable backup/policy envelopes; invoking transport would fail the read.
 const transport=new Proxy(Object.create(null),{get(){throw fail('native_reconstruction_policy');}}) as NonNullable<SharedParticipantRecoveryOptions['revisions']>['transport'];
 const originalSession={kind:session['kind'],options:{...p,restore:read.restore,readOnly:true,...(read.editor?{editor:read.editor}:{}),...(session['review']===null?{}:{review:session['review']}),...(session['relay']===null?{}:{relay:session['relay']}),...(session['reviewedHistory']===null?{}:{reviewedHistory:session['reviewedHistory']})}} as SharedParticipantRecoverySession;
 const prepared=await prepareRecovery({database:namespace('recovery'),backup,expected:entry.selection,destinations,session:originalSession,...(plan['suggestions']===null?{}:{suggestions:plan['suggestions'] as NonNullable<SharedParticipantRecoveryOptions['suggestions']>}),...(plan['revisions']===null?{}:{revisions:{binding:plan['revisions'] as string,transport}}),...(plan['versions']===null?{}:{versions:{identity:plan['versions'] as NonNullable<SharedParticipantRecoveryOptions['versions']>['identity'],getToken(){throw fail('native_reconstruction_policy');}}}),limits:plan['limits'] as Partial<AssetLimits>,checkAuthority:check,...(options.signal?{signal:options.signal}:{})});check();
 const admitted=checkRecoveryRecord(payload['recovery'],prepared.record),operation=checkOperationRecord(payload['operation'],operationRecord(namespace('recovery'),prepared.record.plan));
 if(admitted.phase!=='ready'||admitted.steps.some(row=>row.state!=='complete'))throw fail();
 // The protected original read permits its actual prepared/operational marker.
 // Preserve that old meaning; neither known phase is a source ownership grant.
 if(!['prepared','operational'].includes(operation.phase))throw fail();
 if(!Array.isArray(payload['files'])||payload['files'].length!==1)throw fail();const file=fields(payload['files'][0],['role','bytes','sha256']);if(file['role']!=='operation-origin'||file['bytes']!==files[0].file.size||file['sha256']!==entry.selection.sha256)throw fail();check();
}
