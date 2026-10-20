/** Explicit permanent observation cannot substitute an author credential or detached source. */
import {createSharedSegmentedSuggestionObserverRelay,SharedSegmentedRelaySession,type SharedSegmentedSuggestionObserverOptions,type SharedSegmentedRetainedRecovery,type SharedSuggestionObserverRelay} from "@breditor/collaboration";
declare const session:SharedSegmentedRelaySession<"document-v1">,options:SharedSegmentedSuggestionObserverOptions<"document-v1">,recovery:SharedSegmentedRetainedRecovery;
const observer:SharedSuggestionObserverRelay<"document-v1">=createSharedSegmentedSuggestionObserverRelay(session,options);
const supported:boolean=session.core.supportsObserverHistorySealing();
session.core.sealObserverHistoryGeneration("next");
await session.sealObserverGeneration("later");
// @ts-expect-error Storage is supplied by the genuine source, never overridden by the caller.
createSharedSegmentedSuggestionObserverRelay(session,{...options,storage:session});
// @ts-expect-error Detached saved metadata is not actual native source custody.
createSharedSegmentedSuggestionObserverRelay(recovery,options);
// @ts-expect-error A document author credential cannot select the permanent observer lane.
createSharedSegmentedSuggestionObserverRelay(session,{...options,identity:{...options.identity,credential:"author"}});
// @ts-expect-error Core publication alone does not acknowledge asynchronous durable storage.
const durable:Promise<void>=session.core.sealObserverHistoryGeneration("not-durable");
void [observer,supported,durable];
