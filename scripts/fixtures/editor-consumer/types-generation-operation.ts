/** Public-only operational custody; archives never choose current grants, factories or transports. */
import {OperationalSharedGenerationParticipant,type RecoveredSharedGenerationParticipant,type SharedGenerationOperationBeginOptions,type SharedGenerationOperationResumeOptions,type SharedGenerationOperationProgress,type OperationalSharedGenerationParticipantParts,type SharedGenerationSourceSelection,type SharedGenerationParticipantBackup} from "@breditor/collaboration";
declare const ready:RecoveredSharedGenerationParticipant<"document-v1">,begin:SharedGenerationOperationBeginOptions<"document-v1">,resume:SharedGenerationOperationResumeOptions<"document-v1">,backup:SharedGenerationParticipantBackup;
const held=await OperationalSharedGenerationParticipant.begin({...begin,recovered:ready});
const progress:Readonly<SharedGenerationOperationProgress>=await held.progress();void progress;
await held.check();const original:Blob=held.file();void original;
const parts:Readonly<OperationalSharedGenerationParticipantParts<"document-v1">>=await held.intoParts();
const source:SharedGenerationSourceSelection<"document-v1">=parts.source;void source;
await parts.uploads.list();
await OperationalSharedGenerationParticipant.resumeRecovered(begin);
const cold=await OperationalSharedGenerationParticipant.resume(resume);await cold.close();
// @ts-expect-error Detached backup metadata is not genuine recovered custody.
await OperationalSharedGenerationParticipant.begin({...begin,recovered:backup});
// @ts-expect-error A caller cannot replace the retained origin on cold reopen.
await OperationalSharedGenerationParticipant.resume({...resume,backup});
// @ts-expect-error The operation and original recovery databases remain explicit and independent.
await OperationalSharedGenerationParticipant.resume({...resume,recoveryDatabase:undefined});
// @ts-expect-error Current authority cannot be restored from a boolean marker.
await OperationalSharedGenerationParticipant.resume({...resume,checkAuthority:true});
// @ts-expect-error A restore file must not select a current native factory or read-only policy.
await OperationalSharedGenerationParticipant.resume({...resume,session:backup.selection().identity.source});
// @ts-expect-error No operation owner silently starts a network transport.
await cold.connect();
