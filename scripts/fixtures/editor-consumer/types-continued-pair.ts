import {SharedContinuedPairSession,type SharedContinuedPairOptions,type SharedContinuedPairRecovery,type ContinuedPairRecords,type SharedContinuedPairAssetReferences} from '@breditor/collaboration';
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
