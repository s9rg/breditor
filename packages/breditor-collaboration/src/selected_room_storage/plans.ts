/** Namespace/table/key projection derives from the admitted complete room,
 * never an application-supplied database list. Shared document/history/cache
 * stores keep unrelated writers and documents outside this archive. */
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {cacheKey} from '../versions/database.js';import {queueKey} from '../suggestions/database.js';import {revisionKey} from '../suggestion_revisions/database.js';
import type {SharedDocumentVersionsIdentity} from '../versions/types.js';import type {SharedSuggestionQueueIdentity} from '../suggestions/types.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';import type {LocalReviewRoomBundle} from '../selected_local_review_delivery/contract.js';
import {fail,MAX_STORAGE_DATABASES} from './policy.js';
import type {StorageDatabasePlan,StorageRowSelection} from './contract.js';
const familyTables:Readonly<Record<string,Readonly<Record<string,readonly string[]>>>>={
 original:{operation:['operation','origin'],recovery:['attempts'],document:['journals'],versions:['catalogs'],suggestions:['suggestions'],revisions:['revisions']},
 generation:{operation:['generation_operation','generation_origin'],recovery:['generation_attempts','generation_files'],source:['generation_files','generation_heads']},
 'independent-local':{operation:['local_operation_participant'],journal:['local_operation_cuts','local_operation_intent','local_operation_original'],recovery:['independent_attempts','independent_originals'],'recovery-source':['history_files','history_heads'],source:['local_operation_history_files','local_operation_history_heads']},
 'independent-delivery':{operation:['operation_cuts','operation_intent','operation_original'],recovery:['delivery_attempts','delivery_originals'],'recovery-source':['delivery_history_files','delivery_history_heads'],source:['operation_history_files','operation_history_heads']},
 'restored-graph':{operation:['restored_participant_input','restored_participant_state'],journal:['restored_operation_cuts','restored_operation_input','restored_operation_original','restored_operation_stage'],source:['restored_operation_history_files','restored_operation_history_heads']},
 'local-operation-snapshot':{operation:['restored_local_participant','restored_local_participant_input'],journal:['restored_local_operation_cuts','restored_local_operation_input','restored_local_operation_intent'],source:['local_operation_history_files','local_operation_history_heads']},
 'local-operation-flat':{operation:['flat_local_participant_input','flat_local_participant_state'],journal:['flat_local_input_cuts','flat_local_input_incoming','flat_local_input_intent'],source:['local_operation_history_files','local_operation_history_heads']},
};
const outer={read:SelectedRoomCurrentArchive.read,current:SelectedRoomCurrentArchive.prototype.current,approval:SelectedRoomCurrentArchive.prototype.approval,dispose:SelectedRoomCurrentArchive.prototype.dispose},inner={read:PhysicalRoomRecordCutArchive.read,root:PhysicalRoomRecordCutArchive.prototype.root,records:PhysicalRoomRecordCutArchive.prototype.records,dispose:PhysicalRoomRecordCutArchive.prototype.dispose};
export async function selectedStoragePlans(current:SelectedRoomCurrentFile,localReview:LocalReviewRoomBundle|null,options:SharedArchiveIntegrityOptions):Promise<readonly StorageDatabasePlan[]>{let archive:SelectedRoomCurrentArchive|undefined,cut:PhysicalRoomRecordCutArchive|undefined;
 try{archive=await outer.read.call(SelectedRoomCurrentArchive,current.file,current.selection,options);const file=outer.current.call(archive);cut=await inner.read.call(PhysicalRoomRecordCutArchive,file.file,file.selection,options);const root=inner.root.call(cut),catalog=parsePhysicalCatalogV3Manifest(root.source.manifest),plans:StorageDatabasePlan[]=[];
  const add=(database:string,stores:readonly string[],selection:StorageRowSelection={kind:'whole'})=>{if(plans.some(row=>row.database===database)||plans.length>=MAX_STORAGE_DATABASES)throw fail('room_storage_policy');plans.push({database,stores:[...stores].sort(),selection});};
  add(root.database,['physical_room_catalog_operation_v3']);add(root.source.catalogDatabase,['physical_room_v3_files','physical_room_v3_state']);
  for(const participant of root.participants){const entry=catalog.participants.find(row=>row.id===participant.id);if(!entry||entry.family!==participant.family)throw fail();const native=entry.family==='original'?entry.selection.identity.source:entry.family==='generation'||entry.family==='independent-local'?entry.selection.identity.source.native:entry.family==='independent-delivery'?entry.selection.identity.source.history.native:entry.family==='restored-graph'?entry.selection.original.identity.source.history.native:entry.selection.original.identity.source.native;
   const prefix=[native.room,native.writer] as const,payload=await inner.records.call(cut,participant.id),basis=entry.family==='original'?recordLiveBasis('original',payload) as readonly {kind:string;json:string}[]:[];
   for(const namespace of participant.namespaces){if(namespace.role==='uploads'){add(namespace.database,['assets','metadata']);continue;}const stores=familyTables[entry.family]?.[namespace.role];if(!stores)throw fail('room_storage_policy');let selection:StorageRowSelection={kind:'whole'};
    if(namespace.role==='document')selection={kind:'keys',keys:[[...prefix]]};else if(namespace.role==='source'||namespace.role==='recovery-source')selection={kind:'prefix',prefix};
    else if(entry.family==='original'&&['versions','suggestions','revisions'].includes(namespace.role)){const kind=namespace.role==='versions'?'version-catalog':namespace.role==='suggestions'?'suggestions':'suggestion-revisions',record=basis.find(row=>row.kind===kind);if(!record)throw fail();const value=JSON.parse(record.json) as {identity:SharedDocumentVersionsIdentity&SharedSuggestionQueueIdentity;binding:string};selection={kind:'keys',keys:[namespace.role==='versions'?cacheKey(value.identity):namespace.role==='suggestions'?queueKey(value.identity):revisionKey(value.identity,value.binding)]};}
    add(namespace.database,stores,selection);
   }
  }
  const adoption=outer.approval.call(archive).choice.adoption;add(adoption.database,['bases','selection']);for(const target of adoption.participants)add(target.targetDatabase,['assets','metadata']);
  if(localReview){add(localReview.prepared.choice.database,['intent']);const text=await localReview.delivery.file.text(),snapshot=JSON.parse(text) as {before:{choice:{database:string}}};add(snapshot.before.choice.database,['state']);}
  options.checkAuthority();return plans.sort((a,b)=>a.database<b.database?-1:1);
 }finally{if(cut)inner.dispose.call(cut);if(archive)outer.dispose.call(archive);}
}
