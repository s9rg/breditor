/** Closed family selection and recovery policy are public source contracts, not native authority. */
import {SharedIndependentHistoryPersistentSession,type SharedIndependentHistorySessionOptions,type SharedRustOwner,type SharedIndependentHistoryRecovery,type SharedIndependentHistorySaveState} from '@breditor/collaboration';
declare const raw:SharedRustOwner,recovery:SharedIndependentHistoryRecovery;
const options:SharedIndependentHistorySessionOptions<'document-v1'>={database:'new-dedicated-store',room:'room',writer:'101',richLanguage:3,history:'typing-v1',rangeEditing:'general-v1',selectionEditing:'document-v1',searchHistory:'search-v1',reviewedHistory:null,readOnly:false,review:{actor:'comments',principal:'alice',access:'comment'},documentHistory:{kind:'original',restoreOriginal:checkpoint=>{void checkpoint;return raw;}},reviewHistory:{kind:'segmented-v1',initialGenerations:{root:'comments-root',active:'comments-active'}},create:()=>raw};
const session=await SharedIndependentHistoryPersistentSession.open(options);
session.core.view().selectionEditing;const state:SharedIndependentHistorySaveState=session.state();void state;
const exact:SharedIndependentHistoryRecovery=session.exportRecovery();void exact;
await session.sealReviewGeneration('next');await session.sealReadOnlyReviewGeneration('later');await session.sealDocumentGeneration('document-next');await session.sealReadOnlyDocumentGeneration('document-later');await session.retainVersion('native-version');
await SharedIndependentHistoryPersistentSession.restoreRecovery(options,recovery,'host-reacquired');
// @ts-expect-error an old store is not silently migrated by a new policy selector
options.documentHistory={kind:'original',restoreSegmented:()=>raw};
// @ts-expect-error segmented history always requires explicit initial generation identities
options.reviewHistory={kind:'segmented-v1'};
// @ts-expect-error fresh policy is required, not accepted from recovery metadata
options.review={actor:'comments',principal:'alice'};
// @ts-expect-error host writer reacquisition cannot be inferred from a stored checkpoint
await SharedIndependentHistoryPersistentSession.restoreRecovery(options,recovery);
// @ts-expect-error the genuine core handle is not a public ownership transfer slot
session.core=raw;
