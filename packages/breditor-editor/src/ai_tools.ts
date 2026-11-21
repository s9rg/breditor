/**
 * Opt-in AI rewrite and language-check tools over a local SDK editor (docs/AI_AND_LANGUAGE_TOOLS.md).
 * The host supplies the provider; this package makes no network calls and bundles no AI client.
 * Local editors here; shared sessions use `mountSharedAiTools` from the collaboration entry.
 */
import {mountRichAiTools,mountRichLanguageCheck,richAiToolsHost,richAgentToolsHost,createRichAgentTools,type RichAgentTools,type RichAgentToolsHost,type RichAgentToolsOptions,type RichAiTools,type RichAiToolsHost,type RichAiToolsOptions,type RichLanguageCheck,type RichLanguageCheckOptions} from "@breditor/experimental-rich-content";
import {slashCommandHost,type SlashCommandEditor} from "./slash_commands.js";

/** Borrow a `LocalEditor` or `LocalDocumentEditor` as the AI tools port. The editor stays owned elsewhere. */
export function aiToolsHost(editor:SlashCommandEditor):RichAiToolsHost {return richAiToolsHost(slashCommandHost(editor));}
/** Mount the rewrite review panel in `controlsHost` (outside the editing surface). Dispose it before the editor. */
export function mountAiTools(controlsHost:HTMLElement,editor:SlashCommandEditor,options:RichAiToolsOptions={}):RichAiTools {
 return mountRichAiTools(controlsHost,aiToolsHost(editor),options);
}
/** Mount the spelling/grammar review in `controlsHost` (outside the editing surface). Dispose it before the editor. */
export function mountLanguageCheck(controlsHost:HTMLElement,editor:SlashCommandEditor,options:RichLanguageCheckOptions={}):RichLanguageCheck {
 return mountRichLanguageCheck(controlsHost,aiToolsHost(editor),options);
}
/**
 * Borrow a `LocalEditor` or `LocalDocumentEditor` as the agent tool port (docs/AI_AGENT_TOOLS.md). Several staged
 * edits apply as one native `commandGroup` (one Undo step) when the owner supports it.
 */
export function agentToolsHost(editor:SlashCommandEditor&{supportsCommandGroup?():boolean}):RichAgentToolsHost {
 const host=slashCommandHost(editor);
 return richAgentToolsHost({...host,...(editor.supportsCommandGroup?{supportsCommandGroup:()=>editor.supportsCommandGroup!()}:{})});
}
/** Create the agent tools over a local editor (review mode by default). Dispose them before the editor. */
export function createAgentTools(editor:SlashCommandEditor&{supportsCommandGroup?():boolean},options:RichAgentToolsOptions={}):RichAgentTools {
 return createRichAgentTools(agentToolsHost(editor),options);
}
