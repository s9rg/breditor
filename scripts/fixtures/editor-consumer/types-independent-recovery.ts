/** Complete local-only actual-owner transfer and permanently read-only staging. */
import {SharedIndependentParticipantRecovery,RecoveredSharedIndependentParticipant,SharedIndependentParticipantBackup,type SharedIndependentParticipantResumeOptions,type SharedIndependentRecoveryFactory,type RecoveredSharedIndependentParticipantParts,type SharedIndependentHistorySessionOptions,type SharedIndependentSourceSelection} from '@breditor/collaboration';
declare const factory:SharedIndependentRecoveryFactory<'document-v1'>;
declare const options:SharedIndependentParticipantResumeOptions<'document-v1'>;
declare const backup:SharedIndependentParticipantBackup;
declare const ordinary:SharedIndependentHistorySessionOptions<'document-v1'>;
const pending:Promise<SharedIndependentParticipantRecovery<'document-v1'>>=SharedIndependentParticipantRecovery.begin({...options,backup});
async function actual(){const attempt=await pending;const ready:RecoveredSharedIndependentParticipant<'document-v1'>=await attempt.finish();const parts:Readonly<RecoveredSharedIndependentParticipantParts<'document-v1'>>=await ready.intoParts();const source:SharedIndependentSourceSelection<'document-v1'>=parts.source;const original:SharedIndependentParticipantBackup=parts.original;original.blob('asset','generation');await parts.uploads.exportBackup();await source.session.close();parts.uploads.close();original.dispose();}
// @ts-expect-error Actual runtime construction is private.
new SharedIndependentParticipantRecovery();
// @ts-expect-error Actual native/provider/upload custody is not a DTO constructor.
new RecoveredSharedIndependentParticipant();
// @ts-expect-error First recovery owner must be explicitly document read-only.
const writable:SharedIndependentRecoveryFactory<'document-v1'>={...factory,readOnly:false};
// @ts-expect-error First comment owner is also read-only.
const moderator:SharedIndependentRecoveryFactory<'document-v1'>={...factory,review:{...factory.review,access:'moderate'}};
// @ts-expect-error Ordinary source options cannot select complete read-only recovery implicitly.
const implicit:SharedIndependentRecoveryFactory<'document-v1'>=ordinary;
// @ts-expect-error No delivery binding is accepted by local recovery.
const binding:SharedIndependentRecoveryFactory<'document-v1'>={...factory,binding:{}};
// @ts-expect-error A ready flag cannot adopt actual original/source/upload resources.
SharedIndependentParticipantRecovery.begin({...options,backup,ready:true});
// @ts-expect-error Resume does not accept a replacement backup.
SharedIndependentParticipantRecovery.resume({...options,backup});
// @ts-expect-error Recovery has no whole-room activation API.
pending.then(attempt=>attempt.activate());
void actual;void writable;void moderator;void implicit;void binding;
