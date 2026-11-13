import {
 SharedContinuedPairSession,SharedContinuedParticipantBackup,createSharedContinuedRelaySync,createSharedContinuedReviewRelaySync,
 type SharedContinuedDeliveryOptions,type SharedContinuedDeliveryRecovery,type SharedIndependentRelaySyncOptions,type SharedIndependentReviewSyncOptions,
 type SharedContinuedPairOptions,type SharedContinuedPairRecovery,
 type ContinuedDeliveryRecords,type ContinuedPairRecords,type SharedContinuedPairAssetReferences,
 type ContinuedDeliveryParticipantSelection,type ContinuedParticipantCaptureOptions,type ContinuedParticipantReadOptions,type ContinuedParticipantSelection,
} from '@breditor/collaboration';
declare const options:SharedContinuedPairOptions<'document-v1'>;
declare const recovery:SharedContinuedPairRecovery;
const pair=await SharedContinuedPairSession.restoreRecovery(options,recovery,'host-reacquired');
const selection:'document-v1'=pair.core.view().selectionEditing;
const checkpoint:string=pair.exportRecovery().reviewCheckpoint;
const read=await pair.readRecords(()=>{});
const records:ContinuedPairRecords=read.metadata();
await read.verify();
read.dispose();
const references:SharedContinuedPairAssetReferences=await pair.readAssetReferences(()=>{});
await pair.close();
void [selection,checkpoint,records,references];
// @ts-expect-error The continued pair requires explicit host writer reacquisition.
void SharedContinuedPairSession.restoreRecovery(options,recovery);

declare const input:ContinuedParticipantCaptureOptions<'document-v1'>;
declare const policy:ContinuedParticipantReadOptions<'document-v1'>;
const participant=await SharedContinuedParticipantBackup.capture(input);
if(participant.kind==='ready'){
 const expected:ContinuedParticipantSelection=participant.backup.selection();
 const restored=await SharedContinuedParticipantBackup.read(participant.backup.file(),expected,policy);
 const uploadFile:Blob=restored.uploadBackup();
 const source:SharedContinuedPairRecovery=restored.records().live;
 void [uploadFile,source];
 restored.dispose();
 participant.backup.dispose();
}

declare const delivery:SharedContinuedDeliveryOptions<'document-v1'>;
declare const archived:SharedContinuedDeliveryRecovery;
declare const documentOptions:SharedIndependentRelaySyncOptions<'document-v1'>;
declare const reviewOptions:SharedIndependentReviewSyncOptions<'document-v1'>;
const source=await SharedContinuedPairSession.restoreDelivery(delivery,archived,'host-reacquired');
const documentSync=createSharedContinuedRelaySync(source,documentOptions);
const reviewSync=createSharedContinuedReviewRelaySync(source,reviewOptions);
const exact:SharedContinuedDeliveryRecovery=source.exportDeliveryRecovery();
const deliveryRead=await source.readDeliveryRecords(()=>{});
const deliveryRecords:ContinuedDeliveryRecords=deliveryRead.metadata();
const committed:SharedContinuedDeliveryRecovery=deliveryRecords.committed.recovery;
await deliveryRead.verify();
deliveryRead.dispose();
void [exact,committed];
documentSync.dispose();reviewSync.dispose();await source.close();
await (await SharedContinuedPairSession.openDelivery(delivery)).close();
// @ts-expect-error Delivery restore requires a current host writer reacquisition decision.
void SharedContinuedPairSession.restoreDelivery(delivery,archived);

const portable=await SharedContinuedParticipantBackup.captureDelivery(input);
if(portable.kind==='ready'){
 const expected:ContinuedDeliveryParticipantSelection=portable.backup.selection();
 const restored=await SharedContinuedParticipantBackup.readDelivery(portable.backup.file(),expected,policy);
 const records:ContinuedDeliveryRecords=restored.records();
 void records.live.retained;
 restored.dispose();
 portable.backup.dispose();
}
