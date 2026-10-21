/** Strict public contract for separately selected native comment retention. */
import {SharedRichEditor,type SharedReviewGuard,type SharedReviewPolicy,type SharedReviewHistoryPolicy} from '@breditor/collaboration';
declare const core:SharedRichEditor,guard:SharedReviewGuard,policy:SharedReviewPolicy;
const selected:SharedReviewHistoryPolicy|null=core.reviewHistoryPolicy();void selected;
core.supportsReviewHistoryGenerations();core.supportsReadOnlyReviewHistoryLifecycle();
core.enableSegmentedReview(policy,'native-archive','document-revision');
core.enableReviewHistoryGenerations('root','active',guard);core.enableObserverReviewHistoryGenerations('root','active',guard);core.enableReadOnlyReviewHistoryGenerations('root','active',guard);
core.sealReviewHistoryGeneration('next',guard);core.sealObserverReviewHistoryGeneration('next',guard);core.sealReadOnlyReviewHistoryGeneration('next',guard);const native:string=core.reviewSegmentedCheckpoint(guard);void native;
// @ts-expect-error a rendered review view is not a native archive
core.enableSegmentedReview(policy,core.reviewSnapshot().view);
// @ts-expect-error guards retain exact source owner identity
core.sealReviewHistoryGeneration('next',{documentRevision:'0',reviewRevision:'0'});
// @ts-expect-error an access string is not a separately authenticated actor policy
core.enableSegmentedReview('comment','native-archive');
