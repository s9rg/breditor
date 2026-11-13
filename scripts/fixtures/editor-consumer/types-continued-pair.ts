import {
 SharedContinuedPairSession,SharedContinuedParticipantBackup,
 type SharedContinuedPairOptions,type SharedContinuedPairRecovery,
 type ContinuedPairRecords,type SharedContinuedPairAssetReferences,
 type ContinuedParticipantCaptureOptions,type ContinuedParticipantReadOptions,type ContinuedParticipantSelection,
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
