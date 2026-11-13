import {SharedContinuedRoomCatalog,SharedContinuedRoomCatalogStore,beginContinuedRoomRecovery,resumeContinuedRoomRecovery,readContinuedRoomReconciliation} from '@breditor/collaboration';
import type {ContinuedRoomGenerationRecoveryPolicy,ContinuedRoomDeliveryRecoveryPolicy,ContinuedRoomIndependentRecoveryPolicy,ContinuedPairRecords,ContinuedRoomReconciliationOptions,ContinuedRoomReconciliationRead,ContinuedRoomRecoveryOptions,ContinuedRoomRecoveryResult,ContinuedRoomCatalogCaptureOptions,ContinuedRoomCatalogMetadata,ContinuedRoomCatalogSelection} from '@breditor/collaboration';
import type {ContinuedRoomOriginalReadPolicy} from '@breditor/collaboration';

declare const input:ContinuedRoomCatalogCaptureOptions;
const archive=await SharedContinuedRoomCatalog.capture(input);
const expected:ContinuedRoomCatalogSelection=archive.selection();
const options={database:'recovery-room',expected,policies:input.policies,wasm:input.wasm,checkAuthority:input.checkAuthority};
const store=await SharedContinuedRoomCatalogStore.begin({...options,archive});
const metadata:ContinuedRoomCatalogMetadata=store.metadata();
const records:ContinuedPairRecords=store.participantRecords('device');
const uploads:Blob=store.participantUploads('device');
const image:Blob|undefined=store.participantAsset('device','asset','generation');
void [metadata,records,uploads,image];
await store.close();
const reopened=await SharedContinuedRoomCatalogStore.resume(options);
await reopened.close();
archive.dispose();
declare const recovery:ContinuedRoomRecoveryOptions;
const result:ContinuedRoomRecoveryResult=await beginContinuedRoomRecovery(recovery);
declare const legacy:ContinuedRoomIndependentRecoveryPolicy;
declare const delivery:ContinuedRoomDeliveryRecoveryPolicy;
declare const generation:ContinuedRoomGenerationRecoveryPolicy;
await resumeContinuedRoomRecovery({...recovery,independentPolicies:[legacy],deliveryPolicies:[delivery],generationPolicies:[generation]});
void result;

declare const reconciliation:ContinuedRoomReconciliationOptions;
declare const original:ContinuedRoomOriginalReadPolicy;
const report:ContinuedRoomReconciliationRead=await readContinuedRoomReconciliation({...reconciliation,
 independentPolicies:[legacy],deliveryPolicies:[delivery],generationPolicies:[generation],originalPolicies:[original]});
const review:null|undefined=report.documentOnlyParticipants?.[0]?.prefix.review;
void review;
