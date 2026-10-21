/** Public selections and named adapter contracts must work in an unlinked installed consumer. */
import {SharedIndependentDeliverySession,SharedIndependentHistoryPersistentSession,SharedSegmentedRelaySession,createSharedIndependentRelaySync,createSharedIndependentReviewRelaySync,createSharedIndependentSuggestionObserverRelay,type SharedIndependentDeliveryOptions,type SharedIndependentDeliveryRecovery,type SharedIndependentHistoryRecovery,type SharedRustOwner} from '@breditor/collaboration';
declare const raw:SharedRustOwner,recovery:SharedIndependentDeliveryRecovery,local:SharedIndependentHistoryRecovery;
const options:SharedIndependentDeliveryOptions<'document-v1'>={database:'new-delivery-store',room:'room',writer:'101',richLanguage:3,history:'typing-v1',rangeEditing:'general-v1',selectionEditing:'document-v1',searchHistory:'search-v1',reviewedHistory:null,readOnly:false,review:{actor:'comments',principal:'alice',access:'comment'},documentHistory:{kind:'original',restoreOriginal:()=>raw},reviewHistory:{kind:'segmented-v1',initialGenerations:{root:'root',active:'one'}},binding:{document:{endpoint:'ws://localhost/ws',principal:'alice',room:'room',writer:'101',writerTransport:'atomic-v2'},review:{endpoint:'ws://localhost/ws',principal:'alice',room:'room',actor:'comments',documentWriter:'101',binding:'b'.repeat(64),writerTransport:'atomic-v2'}},retained:{suggestions:null,revisions:null,versions:null},create:()=>raw};
const session=await SharedIndependentDeliverySession.open(options),exact:SharedIndependentDeliveryRecovery=session.exportRecovery();void exact;
const relay=createSharedIndependentRelaySync(session,{identity:{...options.binding.document,credential:'c'.repeat(64)},getToken:()=>'',autoConnect:false});
createSharedIndependentReviewRelaySync(session,{identity:{...options.binding.review,credential:'d'.repeat(64)},getToken:()=>'',autoConnect:false});void relay;
await SharedIndependentDeliverySession.restoreRecovery({...options,recovery,writerRecovery:'host-reacquired'});await session.sealDocumentGeneration('next');await session.sealReviewGeneration('comments-next');await session.sealReadOnlyDocumentGeneration('observer-next');await session.sealReadOnlyReviewGeneration('observer-comments-next');
// @ts-expect-error no implicit local-only backup can replace the full delivery recovery
await SharedIndependentDeliverySession.restoreRecovery({...options,recovery:local,writerRecovery:'host-reacquired'});
// @ts-expect-error actual host writer reacquisition is required, not inferred from the stored head
await SharedIndependentDeliverySession.restoreRecovery({...options,recovery});
// @ts-expect-error document scope requires the explicit atomic transport, not an old wire selector
options.binding.document.writerTransport='original-v1';
// @ts-expect-error durable nonsecret binding cannot contain a resume credential
options.binding.document.credential='secret';
// @ts-expect-error ownership cannot be transferred by assigning a structurally compatible core
session.core=raw;
// @ts-expect-error delivery ownership is nominal and cannot come from a local-only session
createSharedIndependentRelaySync(await SharedIndependentHistoryPersistentSession.open(options),{identity:{...options.binding.document,credential:'c'.repeat(64)},getToken:()=>''});
// @ts-expect-error the old segmented delivery family is not this new independent family
createSharedIndependentSuggestionObserverRelay(await SharedSegmentedRelaySession.openRetained({...options,initialGenerations:{root:'root',active:'one'},restoreSegmented:()=>raw}),{});
// @ts-expect-error independent delivery source custody cannot be substituted with an old recovery DTO
const wrong:SharedIndependentHistoryRecovery=recovery;void wrong;
// @ts-expect-error private admission is not a public API export
import {withIndependentDeliveryCompanion} from '@breditor/collaboration';void withIndependentDeliveryCompanion;
