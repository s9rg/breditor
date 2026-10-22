import {SharedIndependentDeliveryParticipantRecovery,RecoveredSharedIndependentDeliveryParticipant,type SharedIndependentDeliveryParticipantRecoveryOptions,type SharedIndependentDeliveryParticipantResumeOptions,type SharedIndependentDeliveryRecoveryFactory,type RecoveredSharedIndependentDeliveryParticipantParts,type SharedIndependentDeliverySession,type SharedIndependentDeliveryParticipantBackup} from '@breditor/collaboration';
import {RichAssetStoreCustody,type RichAssetStore} from '@breditor/experimental-rich-content';
declare const selected:SharedIndependentDeliveryParticipantRecoveryOptions<'document-v1'>;
const start:Promise<SharedIndependentDeliveryParticipantRecovery<'document-v1'>>=SharedIndependentDeliveryParticipantRecovery.begin(selected);
const resume:SharedIndependentDeliveryParticipantResumeOptions<'document-v1'>=selected;
const resumed:Promise<SharedIndependentDeliveryParticipantRecovery<'document-v1'>>=SharedIndependentDeliveryParticipantRecovery.resume(resume);
declare const ready:RecoveredSharedIndependentDeliveryParticipant<'document-v1'>;
const parts:Promise<Readonly<RecoveredSharedIndependentDeliveryParticipantParts<'document-v1'>>>=ready.intoParts();
const factory:SharedIndependentDeliveryRecoveryFactory<'document-v1'>=selected.session;
declare const source:SharedIndependentDeliverySession<'document-v1'>,backup:SharedIndependentDeliveryParticipantBackup;
// @ts-expect-error A source owner cannot substitute completed participant custody.
const foreign:RecoveredSharedIndependentDeliveryParticipant<'document-v1'>=source;
// @ts-expect-error Archive bytes are not an actual restored owner.
const archive:RecoveredSharedIndependentDeliveryParticipant<'document-v1'>=backup;
// @ts-expect-error The original selection policy cannot widen to document-v1.
const old:SharedIndependentDeliveryRecoveryFactory<'original'>=factory;
// @ts-expect-error No room activation or transport authentication is granted.
ready.activate();
// @ts-expect-error No readonly-to-writer promotion method is granted by the attempt.
SharedIndependentDeliveryParticipantRecovery.promote(selected);
void[start,resumed,parts,factory,foreign,archive,old];
declare const assets:RichAssetStore,held:RichAssetStoreCustody;
const acquiring:Promise<RichAssetStoreCustody>=assets.acquireRecoveryCustody();
held.check();held.release();const finished:Promise<void>=held.close();
// @ts-expect-error Store metadata or a mutable store is not the genuine held lease.
const fake:RichAssetStoreCustody=assets;
// @ts-expect-error A portable file cannot construct a custody lease.
new RichAssetStoreCustody();
void[acquiring,finished,fake];
