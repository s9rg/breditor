/**
 * Borrow a shared SDK session opened with `richLanguage: 4` as an `@` mention host. The session,
 * its history and its native owner stay owned elsewhere. Choosing a suggestion publishes one guarded
 * `insert_mention` command (one Undo step restores the typed `@query`).
 */
import {mountSharedMentions,type SharedMentionOptions,type SharedMentions,type SharedRichEditor,type SharedSelectionPolicy} from "@breditor/collaboration";
import {sharedSlashCommandHost,type SharedSlashCommandEditor} from "./shared_slash_commands.js";

/** Satisfied by `SharedEditorSession` and `SharedDocumentEditorSession`. */
export interface SharedMentionEditor<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SharedSlashCommandEditor<P>,"toolbarControls"> {
 readonly core:Pick<SharedRichEditor<SharedSelectionPolicy>,"supportsMentions">;
}
/** Mount opt-in `@` mention suggestions over a shared V4 session. Dispose before closing the session. */
export function mountMentions<P extends SharedSelectionPolicy>(editor:SharedMentionEditor<P>,options:Omit<SharedMentionOptions,"core">):SharedMentions {
 return mountSharedMentions(sharedSlashCommandHost(editor),{...options,core:editor.core});
}
