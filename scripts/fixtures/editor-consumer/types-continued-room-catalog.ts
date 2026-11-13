import {SharedContinuedRoomCatalog,SharedContinuedRoomCatalogStore,beginContinuedRoomRecovery,resumeContinuedRoomRecovery,readContinuedRoomReconciliation,readRecoveredContinuedRoomReconciliation,previewRecoveredContinuedRoomCatchUp,retainRecoveredContinuedRoomCatchUp} from '@breditor/collaboration';
import type {ContinuedRoomOriginalRecoveryPolicy,ContinuedRoomGenerationRecoveryPolicy,ContinuedRoomDeliveryRecoveryPolicy,ContinuedRoomIndependentRecoveryPolicy,ContinuedPairRecords,ContinuedRoomReconciliationOptions,ContinuedRoomReconciliationRead,ContinuedRoomRecoveryDestination,ContinuedRoomRecoveryOptions,ContinuedRoomRecoveryResult,ContinuedRoomCatalogCaptureOptions,ContinuedRoomCatalogMetadata,ContinuedRoomCatalogSelection} from '@breditor/collaboration';
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
const operation:ContinuedRoomRecoveryDestination={id:'device',source:'source',uploads:'uploads',operation:{parent:'parent',journal:'journal'}};
await resumeContinuedRoomRecovery({...recovery,destinations:[operation]});
declare const originalRecovery:ContinuedRoomOriginalRecoveryPolicy;
const originalDestination:ContinuedRoomRecoveryDestination={id:'original',source:'original-source',uploads:'original-uploads',
 original:{suggestions:'suggestions',revisions:'revisions',versions:'versions'}};
await resumeContinuedRoomRecovery({...recovery,destinations:[originalDestination],originalPolicies:[originalRecovery]});
void result;

declare const reconciliation:ContinuedRoomReconciliationOptions;
declare const original:ContinuedRoomOriginalReadPolicy;
const report:ContinuedRoomReconciliationRead=await readContinuedRoomReconciliation({...reconciliation,
 independentPolicies:[legacy],deliveryPolicies:[delivery],generationPolicies:[generation],originalPolicies:[original],
 includeOperationArchives:true});
const review:null|undefined=report.documentOnlyParticipants?.[0]?.prefix.review;
void review;

declare const deliveryCatalog:import('@breditor/collaboration').SharedContinuedRoomCatalog;
declare const deliveryStore:import('@breditor/collaboration').SharedContinuedRoomCatalogStore;
declare const deliveryEntry:import('@breditor/collaboration').ContinuedRoomCatalogDeliveryEntry;
const deliveryFormat:2=deliveryEntry.selection.formatVersion;
const deliveryRecords:import('@breditor/collaboration').ContinuedDeliveryRecords=deliveryCatalog.participantDeliveryRecords(deliveryEntry.id);
const restoredDelivery:import('@breditor/collaboration').SharedContinuedDeliveryRecovery=deliveryStore.participantDeliveryRecords(deliveryEntry.id).live;
void [deliveryFormat,deliveryRecords,restoredDelivery];

declare const recoveredInput:import('@breditor/collaboration').RecoveredContinuedRoomReconciliationOptions;
const recovered:import('@breditor/collaboration').RecoveredContinuedRoomReconciliationRead=await readRecoveredContinuedRoomReconciliation(recoveredInput);
const recoveredParticipants:readonly ContinuedRoomRecoveryDestination[]=recovered.recovery.participants;
void recoveredParticipants;

const catchUp:import('@breditor/collaboration').RecoveredContinuedRoomCatchUpPreview=await previewRecoveredContinuedRoomCatchUp(recoveredInput);
const caughtUp:import('@breditor/collaboration').SharedContinuedDeliveryRecovery|undefined=catchUp.participants[0]?.recovery;
const caughtUpLocal:import('@breditor/collaboration').SharedContinuedPairRecovery|undefined=catchUp.localParticipants[0]?.recovery;
void [caughtUp,caughtUpLocal];

type Replacement=import('@breditor/collaboration').RecoveredContinuedRoomReplacementChoice;
declare function persist(choice:Replacement):Promise<void>;
const retained:Replacement=await retainRecoveredContinuedRoomCatchUp(recoveredInput,{
 database:'replacement-db',catalog:'replacement',retainChoice:persist,
});
const replacement=await SharedContinuedRoomCatalogStore.resume({...options,database:retained.database,expected:retained.replacement,
 policies:options.policies.map(policy=>({...policy,expected:retained.advanced.find(row=>row.id===policy.id)?.expected??policy.expected}))});
await replacement.close();
