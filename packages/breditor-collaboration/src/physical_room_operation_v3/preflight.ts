/** Whole-cohort structural admission before any child authority, native factory
 * or storage open. Every retained duplicate remains in the source catalog;
 * selecting two copies of one writer/actor is not two independent clients. */
import type {PhysicalCatalogV3ArchiveState} from '../physical_room_catalog_v3/archive.js';
import {physicalCatalogV3ParticipantHeader} from '../physical_room_catalog_v3/participant.js';
import type {PhysicalRoomCatalogV3Entry} from '../physical_room_catalog_v3/contract.js';
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {readPairedBackupRecord} from '../backups/paired.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {snapshotPhysicalOperationV3Policy as snapshot,physicalOperationV3PolicyFields as fields} from './policy_snapshot.js';
import {operationV3Rows as rows} from './input_snapshot.js';
import {checkPhysicalOperationV3Namespaces} from './namespaces.js';
import type {PhysicalOperationV3Participant,PhysicalOperationV3Target,PhysicalOperationV3Role} from './contract.js';
import {physicalOperationV3Failure as fail,physicalOperationV3Name as name,physicalOperationV3Database as dbName} from './policy.js';
const originalRecords=SharedParticipantBackup.prototype.records;
type Identity=Readonly<{principal:string;room:string;writer:string;richLanguage:1|2|3;actor:string|undefined;reviewPrincipal:string|undefined}>;
/** Only admitted catalog data supplies provenance, never caller policy fields. */
function identity(source:PhysicalCatalogV3ArchiveState,entry:PhysicalRoomCatalogV3Entry):Identity{
 if(entry.family==='original'){
  const selected=entry.selection.identity,client=source.clients.get(entry.id);if(!client||client.family!=='original')throw fail('physical_operation_v3_diverged');
  const paired=originalRecords.call(client.backup).find(row=>row.kind==='paired-session'),record=paired&&readPairedBackupRecord(paired.json,selected.source);
  return{principal:selected.principal,...selected.source,actor:record?.reviewActor,reviewPrincipal:record?.principal};
 }
 const result=(principal:string,native:Pick<Identity,'room'|'writer'|'richLanguage'>,review:{actor:string;principal:string}|null|undefined):Identity=>({principal,room:native.room,writer:native.writer,richLanguage:native.richLanguage,actor:review?.actor,reviewPrincipal:review?.principal});
 switch(entry.family){
  case'generation':{const id=entry.selection.identity;return result(id.principal,id.source.native,id.source.review);}
  case'independent-local':{const id=entry.selection.identity;return result(id.principal,id.source.native,id.source.review);}
  case'independent-delivery':{const id=entry.selection.identity;return result(id.principal,id.source.history.native,id.source.history.review);}
  case'restored-graph':{const id=entry.selection.original.identity;return result(id.principal,id.source.history.native,id.source.history.review);}
  case'local-operation-snapshot':case'local-operation-flat':{const id=entry.selection.original.identity;return result(id.principal,id.source.native,id.source.review);}
 }
}
function authority(input:unknown):void{if(typeof input!=='function')throw fail('physical_operation_v3_policy');participantAuthority(input as ()=>void);}
export interface PhysicalOperationV3PreparedTarget{readonly input:PhysicalOperationV3Participant;readonly target:PhysicalOperationV3Target;readonly identity:Identity}
/** No callbacks, storage requests, format conversion or writer construction.
 * Deep policy snapshots also prevent an earlier callback from changing a later
 * selected destination, grant or factory between preflight and admission. */
export function preflightPhysicalOperationV3(input:readonly PhysicalOperationV3Participant[],source:PhysicalCatalogV3ArchiveState,database:string,catalogDatabase:string):readonly PhysicalOperationV3PreparedTarget[]{
 if(!source.published)throw fail('physical_operation_v3_closed');const root=dbName(database),catalog=dbName(catalogDatabase);if(root===catalog)throw fail('physical_operation_v3_policy');
 const choices=rows(input,value=>snapshot(value)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);if(!choices.length)throw fail('physical_operation_v3_policy');
 const used=new Set([root,catalog]),ids=new Set<string>(),writers=new Set<string>(),actors=new Set<string>(),native=source.inventory.metadata().native;
 return Object.freeze(choices.map(input=>{
  const id=name(input.id),family=input.family,entry=source.metadata.participants.find(row=>row.id===id);if(ids.has(id)||!entry||entry.family!==family||source.clients.get(id)?.family!==family)throw fail('physical_operation_v3_policy');ids.add(id);
  const namespaces:{role:PhysicalOperationV3Role;database:string}[]=[],add=(role:PhysicalOperationV3Role,value:unknown)=>namespaces.push({role,database:dbName(value)});
  let expected:unknown;const row=fields(input,['id','family',...(family==='original'||family==='generation'?['operationDatabase','recovery','currentPolicy','checkAuthority']:['options']),...(family==='independent-delivery'?['stagingSession']:[])],family==='original'||family==='generation'?['signal']:[]);
  if(family==='original'||family==='generation'){
   authority(row['checkAuthority']);const current=fields(row['currentPolicy'],['documentReadOnly','reviewAccess']);if(typeof current['documentReadOnly']!=='boolean'||!['read_only','comment','moderate',null].includes(current['reviewAccess'] as never))throw fail('physical_operation_v3_policy');
   const recovery=fields(row['recovery'],['database','destinations','session'],family==='original'?['suggestions','revisions','versions','limits']:['limits']);add('operation',row['operationDatabase']);add('recovery',recovery['database']);
   const destinations=fields(recovery['destinations'],family==='original'?['document','uploads']:['source','uploads'],family==='original'?['suggestions','revisions','versions']:[]);
   for(const[role,value]of Object.entries(destinations))add(role as PhysicalOperationV3Role,value);
   const session=fields(recovery['session'],['kind','options']),options=session['options'] as {review?:{actor?:unknown}};
   const provenance=identity(source,entry);if(provenance.actor!==options?.review?.actor)throw fail('physical_operation_v3_policy');
   if((provenance.actor===undefined)!==(current['reviewAccess']===null))throw fail('physical_operation_v3_policy');
  }else{
   const options=fields(row['options'],family==='independent-local'?['database','journalDatabase','sourceDatabase','recovery','session','writerRecovery']:family==='independent-delivery'?['database','sourceDatabase','recovery','writerRecovery']:family==='restored-graph'?['kind','expected','database','journalDatabase','sourceDatabase','uploadsDatabase','writerRecovery','session','checkAuthority']:['kind','expected','database','sourceDatabase','sourceFactory','writerRecovery','checkAuthority','cohort'],family==='independent-local'||family==='independent-delivery'?[]:['signal','limits']);
   if(options['writerRecovery']!=='host-reacquired')throw fail('physical_operation_v3_policy');
   if(family==='independent-local'||family==='independent-delivery'){
    const recovery=fields(options['recovery'],['database','expected','destinations','session','checkAuthority'],['signal','limits']);authority(recovery['checkAuthority']);const destinations=fields(recovery['destinations'],['source','uploads']);expected=recovery['expected'];
    add('operation',options['database']);add('source',options['sourceDatabase']);add('recovery',recovery['database']);add('recovery-source',destinations['source']);add('uploads',destinations['uploads']);
    if(family==='independent-local'){add('journal',options['journalDatabase']);if((options['session'] as {database?:unknown})?.database!==options['sourceDatabase'])throw fail('physical_operation_v3_policy');}
    else{const staging=row['stagingSession'] as {readOnly?:unknown;review?:{access?:unknown}};if(!staging||staging.readOnly!==true||staging.review?.access!=='read_only')throw fail('physical_operation_v3_policy');}
   }else{
    authority(options['checkAuthority']);expected=options['expected'];add('source',options['sourceDatabase']);
    if(family==='restored-graph'){if(options['kind']!=='lineage-v2')throw fail('physical_operation_v3_policy');add('operation',options['database']);add('journal',options['journalDatabase']);add('uploads',options['uploadsDatabase']);}
    else{if(options['kind']!==(family==='local-operation-snapshot'?'snapshot-v1':'flat-local-v1'))throw fail('physical_operation_v3_policy');const cohort=fields(options['cohort'],['parentDatabase','uploadsDatabase']);add('operation',cohort['parentDatabase']);add('journal',options['database']);add('uploads',cohort['uploadsDatabase']);}
   }
   const selected=physicalCatalogV3ParticipantHeader({id,family,selection:expected});if(JSON.stringify(selected.selection)!==JSON.stringify(entry.selection))throw fail('physical_operation_v3_diverged');
  }
  namespaces.sort((a,b)=>a.role<b.role?-1:a.role>b.role?1:0);const exact=checkPhysicalOperationV3Namespaces(family,namespaces,used),provenance=identity(source,entry),writer=native.writers.find(row=>row.clock.writer===provenance.writer);
  if(provenance.room!==native.room.document||provenance.richLanguage!==native.richLanguage||!writer||writer.principal!==provenance.principal||writers.has(provenance.writer))throw fail('physical_operation_v3_diverged');writers.add(provenance.writer);
  if(provenance.actor!==undefined){const actor=native.review?.writers.find(row=>row.clock.actor===provenance.actor);if(!actor||actor.principal!==provenance.reviewPrincipal||provenance.reviewPrincipal!==provenance.principal||actors.has(provenance.actor))throw fail('physical_operation_v3_diverged');actors.add(provenance.actor);}
  return Object.freeze({input,target:Object.freeze({id,family,namespaces:Object.freeze(exact.map(row=>Object.freeze(row)))}),identity:Object.freeze(provenance)});
 }));
}
