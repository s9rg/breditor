/**
 * Chrome strings of the opt-in AI rewrite and language-check tools (docs/AI_AND_LANGUAGE_TOOLS.md).
 * Kept in a separate block so the original catalog keys and their English defaults stay byte-identical.
 * `ui_locale.ts` merges these keys into `RichUiStrings`; they are validated and overridden like any other key.
 */
export interface RichAiUiStrings {
 readonly aiPanelLabel:string;readonly aiInstructionLabel:string;readonly aiScopeLabel:string;
 readonly aiScopeSelection:string;readonly aiScopeBlock:string;readonly aiScopeDocument:string;
 readonly aiGenerate:string;readonly aiStop:string;readonly aiPending:string;
 readonly aiReviewLabel:string;readonly aiBefore:string;readonly aiAfter:string;
 readonly aiAccept:string;readonly aiReject:string;readonly aiRerun:string;
 readonly aiReady:string;readonly aiApplied:string;readonly aiRejected:string;readonly aiCancelled:string;
 readonly aiStale:string;readonly aiReadOnly:string;readonly aiFailed:string;readonly aiTimeout:string;
 readonly aiInvalidOutput:string;readonly aiInputTooLarge:string;readonly aiOutputTooLarge:string;
 readonly aiNoSelection:string;readonly aiBusy:string;readonly aiLosses:string;readonly aiNoChange:string;
 readonly aiFormattedUnavailable:string;readonly aiImportRefused:string;
 readonly langPanelLabel:string;readonly langCheck:string;readonly langChecking:string;readonly langIssuesLabel:string;
 readonly langCountNone:string;readonly langCountOne:string;readonly langCount:string;
 readonly langIssue:string;readonly langReplace:string;readonly langIgnore:string;readonly langNoSuggestions:string;
 readonly langApplied:string;readonly langStale:string;readonly langIgnoredMalformed:string;readonly langReadOnly:string;
 // Agent tool review (ai_agent_review.ts).
 readonly agentReviewLabel:string;readonly agentPendingOne:string;readonly agentPending:string;readonly agentEmpty:string;
 readonly agentAccept:string;readonly agentReject:string;readonly agentStale:string;readonly agentFailed:string;
}
/** English defaults of the AI and language-tool chrome. */
export const richAiUiStringsEn:Readonly<RichAiUiStrings>=Object.freeze({
 aiPanelLabel:"Writing assistant",aiInstructionLabel:"Instruction",aiScopeLabel:"Apply to",
 aiScopeSelection:"Selected text",aiScopeBlock:"Current block",aiScopeDocument:"Whole document",
 aiGenerate:"Suggest rewrite",aiStop:"Stop",aiPending:"Waiting for the provider. Nothing changes until you accept.",
 aiReviewLabel:"Suggested change",aiBefore:"Before",aiAfter:"After",
 aiAccept:"Accept",aiReject:"Reject",aiRerun:"Run again",
 aiReady:"Review the suggested change. Accept applies it as one undoable edit.",
 aiApplied:"Applied as one change · revision {revision}",
 aiRejected:"Suggestion discarded. The document was not changed.",
 aiCancelled:"Request cancelled. The document was not changed.",
 aiStale:"The document changed after this suggestion was generated. Nothing was applied; run it again on the current text.",
 aiReadOnly:"The document is read-only; suggestions cannot be applied.",
 aiFailed:"The provider request failed: {reason}",aiTimeout:"The provider did not answer in time.",
 aiInvalidOutput:"The provider returned an unusable result; nothing was applied.",
 aiInputTooLarge:"The selected text exceeds this tool's {limit}-byte limit; nothing was sent.",
 aiOutputTooLarge:"The provider result exceeds the {limit}-byte limit; nothing was applied.",
 aiNoSelection:"Select text inside the document first.",
 aiBusy:"Wait for the current edit or composition to finish.",
 aiLosses:"Converted with changes: {losses}",aiNoChange:"The suggestion is identical to the current text.",
 aiFormattedUnavailable:"Formatted suggestions need an explicit interchange adapter; nothing was applied.",
 aiImportRefused:"The formatted suggestion was refused ({reason}); nothing was applied.",
 langPanelLabel:"Spelling and grammar",langCheck:"Check",langChecking:"Checking…",langIssuesLabel:"Issues",
 langCountNone:"No issues found",langCountOne:"1 issue",langCount:"{count} issues",
 langIssue:"“{text}”: {message}",langReplace:"Replace with “{suggestion}”",langIgnore:"Ignore",langNoSuggestions:"No suggestions",
 langApplied:"Replaced · revision {revision}",
 langStale:"The text changed; outdated issues removed: {count}.",
 langIgnoredMalformed:"Malformed provider issues ignored: {count}.",
 langReadOnly:"Read-only: issues can be reviewed but not applied.",
 agentReviewLabel:"Assistant changes",
 agentPendingOne:"1 staged edit from the assistant. Nothing changes until you accept.",
 agentPending:"{count} staged edits from the assistant. Nothing changes until you accept; Accept applies them as one undoable change.",
 agentEmpty:"No staged changes.",agentAccept:"Accept all",agentReject:"Reject all",
 agentStale:"The document changed where these edits apply. Nothing can be applied; reject them and ask again.",
 agentFailed:"The edits were not applied: {reason}",
});
/** Placeholders each AI/language template may use. */
export const richAiUiParameters:Readonly<Partial<Record<keyof RichAiUiStrings,readonly string[]>>>=Object.freeze({
 aiApplied:["revision"],aiFailed:["reason"],aiInputTooLarge:["limit"],aiOutputTooLarge:["limit"],aiLosses:["losses"],aiImportRefused:["reason"],
 agentPending:["count"],agentFailed:["reason"],
 langCount:["count"],langIssue:["text","message"],langReplace:["suggestion"],langApplied:["revision"],langStale:["count"],langIgnoredMalformed:["count"],
});
