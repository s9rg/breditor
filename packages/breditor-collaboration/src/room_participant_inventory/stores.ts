import {checkQueueRecord} from "../suggestions/database.js";
import {queueIdentity} from "../suggestions/validation.js";
import {checkRevisionRecord} from "../suggestion_revisions/database.js";
import {checkCatalogRecord} from "../versions/database.js";
import {versionIdentity} from "../versions/validation.js";
import {transportVersion} from "../relay/validation.js";
import type {SharedSuggestionQueueRecord} from "../suggestions/types.js";
import type {SharedSuggestionRevisionsRecord} from "../suggestion_revisions/types.js";
import type {SharedVersionCatalogRecord} from "../versions/types.js";
import type {SharedAssetCaptureRecord} from "../asset_references_capture.js";
import type {SharedRoomParticipantInventoryMetadata} from "./types.js";
import {SharedRoomParticipantInventoryError} from "./policy.js";
/** Original closed readers stay authoritative; namespaces are then matched to the trusted cut. */
export function checkInventoryStores(metadata:SharedRoomParticipantInventoryMetadata,records:readonly SharedAssetCaptureRecord[],principal:string,writer:string):void {
 const refuse=()=>new SharedRoomParticipantInventoryError("inventory_source","A declared retained store differs from this participant or native room namespace");
 for(const record of records){
  if(record.kind==="suggestions"||record.kind==="suggestion-revisions"){
   const raw=JSON.parse(record.json) as SharedSuggestionQueueRecord|SharedSuggestionRevisionsRecord,id=queueIdentity(raw.identity);
   if(id.principal!==principal||id.room!==metadata.room.document||id.documentWriter!==writer||id.binding!==metadata.suggestionsBinding||id.effectWriter!==metadata.serverAuthors.find(a=>a.kind==="suggestionEffect")?.clock.writer||metadata.room.writerTransportVersion!==2)throw refuse();
   if(record.kind==="suggestions")checkQueueRecord(raw,id,raw.format==="breditor/shared-owned-suggestion-queue"?"reviewed-v1":undefined);
   else{if(!metadata.revisionsBinding)throw refuse();checkRevisionRecord(raw,id,metadata.revisionsBinding);}
  }else if(record.kind==="version-catalog"){
   const raw=JSON.parse(record.json) as SharedVersionCatalogRecord,id=versionIdentity(raw.identity);
   if(id.principal!==principal||id.room!==metadata.room.document||id.documentWriter!==writer||id.binding!==metadata.versionsBinding||transportVersion(id.writerTransport)!==metadata.room.writerTransportVersion)throw refuse();
   checkCatalogRecord(raw,id);
  }
 }
}
