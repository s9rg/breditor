/** Independent installed types: declared participant scope, no inferred grants or native factory. */
import {captureSharedParticipantBackup,readSharedParticipantBackup,SharedParticipantBackup,type SharedParticipantBackupIdentity,type SharedParticipantBackupSelection,type SharedAssetReferenceCaptureOptions,type SharedAssetReferenceCapture,type SharedAssetReferenceCaptureMetadata} from "@breditor/collaboration";
import {RichAssetStore,readRichAssetBackup,RichAssetArchive,type RichAssetSourceBackup} from "@breditor/editor";
declare const assets:RichAssetStore,identity:SharedParticipantBackupIdentity,selection:SharedParticipantBackupSelection,source:SharedAssetReferenceCaptureOptions<"document-v1">,genuine:SharedAssetReferenceCapture,metadata:SharedAssetReferenceCaptureMetadata,file:Blob;
async function contracts(){
 const cut:RichAssetSourceBackup<Readonly<{checkpoint:string}>>=await assets.captureBackup(()=>Object.freeze({checkpoint:"captured"}));const raster=await readRichAssetBackup(cut.backup);const epoch:number|undefined=raster.entries()[0]?.epoch;void epoch;
 const outcome=await captureSharedParticipantBackup({identity,source,assets,checkAuthority(){},signal:new AbortController().signal});
 if(outcome.kind==="pending"){
  // @ts-expect-error A missing native dependency or image has no partial usable backup.
  outcome.backup;
 }else{const archive=await readSharedParticipantBackup(outcome.backup.file(),outcome.backup.selection());await archive.verifyRecovered(genuine,assets);const bytes:Blob=archive.uploadBackup();void bytes;archive.dispose();outcome.backup.dispose();}
 // @ts-expect-error Expected selection must be chosen independently; a file cannot select it.
 readSharedParticipantBackup(file);
 // @ts-expect-error URL strings are not admitted bytes.
 readSharedParticipantBackup("https://example.invalid/backup",selection);
 // @ts-expect-error Detached metadata is not a genuine live restored source.
 (await readSharedParticipantBackup(file,selection)).verifyRecovered(metadata,assets);
 // @ts-expect-error The scoped component declaration is immutable.
 identity.stores.push("document");
 // @ts-expect-error Callback capture cannot await outside the active IDB transaction.
 assets.captureBackup(async()=>"not a synchronous source");
 // @ts-expect-error Closed private archive constructors cannot be forged.
 new SharedParticipantBackup();
 // @ts-expect-error Upload-state readers have private constructors.
 new RichAssetArchive();
 raster.dispose();
}
void contracts;
