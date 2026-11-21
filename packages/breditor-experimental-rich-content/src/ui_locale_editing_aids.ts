/**
 * Chrome strings of the opt-in editing aids (show blocks, invisible characters; docs/EDITING_AIDS.md).
 * Kept in a separate block so the original catalog keys and their English defaults stay byte-identical.
 * `ui_locale.ts` merges these keys into `RichUiStrings`; they are validated and overridden like any other key.
 */
export interface RichEditingAidsUiStrings {
 readonly aidsLabel:string;readonly aidsShowBlocks:string;readonly aidsInvisibles:string;
 readonly aidBlockParagraph:string;readonly aidBlockHeading:string;readonly aidBlockBulletList:string;readonly aidBlockNumberedList:string;
 readonly aidBlockTaskList:string;readonly aidBlockListItem:string;readonly aidBlockTaskItem:string;readonly aidBlockQuote:string;
 readonly aidBlockCode:string;readonly aidBlockTable:string;readonly aidBlockCaption:string;readonly aidBlockImage:string;
 readonly aidBlockRule:string;readonly aidBlockDetails:string;readonly aidBlockSummary:string;readonly aidBlockPageBreak:string;
 readonly aidBlockOther:string;
}
/** English defaults of the editing-aid chrome and the show-blocks labels. */
export const richEditingAidsUiStringsEn:Readonly<RichEditingAidsUiStrings>=Object.freeze({
 aidsLabel:"Editing aids",aidsShowBlocks:"Show blocks",aidsInvisibles:"Show invisible characters",
 aidBlockParagraph:"Paragraph",aidBlockHeading:"Heading {level}",aidBlockBulletList:"Bulleted list",aidBlockNumberedList:"Numbered list",
 aidBlockTaskList:"Task list",aidBlockListItem:"List item",aidBlockTaskItem:"Task",aidBlockQuote:"Quote",
 aidBlockCode:"Code block",aidBlockTable:"Table",aidBlockCaption:"Caption",aidBlockImage:"Image",
 aidBlockRule:"Horizontal line",aidBlockDetails:"Collapsible section",aidBlockSummary:"Section summary",aidBlockPageBreak:"Page break",
 aidBlockOther:"Block",
});
export const richEditingAidsUiParameters:Readonly<Partial<Record<keyof RichEditingAidsUiStrings,readonly string[]>>>={aidBlockHeading:["level"]};
