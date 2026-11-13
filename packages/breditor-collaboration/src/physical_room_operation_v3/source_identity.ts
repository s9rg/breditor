/** Provenance comes only from the already admitted catalog and exact native
 * family. Local review stays unbound; matching an actor never invents a relay. */
import type {PhysicalCatalogV3ArchiveState} from '../physical_room_catalog_v3/archive.js';
import type {PhysicalRoomCatalogV3Entry} from '../physical_room_catalog_v3/contract.js';
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {readPairedBackupRecord} from '../backups/paired.js';
import {physicalOperationV3Failure as fail} from './policy.js';
type History='original'|'segmented-v1';
type DocumentHistory=History|'continued-v2';
type ReviewRelay=Readonly<{binding:string;principal:string;documentWriter:string;room:string;writerTransport?:'atomic-v2';reviewEditing?:'read_only'}>;
export interface PhysicalOperationV3SourceIdentity{
 readonly participant:string;readonly principal:string;readonly room:string;readonly writer:string;readonly richLanguage:1|2|3;
 readonly actor:string|undefined;readonly reviewPrincipal:string|undefined;
 readonly documentHistory:DocumentHistory;readonly reviewHistory:History|null;readonly reviewRelay:ReviewRelay|null;
}
const records=SharedParticipantBackup.prototype.records;
export function physicalOperationV3SourceIdentity(source:PhysicalCatalogV3ArchiveState,entry:PhysicalRoomCatalogV3Entry):PhysicalOperationV3SourceIdentity{
 if(entry.family==='original'){
  const selected=entry.selection.identity,client=source.clients.get(entry.id);if(!client||client.family!=='original')throw fail('physical_operation_v3_diverged');
  const paired=records.call(client.backup).find(row=>row.kind==='paired-session'),record=paired&&readPairedBackupRecord(paired.json,selected.source);
  return{participant:selected.participant,principal:selected.principal,...selected.source,actor:record?.reviewActor,reviewPrincipal:record?.principal,documentHistory:'original',reviewHistory:record?'original':null,reviewRelay:record&&'relay'in record?record.relay:null};
 }
 const result=(participant:string,principal:string,native:Pick<PhysicalOperationV3SourceIdentity,'room'|'writer'|'richLanguage'>,review:{actor:string;principal:string}|null|undefined,documentHistory:DocumentHistory,reviewHistory:History|null,reviewRelay:ReviewRelay|null=null):PhysicalOperationV3SourceIdentity=>({participant,principal,room:native.room,writer:native.writer,richLanguage:native.richLanguage,actor:review?.actor,reviewPrincipal:review?.principal,documentHistory,reviewHistory,reviewRelay});
 switch(entry.family){
  case'generation':{const id=entry.selection.identity;return result(id.participant,id.principal,id.source.native,id.source.review,id.source.kind==='continued-local'?'continued-v2':'segmented-v1',id.source.review?'original':null,id.source.relay?.review??null);}
  case'independent-local':{const id=entry.selection.identity;return result(id.participant,id.principal,id.source.native,id.source.review,id.source.documentHistory,id.source.reviewHistory);}
  case'independent-delivery':{const id=entry.selection.identity,h=id.source.history;return result(id.participant,id.principal,h.native,h.review,h.documentHistory,h.reviewHistory,id.source.binding.review);}
  case'restored-graph':{const id=entry.selection.original.identity,h=id.source.history;return result(id.participant,id.principal,h.native,h.review,h.documentHistory,h.reviewHistory,id.source.binding.review);}
  case'local-operation-snapshot':case'local-operation-flat':{const id=entry.selection.original.identity,h=id.source;return result(id.participant,id.principal,h.native,h.review,h.documentHistory,h.reviewHistory);}
 }
}
