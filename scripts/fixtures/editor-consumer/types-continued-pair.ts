import {SharedContinuedPairSession,type SharedContinuedPairOptions,type SharedContinuedPairRecovery} from '@breditor/collaboration';
declare const options:SharedContinuedPairOptions<'document-v1'>;
declare const recovery:SharedContinuedPairRecovery;
const pair=await SharedContinuedPairSession.restoreRecovery(options,recovery,'host-reacquired');
const selection:'document-v1'=pair.core.view().selectionEditing;
const checkpoint:string=pair.exportRecovery().reviewCheckpoint;
await pair.close();
void [selection,checkpoint];
// @ts-expect-error The continued pair requires explicit host writer reacquisition.
void SharedContinuedPairSession.restoreRecovery(options,recovery);
