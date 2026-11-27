/**
 * Chrome strings of opt-in automatic Markdown paste (`markdownPaste: "detect"`; docs/RICH_INTERCHANGE.md).
 * Kept in a separate block so the original catalog keys and their English defaults stay byte-identical.
 * `ui_locale.ts` merges these keys into `RichUiStrings`; they are validated and overridden like any other key.
 */
export interface RichPasteUiStrings {
 readonly markdownPasteNotice:string;readonly markdownPasteUndo:string;readonly shortcutPastePlain:string;
}
/** English defaults of the post-paste notice and the paste-as-plain-text shortcut label. */
export const richPasteUiStringsEn:Readonly<RichPasteUiStrings>=Object.freeze({
 markdownPasteNotice:"Pasted text was formatted as Markdown.",markdownPasteUndo:"Undo to plain text",shortcutPastePlain:"Paste as plain text",
});
