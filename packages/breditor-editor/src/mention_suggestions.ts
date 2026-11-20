/** Borrow a local SDK editor opened with `richLanguage: 4` as an `@` mention host. */
import {mountRichMentions,type RichMentionOptions,type RichMentions} from "@breditor/experimental-rich-content";
import {slashCommandHost,type SlashCommandEditor} from "./slash_commands.js";

/** Mount opt-in `@` mention suggestions over a local candidate rich V4 editor. Dispose before the editor's host. */
export function mountMentions(editor:SlashCommandEditor,options:RichMentionOptions):RichMentions {
 return mountRichMentions(slashCommandHost(editor),options);
}
