/** Public-only custody, portable data and explicit post-adoption connection fences. */
import {SharedSegmentedRelaySession,type SharedSegmentedRetainedSessionOptions,type SharedSegmentedRetainedRecovery,type SharedSegmentedRevisionsOpenOptions,type SharedSegmentedVersionsOpenOptions,type SharedSegmentedRelayRecovery} from "@breditor/collaboration";
declare const options:SharedSegmentedRetainedSessionOptions<"document-v1">;
declare const revisions:SharedSegmentedRevisionsOpenOptions<"document-v1">;
declare const versions:SharedSegmentedVersionsOpenOptions<"document-v1">;
declare const recovery:SharedSegmentedRetainedRecovery;
const session=await SharedSegmentedRelaySession.openRetained(options);
await session.openSuggestionQueue();await session.openSuggestionRevisions(revisions);await session.openVersionCatalog(versions);
const portable:SharedSegmentedRetainedRecovery=session.exportRetainedRecovery();void portable;
// @ts-expect-error The retained envelope cannot be mistaken for the older relay-only recovery.
const old:SharedSegmentedRelayRecovery=recovery;void old;
// @ts-expect-error Connecting before adoption is not part of this atomic factory contract.
await session.openVersionCatalog({...versions,autoConnect:true});
// @ts-expect-error Revision delivery starts explicitly after the factory returns.
await session.openSuggestionRevisions({...revisions,autoStart:true});
// @ts-expect-error Store identity and custody come from the closed selected source, not caller replacement.
await session.openVersionCatalog({...versions,storage:session});
// @ts-expect-error A detached recovery DTO is not a live session.
await recovery.openSuggestionQueue();
await SharedSegmentedRelaySession.restoreRetainedRecovery({...options,recovery,writerRecovery:"host-reacquired"});
// @ts-expect-error Reacquisition is a required host declaration, never a restored boolean grant.
await SharedSegmentedRelaySession.restoreRetainedRecovery({...options,recovery,writerRecovery:true});
