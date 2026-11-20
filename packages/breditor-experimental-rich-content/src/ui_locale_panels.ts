/**
 * Catalog block for the opt-in panels (search, writing tools, fullscreen controls, review/comments, named versions,
 * suggestions), clipboard interchange status lines and the React panel start failures. Kept apart from the core
 * chrome keys so each block can grow independently. English defaults reproduce the pre-catalog output byte for
 * byte; several defaults are bare stable codes because that is exactly what the panels displayed before.
 */
export interface RichUiPanelStrings {
 // Shared status composition. `{status} · {part}` appends a qualifier; `{first} {second}` appends a sentence.
 readonly panelEditorClosed:string;readonly panelReadOnly:string;readonly panelStatusPart:string;readonly panelSentences:string;
 readonly panelListSeparator:string;readonly panelGroupSeparator:string;
 // Search panel.
 readonly searchLabel:string;readonly searchFind:string;readonly searchRegex:string;readonly searchMatchCase:string;readonly searchWholeWords:string;readonly searchWrap:string;
 readonly searchReplaceWith:string;readonly searchExpandCaptures:string;readonly searchPrevious:string;readonly searchNext:string;readonly searchReplace:string;readonly searchReplaceAll:string;readonly searchClose:string;
 readonly searchComposingEditor:string;readonly searchComposingQuery:string;readonly searchPending:string;readonly searchCount:string;readonly searchPosition:string;
 readonly searchReplaceUnavailable:string;readonly searchPaintLimit:string;
 readonly searchErrorClosed:string;readonly searchErrorBusy:string;readonly searchErrorReplace:string;readonly searchStartFailed:string;
 // Writing tools (counts and outline).
 readonly writingLabel:string;readonly writingOutlineLabel:string;
 readonly writingCountWords:string;readonly writingCountGraphemes:string;readonly writingCountScalars:string;readonly writingCountUtf16:string;readonly writingCountUtf8:string;readonly writingCountBlocks:string;
 readonly writingHeading:string;readonly writingHeadingTruncated:string;readonly writingHeadingOverBudget:string;readonly writingHeadingEmpty:string;
 readonly writingPages:string;readonly writingNoHeadings:string;readonly writingPrevious:string;readonly writingNext:string;readonly writingRefresh:string;
 readonly writingCountsUnavailable:string;readonly writingComposing:string;readonly writingPending:string;readonly writingUpdating:string;readonly writingAccepted:string;
 readonly writingErrorStale:string;readonly writingErrorChanged:string;readonly writingStartFailed:string;
 // Fullscreen controls and the controller's user-facing refusals.
 readonly fullscreenEnter:string;readonly fullscreenExit:string;readonly fullscreenActive:string;readonly fullscreenForeign:string;readonly fullscreenUnsupported:string;readonly fullscreenComposing:string;
 readonly fullscreenErrorIdle:string;readonly fullscreenErrorBusy:string;readonly fullscreenErrorUnavailable:string;readonly fullscreenErrorDetached:string;readonly fullscreenErrorLost:string;
 readonly fullscreenErrorPending:string;readonly fullscreenErrorForeignExit:string;readonly fullscreenErrorAbove:string;readonly fullscreenErrorNotReleased:string;readonly fullscreenStartFailed:string;
 // Review (comments) panel.
 readonly reviewHeading:string;readonly reviewNewComment:string;readonly reviewUseSelection:string;readonly reviewUseDocument:string;readonly reviewPost:string;readonly reviewUndo:string;readonly reviewRedo:string;
 readonly reviewTargetDocument:string;readonly reviewTargetSelection:string;readonly reviewChooseTarget:string;readonly reviewTargetChanged:string;readonly reviewErrorSelect:string;readonly reviewErrorTarget:string;
 readonly reviewEditComment:string;readonly reviewEdit:string;readonly reviewRetract:string;readonly reviewSaveEdit:string;readonly reviewUseCurrent:string;readonly reviewCancelEdit:string;readonly reviewEditStale:string;
 readonly reviewAuthor:string;readonly reviewConcurrentVersions:string;readonly reviewMessage:string;readonly reviewMessageRetracted:string;readonly reviewContributionUndone:string;readonly reviewErrorNoEdit:string;
 readonly reviewReply:string;readonly reviewResolve:string;readonly reviewReopen:string;readonly reviewReanchor:string;readonly reviewPostReply:string;readonly reviewErrorReanchor:string;
 readonly reviewThread:string;readonly reviewThreadHidden:string;readonly reviewStateOpen:string;readonly reviewStateResolved:string;readonly reviewStateConflicted:string;
 readonly reviewOrphaned:string;readonly reviewOrphanTargetDeleted:string;readonly reviewOrphanHiddenTable:string;readonly reviewOrphanRangeCollapsed:string;readonly reviewOrphanKindChanged:string;
 readonly reviewTargetPending:string;readonly reviewTargetAttached:string;readonly reviewConcurrentAnchors:string;
 readonly reviewShowQuotes:string;readonly reviewQuote:string;readonly reviewQuoteCaret:string;readonly reviewQuoteDocument:string;readonly reviewQuotePending:string;readonly reviewQuoteTooLarge:string;readonly reviewQuoteNotLoaded:string;
 readonly reviewStartFailed:string;
 // Named versions (version history) inside the review panel.
 readonly versionHeading:string;readonly versionName:string;readonly versionSaved:string;readonly versionSave:string;readonly versionRetry:string;readonly versionCompare:string;readonly versionPreview:string;readonly versionApply:string;readonly versionSync:string;
 readonly versionRestoreNotice:string;readonly versionRestored:string;readonly versionErrorNoPlan:string;readonly versionLoading:string;readonly versionErrorChanged:string;readonly versionLoaded:string;readonly versionUnusable:string;
 readonly versionRefreshed:string;readonly versionSyncFailed:string;readonly versionShared:string;readonly versionSelected:string;
 readonly versionCacheSaved:string;readonly versionCacheUnconfirmed:string;readonly versionCacheMissing:string;readonly versionAccepted:string;readonly versionQueued:string;readonly versionLocalDraft:string;
 readonly versionSaving:string;readonly versionSavedRemote:string;readonly versionSavedLocal:string;readonly versionSaveFailed:string;readonly versionOption:string;readonly versionSourceChanged:string;
 // Synchronization states shared by named versions and suggestions (defaults are the stable state codes).
 readonly syncWaiting:string;readonly syncOffline:string;readonly syncConnecting:string;readonly syncSyncing:string;readonly syncReady:string;readonly syncPending:string;readonly syncDenied:string;readonly syncFailed:string;readonly syncLocalSaveFailed:string;readonly syncClosed:string;
 // Suggestion panel.
 readonly suggestHeading:string;readonly suggestTitle:string;readonly suggestActionLabel:string;readonly suggestSelection:string;
 readonly suggestCreate:string;readonly suggestRevise:string;readonly suggestRebaseFormat:string;readonly suggestRetry:string;readonly suggestSync:string;readonly suggestLoad:string;readonly suggestPreview:string;
 readonly suggestAccept:string;readonly suggestReject:string;readonly suggestStopDecision:string;readonly suggestStopPublication:string;readonly suggestRequeue:string;
 readonly suggestErrorAllocator:string;readonly suggestErrorPropose:string;readonly suggestErrorUnsupported:string;readonly suggestErrorSourceChanged:string;readonly suggestRetained:string;readonly suggestSaved:string;
 readonly suggestErrorOwn:string;readonly suggestErrorReviseUnsupported:string;readonly suggestErrorReviseChanged:string;readonly suggestRevised:string;
 readonly suggestFormatQueued:string;readonly suggestFormatPending:string;readonly suggestFormatUnsupported:string;readonly suggestFormatConflict:string;
 readonly suggestRetried:string;readonly suggestSynced:string;readonly suggestErrorLoadChanged:string;readonly suggestErrorFinal:string;
 readonly suggestPreviewNotice:string;readonly suggestPreviewReady:string;readonly suggestPreviewPending:string;readonly suggestPreviewConflict:string;readonly suggestLoaded:string;
 readonly suggestErrorNoPreview:string;readonly suggestErrorAccept:string;readonly suggestAcceptQueued:string;readonly suggestErrorReject:string;readonly suggestRejectQueued:string;
 readonly suggestDecisionStopped:string;readonly suggestPublicationStopped:string;readonly suggestPublicationRequeued:string;
 readonly suggestNetwork:string;readonly suggestConflicts:string;readonly suggestLocalOnly:string;readonly suggestRevisions:string;readonly suggestRevisionError:string;
 readonly suggestOption:string;readonly suggestDetails:string;readonly suggestPacketSaved:string;readonly suggestPacketUnconfirmed:string;readonly suggestPacketMissing:string;
 readonly suggestPublished:string;readonly suggestPublicationQueued:string;readonly suggestPublicationLocal:string;readonly suggestRequested:string;readonly suggestRetryQueued:string;readonly suggestRetriesStopped:string;
 readonly suggestDecisionAccept:string;readonly suggestDecisionReject:string;readonly suggestNone:string;
 readonly suggestOutcome:string;readonly suggestAcceptingWriter:string;readonly suggestLost:string;readonly suggestFinalMetadataOnly:string;readonly suggestReceiptPending:string;readonly suggestReceiptUnconfirmed:string;readonly suggestReceiptSaved:string;readonly suggestNoOutcome:string;
 readonly suggestRevisionOf:string;readonly suggestRevisionQueued:string;readonly suggestRevisionStopped:string;readonly suggestRevisionPublished:string;readonly suggestRevisionConflict:string;
 readonly suggestRevisionLost:string;readonly suggestWinningSuccessor:string;readonly suggestPredecessorFinal:string;readonly suggestRevisionPreviewOnly:string;readonly suggestSuperseded:string;readonly suggestPreviewStale:string;
 readonly suggestTextLegend:string;readonly suggestTextPolicy:string;readonly suggestTextChoose:string;readonly suggestTextRefuse:string;readonly suggestTextPreserve:string;readonly suggestTextRebase:string;
 readonly suggestTextErrorPolicy:string;readonly suggestTextErrorAllocator:string;readonly suggestTextErrorChanged:string;
 readonly suggestTextQueued:string;readonly suggestTextPending:string;readonly suggestTextUnsupported:string;readonly suggestTextIntervening:string;readonly suggestTextConflict:string;
 // Standard suggestion actions (`standardSharedSuggestionActions`); custom actions carry their own labels.
 readonly suggestReplaceText:string;readonly suggestProtectedText:string;readonly suggestFieldProposedText:string;
 readonly suggestFormatText:string;readonly suggestFieldTextFormat:string;readonly suggestFormatBold:string;readonly suggestFormatItalic:string;readonly suggestFormatUnderline:string;readonly suggestFormatStrike:string;
 readonly suggestFieldFormatChange:string;readonly suggestFormatApply:string;readonly suggestFormatRemove:string;
 readonly suggestHeadingAction:string;readonly suggestFieldHeadingRank:string;readonly suggestHeadingParagraph:string;readonly suggestHeadingLevel:string;
 readonly suggestListAction:string;readonly suggestFieldListStyle:string;readonly suggestListBullet:string;readonly suggestListNumbered:string;
 readonly suggestTableRow:string;readonly suggestTableColumn:string;readonly suggestFieldColumnWidth:string;
 readonly suggestImageAlt:string;readonly suggestFieldImageDescription:string;readonly suggestImageCaption:string;readonly suggestFieldImageCaption:string;
 readonly suggestErrorSelectText:string;readonly suggestErrorColumn:string;readonly suggestErrorRow:string;readonly suggestErrorProtected:string;readonly suggestErrorRange:string;
 readonly suggestErrorHeading:string;readonly suggestErrorImage:string;readonly suggestErrorList:string;readonly suggestStartFailed:string;
 // Clipboard interchange status lines. Loss codes themselves are relabelled through `notices`.
 readonly clipboardPasted:string;readonly clipboardCut:string;readonly clipboardCopied:string;readonly clipboardStatus:string;readonly clipboardFormatLosses:string;
 readonly clipboardFormatHtml:string;readonly clipboardFormatMarkdown:string;readonly clipboardNoticeCount:string;readonly clipboardDestination:string;
 readonly pasteTargetCaption:string;readonly pasteTargetCode:string;
}
export const richUiPanelStringsEn:Readonly<RichUiPanelStrings>=Object.freeze({
 panelEditorClosed:"Editor closed",panelReadOnly:"Read-only",panelStatusPart:"{status} · {part}",panelSentences:"{first} {second}",panelListSeparator:", ",panelGroupSeparator:"; ",
 searchLabel:"Find and replace",searchFind:"Find",searchRegex:"Regular expression",searchMatchCase:"Match case",searchWholeWords:"Whole words",searchWrap:"Wrap",
 searchReplaceWith:"Replace with",searchExpandCaptures:"Expand captures",searchPrevious:"Previous",searchNext:"Next",searchReplace:"Replace",searchReplaceAll:"Replace all",searchClose:"Close",
 searchComposingEditor:"Finish composing in the editor to search",searchComposingQuery:"Finish entering the search text",searchPending:"Applying guarded search action",
 searchCount:"{count} matches",searchPosition:"{index} of {count}",
 searchReplaceUnavailable:"Replacement requires search-enabled recovery",searchPaintLimit:"Decoration paint limit reached; every result remains navigable",
 searchErrorClosed:"Search controls are closed",searchErrorBusy:"Search actions wait for the current editor operation or composition",searchErrorReplace:"Replacement requires an editable search-enabled owner",
 searchStartFailed:"Search controls could not start: {error}",
 writingLabel:"Writing tools",writingOutlineLabel:"Heading outline",
 writingCountWords:"Word segments",writingCountGraphemes:"Characters (graphemes)",writingCountScalars:"Unicode scalars",writingCountUtf16:"UTF-16 units",writingCountUtf8:"UTF-8 bytes",writingCountBlocks:"Text blocks",
 writingHeading:"H{level} {label}",writingHeadingTruncated:"H{level} {label} …",writingHeadingOverBudget:"H{level} (label exceeds display budget) …",writingHeadingEmpty:"H{level} (empty heading)",
 writingPages:"Headings {start}–{end} of {total}",writingNoHeadings:"No headings",writingPrevious:"Previous headings",writingNext:"Next headings",writingRefresh:"Refresh",
 writingCountsUnavailable:"Counts unavailable: {error}",writingComposing:"Finish composing to update writing tools",writingPending:"Navigating to the displayed heading",
 writingUpdating:"Updating; previous counts and headings are not current",writingAccepted:"Accepted document · revision {revision}",
 writingErrorStale:"The displayed writing source is no longer current",writingErrorChanged:"Writing source changed before display",writingStartFailed:"Writing controls could not start: {error}",
 fullscreenEnter:"Enter fullscreen",fullscreenExit:"Exit fullscreen",fullscreenActive:"Fullscreen",fullscreenForeign:"Another fullscreen session is active",
 fullscreenUnsupported:"Native fullscreen unavailable",fullscreenComposing:"Finish composing before fullscreen",
 fullscreenErrorIdle:"Fullscreen entry requires the exact idle editor publication outside composition",fullscreenErrorBusy:"Another fullscreen session or transition is active",
 fullscreenErrorUnavailable:"Native fullscreen is unavailable or denied by this environment",fullscreenErrorDetached:"Fullscreen target no longer contains this connected editor in its original document",
 fullscreenErrorLost:"Fullscreen request no longer owns the active target",fullscreenErrorPending:"A fullscreen transition is already pending",
 fullscreenErrorForeignExit:"Cannot exit another fullscreen session",fullscreenErrorAbove:"Another fullscreen target is above this session; leave it before retrying cleanup",
 fullscreenErrorNotReleased:"Native fullscreen exit did not release this target",fullscreenStartFailed:"Fullscreen controls could not start: {error}",
 reviewHeading:"Review",reviewNewComment:"New comment",reviewUseSelection:"Use editor selection",reviewUseDocument:"Use document",reviewPost:"Post comment",reviewUndo:"Undo comment",reviewRedo:"Redo comment",
 reviewTargetDocument:"Target: document discussion",reviewTargetSelection:"Target: captured editor selection",reviewChooseTarget:"Choose a target for the next comment.",
 reviewTargetChanged:"The captured publication changed. Choose the target again; your draft is retained.",
 reviewErrorSelect:"Select text, an image or table cells first",reviewErrorTarget:"Choose a comment target first",
 reviewEditComment:"Edit comment",reviewEdit:"Edit",reviewRetract:"Retract",reviewSaveEdit:"Save edit",reviewUseCurrent:"Use current discussion",reviewCancelEdit:"Cancel edit",
 reviewEditStale:"The document or discussion changed. Review current versions, then use the current discussion before saving your draft.",
 reviewAuthor:"Author: {author}",reviewConcurrentVersions:"Concurrent message versions — choose an explicit combined edit.",reviewMessage:"{principal}: {text}",reviewMessageRetracted:"{principal}: [Retracted]",
 reviewContributionUndone:"[Contribution undone]",reviewErrorNoEdit:"Open an edit before saving",
 reviewReply:"Reply",reviewResolve:"Resolve",reviewReopen:"Reopen",reviewReanchor:"Reanchor to selection",reviewPostReply:"Post reply",reviewErrorReanchor:"Select an explicit target in the editor first",
 reviewThread:"Discussion — {state}",reviewThreadHidden:"Discussion — {state} (hidden contributions)",reviewStateOpen:"open",reviewStateResolved:"resolved",reviewStateConflicted:"conflicted",
 reviewOrphaned:"Orphaned: {reason}",reviewOrphanTargetDeleted:"target_deleted",reviewOrphanHiddenTable:"hidden_table",reviewOrphanRangeCollapsed:"range_collapsed",reviewOrphanKindChanged:"target_kind_changed",
 reviewTargetPending:"Waiting for document edits",reviewTargetAttached:"Attached to original target",reviewConcurrentAnchors:"Concurrent anchors: {targets}",
 reviewShowQuotes:"Show original quotes",reviewQuote:"Original quote: {text}",reviewQuoteCaret:"Original quote: (caret — no selected text)",reviewQuoteDocument:"Document discussion — no selected quote",
 reviewQuotePending:"Original quote is waiting for document history; retry after catchup.",reviewQuoteTooLarge:"Original quote exceeds the 64 KiB limit.",
 reviewQuoteNotLoaded:"Original quote not loaded; choose Show original quotes to read this captured target.",reviewStartFailed:"Review controls could not start: {error}",
 versionHeading:"Named versions",versionName:"Version name",versionSaved:"Saved version",versionSave:"Save named version",versionRetry:"Retry version persistence",versionCompare:"Compare version",
 versionPreview:"Preview restore",versionApply:"Apply restore",versionSync:"Sync versions",
 versionRestoreNotice:"Restore creates fresh identities and keeps current discussions. Inactive merge history and asset bytes are not restored.",
 versionRestored:"Restored as a new undoable edit. Current discussions were retained.",versionErrorNoPlan:"Prepare a current native restore preview first",
 versionLoading:"Loading and saving the immutable version packet locally…",versionErrorChanged:"The selected version or source publication changed while loading. Retry against the current source.",
 versionLoaded:"Version packet loaded and saved locally.",versionUnusable:"Version could not be used. The current document and drafts were retained.",
 versionRefreshed:"Version catalog refreshed. Queued publications remain pending until accepted.",versionSyncFailed:"Version synchronization did not finish; retained local packets were kept.",
 versionShared:"Shared versions: {status}. {queued} queued; {entries} accepted catalog entries.",versionSelected:"Selected packet: {cache}; {acceptance}.",
 versionCacheSaved:"saved locally",versionCacheUnconfirmed:"local save unconfirmed",versionCacheMissing:"not cached; requires a connection",
 versionAccepted:"server accepted at {sequence}",versionQueued:"queued, not yet accepted",versionLocalDraft:"local draft, not queued",
 versionSaving:"Saving paired histories and versions…",versionSavedRemote:"Version saved locally. Server acceptance is reported separately below.",versionSavedLocal:"Version catalog and both histories saved locally.",
 versionSaveFailed:"Version save failed. Your draft is retained; inspect retained versions, then retry persistence without recapturing.",
 versionOption:"{name} — {author}",versionSourceChanged:"The source publication changed. Preview the restore again before applying.",
 syncWaiting:"Waiting for document history acceptance.",syncOffline:"offline",syncConnecting:"connecting",syncSyncing:"syncing",syncReady:"ready",syncPending:"pending",syncDenied:"denied",syncFailed:"failed",
 syncLocalSaveFailed:"local-save-failed",syncClosed:"closed",
 suggestHeading:"Suggestions",suggestTitle:"Suggestion title",suggestActionLabel:"Proposal action",suggestSelection:"Suggestion",
 suggestCreate:"Create suggestion",suggestRevise:"Revise selected suggestion",suggestRebaseFormat:"Rebase formatting suggestion",suggestRetry:"Retry suggestion persistence",suggestSync:"Sync suggestions",
 suggestLoad:"Load suggestion",suggestPreview:"Preview suggestion",suggestAccept:"Queue Accept",suggestReject:"Queue Reject",suggestStopDecision:"Stop decision retries",
 suggestStopPublication:"Stop publication retries",suggestRequeue:"Queue publication again",
 suggestErrorAllocator:"This structural proposal requires a durable fresh-ID allocator",suggestErrorPropose:"Proposals are unavailable for the current display policy",
 suggestErrorUnsupported:"The editor selection is not supported by this proposal action",suggestErrorSourceChanged:"The source changed while building the proposal; your draft is retained",
 suggestRetained:"Proposal retained; saving locally…",suggestSaved:"Proposal saved locally. Publication and final decisions are separate below.",
 suggestErrorOwn:"Choose your own pending retained suggestion first",suggestErrorReviseUnsupported:"The accepted editor selection is not supported by this revision action",
 suggestErrorReviseChanged:"The accepted source changed while building the revision; your fields are retained",
 suggestRevised:"Revision saved locally. This is full replacement intent at accepted content, not an edit of the old preview. The server must finalize supersession before this child can be reviewed.",
 suggestFormatQueued:"Formatting revision saved locally. Original characters and unrelated formats are preserved; await server supersession before reviewing the child.",
 suggestFormatPending:"Formatting rebase is waiting for original document history. Nothing was queued.",
 suggestFormatUnsupported:"This proposal cannot use automatic formatting rebase. Create an explicit manual revision; nothing was queued.",
 suggestFormatConflict:"Original characters or edited formatting changed. Create an explicit manual revision; nothing was queued.",
 suggestRetried:"Local suggestion persistence retried. Server finalization is separate.",suggestSynced:"Suggestion synchronization refreshed. Check the original final outcome below.",
 suggestErrorLoadChanged:"The selected suggestion or source changed while loading. Preview again; drafts were retained.",suggestErrorFinal:"This suggestion is already final; it cannot be queued again",
 suggestPreviewNotice:"Proposed content only. Accept is queued for authenticated server finalization; asset bytes remain host-owned.",
 suggestPreviewReady:"Native preview ready. Accepted content and history are unchanged.",suggestPreviewPending:"Preview is waiting for document history.",
 suggestPreviewConflict:"Proposal conflicts with current content. Reject it or create a revised proposal.",suggestLoaded:"Immutable proposal packet loaded and saved locally.",
 suggestErrorNoPreview:"Prepare a current native preview for this suggestion first",suggestErrorAccept:"Accept is unavailable for the current display policy",
 suggestAcceptQueued:"Accept request saved locally; the server's original final outcome is shown separately.",suggestErrorReject:"Reject is unavailable for the current display policy",
 suggestRejectQueued:"Reject request saved locally; the server's original final outcome is shown separately.",
 suggestDecisionStopped:"Decision retries stopped locally. A request already received by the server may still be final.",
 suggestPublicationStopped:"Publication retries stopped locally; this does not withdraw a server publication.",
 suggestPublicationRequeued:"Publication requeued with the original immutable packet; server acceptance is separate.",
 suggestNetwork:"Suggestions: {status}. {publications} publications and {decisions} decisions queued.",suggestConflicts:"Conflicting proposals: {ids}.",
 suggestLocalOnly:"Local proposal queue only; no network adapter was supplied.",suggestRevisions:"Revisions: {status}; {pending} supersessions queued.",suggestRevisionError:"{error}.",
 suggestOption:"{title} — {author}",suggestDetails:"{title} — proposed by {author}.",suggestPacketSaved:"Packet/intent saved locally.",suggestPacketUnconfirmed:"Local save unconfirmed.",
 suggestPacketMissing:"Packet not cached; load it before review.",suggestPublished:"Published at {sequence}.",suggestPublicationQueued:"Publication queued, not yet accepted.",
 suggestPublicationLocal:"Local draft; publication not queued.",suggestRequested:"Requested {decision}; {retry}.",suggestRetryQueued:"retry queued",suggestRetriesStopped:"retries stopped",
 suggestDecisionAccept:"accept",suggestDecisionReject:"reject",suggestNone:"No suggestions retained or discovered.",
 suggestOutcome:"Final server outcome: {decision} by {principal} at {sequence}.",suggestAcceptingWriter:"Accepting writer {writer}.",suggestLost:"Your requested {decision} did not win.",
 suggestFinalMetadataOnly:"Final metadata only; local packet/receipt not cached.",suggestReceiptPending:"Local final receipt not yet retained; document history may still be pending.",
 suggestReceiptUnconfirmed:"Local receipt save is unconfirmed.",suggestReceiptSaved:"Final receipt saved locally.",
 suggestNoOutcome:"No final server decision. Queued choices do not change accepted content.",
 suggestRevisionOf:"Immutable revision of {previous}; {state}.",suggestRevisionQueued:"queued",suggestRevisionStopped:"stopped",suggestRevisionPublished:"published",suggestRevisionConflict:"conflict",
 suggestRevisionLost:"This revision did not win. Its exact draft is retained; it was not published as an independent suggestion.",suggestWinningSuccessor:"Winning successor: {successor}.",
 suggestPredecessorFinal:"The predecessor already had a final decision.",
 suggestRevisionPreviewOnly:"Revision child preview only. Await authenticated supersession and local queue handoff before Accept/Reject.",
 suggestSuperseded:"Superseded by immutable successor {successor}; the old proposal was not accepted.",suggestPreviewStale:"The source or final decision changed. Preview again before queuing Accept.",
 suggestTextLegend:"Text revision",suggestTextPolicy:"Peer text handling",suggestTextChoose:"Choose a text policy",suggestTextRefuse:"Refuse if peer text is inside the range",
 suggestTextPreserve:"Preserve peer text",suggestTextRebase:"Rebase text suggestion",suggestTextErrorPolicy:"Choose how to handle peer text before rebasing",
 suggestTextErrorAllocator:"Text rebase requires a durable fresh-ID allocator",suggestTextErrorChanged:"The source changed while allocating the text revision; the namespace stays consumed",
 suggestTextQueued:"Text revision saved locally. Await authenticated server supersession before reviewing or deciding the child.",
 suggestTextPending:"Text rebase is waiting for original document history. Nothing was queued.",
 suggestTextUnsupported:"This proposal cannot use automatic text rebase. Create an explicit manual revision; nothing was queued.",
 suggestTextIntervening:"Peer text is inside this replacement. Choose Preserve peer text or make a manual revision; nothing was queued.",
 suggestTextConflict:"Original characters, formatting or structure changed. Review the conflict or make a manual revision; nothing was queued.",
 suggestReplaceText:"Replace selected text",suggestProtectedText:"Replace text across structures",suggestFieldProposedText:"Proposed text",
 suggestFormatText:"Change text formatting",suggestFieldTextFormat:"Text format",suggestFormatBold:"Bold",suggestFormatItalic:"Italic",suggestFormatUnderline:"Underline",suggestFormatStrike:"Strikethrough",
 suggestFieldFormatChange:"Format change",suggestFormatApply:"Apply",suggestFormatRemove:"Remove",
 suggestHeadingAction:"Change heading",suggestFieldHeadingRank:"Heading rank",suggestHeadingParagraph:"Paragraph",suggestHeadingLevel:"Heading {level}",
 suggestListAction:"Wrap a list",suggestFieldListStyle:"List style",suggestListBullet:"Bullet",suggestListNumbered:"Numbered",
 suggestTableRow:"Append table row",suggestTableColumn:"Append table column",suggestFieldColumnWidth:"Column width",
 suggestImageAlt:"Change image description",suggestFieldImageDescription:"Image description",suggestImageCaption:"Change image caption",suggestFieldImageCaption:"Image caption",
 suggestErrorSelectText:"Select nonempty text first",suggestErrorColumn:"Select a table and a positive whole column width",suggestErrorRow:"Select a table or one of its cells first",
 suggestErrorProtected:"Use matching native protected-range proposal planning and an explicit text selection",suggestErrorRange:"Select a text range or caret first",
 suggestErrorHeading:"Select prose and a valid heading rank",suggestErrorImage:"Select an image or its caption first",suggestErrorList:"Select sibling prose blocks first",
 suggestStartFailed:"Suggestion controls could not start: {error}",
 clipboardPasted:"Pasted",clipboardCut:"Cut",clipboardCopied:"Copied",clipboardStatus:"{operation} · {messages}.",clipboardFormatLosses:"{format}: {losses}",
 clipboardFormatHtml:"html",clipboardFormatMarkdown:"markdown",clipboardNoticeCount:"{notice} ×{count}",clipboardDestination:"text into {target}; formatting loss: {losses}",
 pasteTargetCaption:"caption",pasteTargetCode:"code",
});
/** Placeholders each panel template may use. */
export const richUiPanelParameters:Readonly<Partial<Record<keyof RichUiPanelStrings,readonly string[]>>>={
 panelStatusPart:["status","part"],panelSentences:["first","second"],
 searchCount:["count"],searchPosition:["index","count"],searchStartFailed:["error"],
 writingHeading:["level","label"],writingHeadingTruncated:["level","label"],writingHeadingOverBudget:["level"],writingHeadingEmpty:["level"],
 writingPages:["start","end","total"],writingCountsUnavailable:["error"],writingAccepted:["revision"],writingStartFailed:["error"],fullscreenStartFailed:["error"],
 reviewAuthor:["author"],reviewMessage:["principal","text"],reviewMessageRetracted:["principal"],reviewThread:["state"],reviewThreadHidden:["state"],reviewOrphaned:["reason"],
 reviewConcurrentAnchors:["targets"],reviewQuote:["text"],reviewStartFailed:["error"],
 versionShared:["status","queued","entries"],versionSelected:["cache","acceptance"],versionAccepted:["sequence"],versionOption:["name","author"],
 suggestNetwork:["status","publications","decisions"],suggestConflicts:["ids"],suggestRevisions:["status","pending"],suggestRevisionError:["error"],
 suggestOption:["title","author"],suggestDetails:["title","author"],suggestPublished:["sequence"],suggestRequested:["decision","retry"],
 suggestOutcome:["decision","principal","sequence"],suggestAcceptingWriter:["writer"],suggestLost:["decision"],suggestRevisionOf:["previous","state"],
 suggestWinningSuccessor:["successor"],suggestSuperseded:["successor"],suggestHeadingLevel:["level"],suggestStartFailed:["error"],
 clipboardStatus:["operation","messages"],clipboardFormatLosses:["format","losses"],clipboardNoticeCount:["notice","count"],clipboardDestination:["target","losses"],
};
/**
 * Stable interchange notice codes a catalog may relabel: foreign HTML/Markdown conversion losses and the
 * caption/code paste projection losses. Unlisted codes (from a newer adapter) display as their code.
 */
export const richUiNoticeCodes=Object.freeze(["html-repaired","removed-content","unsupported-element","unsupported-attribute","unsupported-style","style-approximation","unsafe-link",
 "image-reference","image-alt","image-size","block-structure","table-geometry","table-width","list-numbering","markdown-feature","inline-formatting","block-properties","embedded-content"] as const);
export type RichUiNoticeCode=typeof richUiNoticeCodes[number];
