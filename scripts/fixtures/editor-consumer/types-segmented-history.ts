/** Public generation policies never manufacture native owners, writer leases or durable acknowledgements. */
import {SharedSegmentedPersistentSession,SharedRichEditor,restoreSharedSegmentedEditor,supportsSharedSegmentedHistory,type SharedSegmentedSessionOptions,type SharedSegmentedPersistentSession as Session,type SharedSegmentedRecoveryOptions,type SharedRustOwner,type SharedRustProfile} from "@breditor/collaboration";
declare const options:SharedSegmentedSessionOptions<"document-v1">,recovery:SharedSegmentedRecoveryOptions<"document-v1">,core:SharedRichEditor,raw:SharedRustOwner,profile:SharedRustProfile;
const session:Promise<Session<"document-v1">>=SharedSegmentedPersistentSession.open(options);
const restored:Promise<Session<"document-v1">>=SharedSegmentedPersistentSession.restoreRecovery(recovery);
const supported:boolean=supportsSharedSegmentedHistory(profile),owner:SharedRustOwner=restoreSharedSegmentedEditor(profile,"room","native checkpoint");
core.enableSegmentedHistory("root","active");core.sealHistoryGeneration("next");core.verifySegmentedRecoveryOrigin(core);
// @ts-expect-error Native raw owners are not adopted SDK continuity witnesses.
core.verifySegmentedRecoveryOrigin(raw);
// @ts-expect-error Detached generation metadata grants no native continuity proof.
core.verifySegmentedRecoveryOrigin({rootGeneration:"root",activeGeneration:"next",ready:true});
// @ts-expect-error A native generation seal is not a durable asynchronous storage acknowledgement.
const committed:Promise<void>=core.sealHistoryGeneration("next");
// @ts-expect-error Recovery requires explicit host reacquisition, not saved readiness.
SharedSegmentedPersistentSession.restoreRecovery({...recovery,writerRecovery:true});
// @ts-expect-error Checkpoint strings cannot impersonate the complete native recovery pair/catalog.
SharedSegmentedPersistentSession.restoreRecovery({...recovery,recovery:"checkpoint"});
// @ts-expect-error Unknown recovered mode cannot be inferred or accepted by the facade.
new SharedRichEditor(raw,{segmentedHistory:"automatic"});
// @ts-expect-error Document sessions retain the original discriminated document selection API.
const original:Promise<Session<"original">>=SharedSegmentedPersistentSession.open(options);
void [session,restored,supported,owner,committed,original];

import type {SharedContinueHistoryOptions,SharedContinuedHistoryBackup,SharedContinuedHistoryRecovery,SharedRestoreContinuedHistoryOptions} from "@breditor/collaboration";
declare const continuation:SharedContinueHistoryOptions<"document-v1">, continued:SharedContinuedHistoryRecovery;
const migration:Promise<Session<"document-v1">>=SharedSegmentedPersistentSession.continueHistory(continuation);
const reopened:Promise<Session<"document-v1">>=SharedSegmentedPersistentSession.openContinued(continuation);
// @ts-expect-error A migration requires the exact V1 predecessor.
SharedSegmentedPersistentSession.continueHistory({...continuation,expected:continued});
declare const continuedRecovery:SharedRestoreContinuedHistoryOptions<"document-v1">;
const copied:Promise<Session<"document-v1">>=SharedSegmentedPersistentSession.restoreContinuedRecovery(continuedRecovery);
const backup:Promise<SharedContinuedHistoryBackup>=(await reopened).exportContinuedBackup();
// @ts-expect-error Recovery needs both native cuts.
SharedSegmentedPersistentSession.restoreContinuedRecovery({...continuedRecovery,backup:continued});
// @ts-expect-error The host must explicitly reacquire the writer before restoring.
SharedSegmentedPersistentSession.restoreContinuedRecovery({...continuedRecovery,writerRecovery:true});
void [migration,reopened,copied,backup];
