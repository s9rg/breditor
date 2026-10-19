import {SharedPersistentSession,SharedReviewPersistentSession,encodeSharedSessionBackup,decodeSharedSessionBackup,encodeSharedPairedSessionBackup,decodeSharedPairedSessionBackup,type SharedRustOwner,type SharedBackupIdentity,type SharedSessionBackupOptions,type SharedDocumentBackupOptions,type SharedSearchBackupOptions,type SharedReviewBackupOptions,type SharedReviewedReviewBackupOptions,type SharedSearchReviewBackupOptions,type SharedDocumentView,type SharedPairedCheckpointRecord} from "@breditor/collaboration";
declare const raw:SharedRustOwner,checkpointJson:string,backupJson:string,record:SharedPairedCheckpointRecord;
const identity:SharedBackupIdentity={room:"room",writer:"101",richLanguage:3,history:"explicit",rangeEditing:"general-v1",selectionEditing:"document-v1",searchHistory:null};
async function contracts(){
 const common={database:"restore",room:"room",writer:"101",richLanguage:3 as const,history:"explicit" as const,rangeEditing:"general-v1" as const,backupJson,writerRecovery:"host-reacquired" as const};
 const original:SharedSessionBackupOptions={...common,restore:()=>raw},document:SharedDocumentBackupOptions={...common,restoreDocument:()=>raw},search:SharedSearchBackupOptions<"document-v1">={...common,selectionEditing:"document-v1",restoreSearch:()=>raw};
 const a=await SharedPersistentSession.restoreBackup(original),b=await SharedPersistentSession.restoreDocumentBackup(document),c=await SharedPersistentSession.restoreSearchBackup(search);const view:SharedDocumentView=b.core.view();void view;c.core.selectDocument();await a.exportBackup();await b.exportBackup();await c.exportBackup();
 const paired={...common,review:{actor:"review-writer",principal:"alice",access:"comment" as const},selectionEditing:"document-v1" as const},plain:SharedReviewBackupOptions<"document-v1">={...paired,restore:()=>raw},reviewed:SharedReviewedReviewBackupOptions<"document-v1">={...paired,reviewedHistory:{binding:"a".repeat(64),principal:"alice",effectWriter:"303"},restoreReviewed:()=>raw},searched:SharedSearchReviewBackupOptions<"document-v1">={...paired,restoreSearch:()=>raw};
 const d=await SharedReviewPersistentSession.restoreBackup(plain),e=await SharedReviewPersistentSession.restoreReviewedBackup(reviewed),f=await SharedReviewPersistentSession.restoreSearchBackup(searched);d.core.selectDocument();await e.exportBackup();await f.exportBackup();
 await decodeSharedSessionBackup(await encodeSharedSessionBackup(identity,checkpointJson),identity);await decodeSharedPairedSessionBackup(await encodeSharedPairedSessionBackup(identity,record),identity);
 // @ts-expect-error Recovery cannot infer or waive the host's writer reacquisition.
 SharedPersistentSession.restoreBackup({...original,writerRecovery:undefined});
 // @ts-expect-error A file never selects missing native/policy semantics.
 SharedPersistentSession.restoreBackup({database:"x",room:"room",writer:"101",backupJson,writerRecovery:"host-reacquired",restore:()=>raw});
 // @ts-expect-error Document recovery cannot use the original range family.
 SharedPersistentSession.restoreDocumentBackup({...document,rangeEditing:"original"});
 // @ts-expect-error Search replay is a separately named factory, not an old restore callback.
 SharedPersistentSession.restoreSearchBackup({...search,restoreSearch:undefined});
 // @ts-expect-error Reviewed ownership must be explicitly supplied by the host.
 SharedReviewPersistentSession.restoreReviewedBackup({...reviewed,reviewedHistory:undefined});
 // @ts-expect-error Writers stay exact decimal strings across the Wasm boundary.
 decodeSharedSessionBackup(backupJson,{...identity,writer:101});
}
void contracts;
import {SharedSuggestionQueue,SharedSuggestionRevisions,SharedDocumentVersions,type SharedSuggestionQueueBackupOptions,type SharedSuggestionRevisionsBackupOptions,type SharedDocumentVersionsBackupOptions,type SharedRetainedStoreBackup} from "@breditor/collaboration";
declare const queueRecovery:SharedSuggestionQueueBackupOptions<"document-v1">,revisionRecovery:SharedSuggestionRevisionsBackupOptions<"document-v1">,versionRecovery:SharedDocumentVersionsBackupOptions<"document-v1">;
async function retainedContracts(){const q=await SharedSuggestionQueue.restoreBackup(queueRecovery),r=await SharedSuggestionRevisions.restoreBackup(revisionRecovery),v=await SharedDocumentVersions.restoreBackup(versionRecovery);const file:string=await q.exportBackup({signal:new AbortController().signal});await r.exportBackup();await v.exportBackup();q.core.selectDocument();void file;
 // @ts-expect-error Retained intent recovery does not infer cross-device writer authority.
 SharedSuggestionQueue.restoreBackup({...queueRecovery,writerRecovery:undefined});
 // @ts-expect-error Restoring offline decisions cannot automatically send them to the server.
 SharedSuggestionRevisions.restoreBackup({...revisionRecovery,autoStart:true});
 // @ts-expect-error Restoring cached state does not reconnect with archived grants.
 SharedDocumentVersions.restoreBackup({...versionRecovery,autoConnect:true});
}
declare const retainedMetadata:SharedRetainedStoreBackup;
// @ts-expect-error Dependent-state archives are a distinct closed family, not document history.
const documentArchive:"breditor/shared-session-backup"=retainedMetadata.format;void documentArchive;void retainedContracts;
