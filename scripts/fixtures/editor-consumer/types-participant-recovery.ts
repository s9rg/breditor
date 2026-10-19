/** Bare package contract: explicit selection, native family and host authority; no file-selected factory. */
import {SharedParticipantRecovery,RecoveredSharedParticipant,type SharedParticipantRecoveryOptions,type SharedParticipantRecoveryProgress,type SharedParticipantRecoverySession,type RecoveredSharedParticipantParts} from "@breditor/collaboration";
declare const options:SharedParticipantRecoveryOptions<"document-v1">;
type MustBeNever<T extends never>=T;
// Fixed native factories must not promise a different generic selection capability.
type NoOriginalFactoryForDocumentScope=MustBeNever<Extract<SharedParticipantRecoverySession<"document-v1">,{kind:"document"}>>;
type NoDocumentFactoryForOriginalScope=MustBeNever<Extract<SharedParticipantRecoverySession<"original">,{kind:"document-selection"}>>;
declare const checkedScopes:readonly[NoOriginalFactoryForDocumentScope,NoDocumentFactoryForOriginalScope];void checkedScopes;
async function contracts(){
 const attempt=await SharedParticipantRecovery.begin(options),progress:SharedParticipantRecoveryProgress=await attempt.progress();
 // @ts-expect-error Durable progress is immutable and grants no arbitrary completion mutation.
 progress.steps.push({step:"document",state:"complete"});
 const recovered=await attempt.finish(),parts:RecoveredSharedParticipantParts<"document-v1">=await recovered.intoParts();parts.session.core.view();await parts.session.close();parts.uploads.close();
 await SharedParticipantRecovery.resume(options);
 // @ts-expect-error The incoming archive cannot supply its own trusted selection.
 SharedParticipantRecovery.begin({...options,expected:undefined});
 // @ts-expect-error Host fencing/current authority is required separately from archive metadata.
 SharedParticipantRecovery.begin({...options,checkAuthority:undefined});
 // @ts-expect-error A recovery family is explicitly selected; no automatic factory from bytes.
 const unknown:SharedParticipantRecoverySession={kind:"automatic",options:{}};
 // @ts-expect-error Private recovery handles cannot be constructed from detached data.
 new SharedParticipantRecovery();
 // @ts-expect-error Completion/handoff handles are created only after genuine recovery verification.
 new RecoveredSharedParticipant();
 void unknown;
}
void contracts;
