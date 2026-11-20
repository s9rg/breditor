/**
 * Opt-in AI rewrite and language-check tools over a local SDK editor (docs/AI_AND_LANGUAGE_TOOLS.md).
 * The host supplies the provider; this package makes no network calls and bundles no AI client.
 * Local editors here; shared sessions use `mountSharedAiTools` from the collaboration entry.
 */
import {mountRichAiTools,mountRichLanguageCheck,richAiToolsHost,type RichAiTools,type RichAiToolsHost,type RichAiToolsOptions,type RichLanguageCheck,type RichLanguageCheckOptions} from "@breditor/experimental-rich-content";
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
