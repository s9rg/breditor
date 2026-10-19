import {SharedSuggestionQueue,SharedSuggestionRevisions,SharedSuggestionSync,SharedParticipantReplay,type SharedRetainedSuggestionsRecoveryResult,type SharedRetainedRevisionsRecoveryResult} from "@breditor/collaboration";
declare const queue:SharedSuggestionQueue,revisions:SharedSuggestionRevisions,sync:SharedSuggestionSync,replay:SharedParticipantReplay;
const proposals:Promise<SharedRetainedSuggestionsRecoveryResult>=queue.recoverRetainedSuggestions(replay);
const drafts:Promise<SharedRetainedRevisionsRecoveryResult>=revisions.recoverRetainedRevisions(replay);
const waits:Promise<void>[]=[sync.waitForDisconnected(),revisions.waitForDisconnected()];void waits;
// @ts-expect-error A detached queue record proves neither original native replay nor continuity.
queue.recoverRetainedSuggestions(queue.exportRecovery());
// @ts-expect-error A detached revision record cannot replace a genuine replay capability.
revisions.recoverRetainedRevisions(revisions.exportRecovery());
async function diagnostics(){const a=await proposals,b=await drafts;
 // @ts-expect-error Immutable diagnostic counts are not queue mutation controls.
 a.added=0;
 // @ts-expect-error Recovery counts are not authenticated server finalization.
 b.accept();
}void diagnostics;
