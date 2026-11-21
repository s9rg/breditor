/** ABI-local typed requests. Rust remains authoritative for identity, scalar and schema admission. */
import type {RichCell,RichPoint,RichSelection} from "./core.js";
export type FormatLiteral = Readonly<{type:string;properties:Readonly<Record<string,unknown>>}>;
export type ImageAlt = {kind:"decorative"}|{kind:"description";text:string};
export interface ImageSize {width:number;height:number}
export interface TextDraft {block:string;text:string;formatsJson:string}
export interface ImageDraft {block:string;image:string;asset:string;generation:string;alt:ImageAlt;size:ImageSize|null;caption:TextDraft|null}
export interface TableColumnDraft {id:string;width:number}
export interface TableCellDraft {block:string;column:string;header:boolean;body:readonly FlowDraft[]}
export interface TableRowDraft {block:string;id:string;cells:readonly TableCellDraft[]}
export interface TableDraft {block:string;table:string;columns:readonly TableColumnDraft[];rows:readonly TableRowDraft[]}
export type FlowDraft = ({kind:"paragraph"}&TextDraft)|({kind:"heading";level:number}&TextDraft)
 |{kind:"blockquote";block:string;body:readonly FlowDraft[]}
 |{kind:"codeBlock";block:string;text:string;language:string|null}
 |{kind:"horizontalRule";block:string}
 /** Rich V4 atomic page break; admitted only as a direct child of the document root. */
 |{kind:"pageBreak";block:string}
 /** Rich V4 collapsible section: summary identity and runs, persisted open state, nonempty body. */
 |{kind:"details";block:string;summary:string;text:string;formatsJson:string;open:boolean;body:readonly FlowDraft[]}
 |{kind:"taskList";block:string;items:readonly {block:string;checked:boolean;body:readonly FlowDraft[]}[]}
 |{kind:"list";block:string;start:number|null;items:readonly {block:string;body:readonly FlowDraft[]}[]}
 |({kind:"image"}&ImageDraft)|({kind:"table"}&TableDraft);
export interface FlowPosition {parent:{kind:"document"}|{kind:"cell";cell:RichCell}|{kind:"listItem"|"blockquote"|"taskItem"|"details";block:string};before:string|null}
/** Use a unique prefix for every authored paste, including failed/undone ones. */
export interface ClipboardAllocation {prefix:string;replica:string;counter:string;lamport:string}
/** Full admitted literals are retained for removals; Rust chooses all selected targets. */
export type RichSelectionFormatChange={kind:"set"|"remove";formatsJson:string}|{kind:"patch";formatsJson:string;properties:readonly string[]};
/** Follow-up kinds admitted by `replaceTriggerThen`; each addresses blocks by identity, never text offsets. */
export type RichTriggerCompositeKind="setHeading"|"setCodeBlock"|"wrapList"|"setListKind"|"wrapTaskList"|"wrapBlockquote"|"wrapDetails"|"insertHorizontalRule"|"insertTable"|"insertBlocks"|"insertPageBreak";
export type RichTriggerCompositeCommand=Extract<RichCommand,{kind:RichTriggerCompositeKind}>;
/** Step kinds admitted by `commandGroup` (text range, inline format and block-identity flow commands). */
export type RichCommandGroupKind="replaceTextRange"|"replaceGeneralRangePlainText"|"setInlineFormat"|"changeInlineFormats"|"setHeading"|"insertBlocks"|"replaceBlocks"|"moveBlock";
export type RichCommandGroupStep=Extract<RichCommand,{kind:RichCommandGroupKind}>;
export type RichCommand =
 |{kind:"replaceGeneralRangeText";data:{selection:Extract<RichSelection,{kind:"text"}>;runs:readonly {text:string;formatsJson:string}[];prefix:string}}
 |{kind:"pasteGeneralInlineClipboard";data:{selection:Extract<RichSelection,{kind:"text"}>;clipboardJson:string;prefix:string}}
 |{kind:"insertGeneralParagraph";data:{selection:Extract<RichSelection,{kind:"text"}>;prefix:string}}
 |{kind:"pasteGeneralFlowClipboard";data:{selection:Extract<RichSelection,{kind:"text"}>;clipboardJson:string;allocation:ClipboardAllocation;prefix:string;right:string}}
 |{kind:"replaceGeneralRangePlainText";data:{selection:Extract<RichSelection,{kind:"text"}>;text:string;prefix:string}}
 |{kind:"replaceGeneralRangeTypingText";data:{selection:Extract<RichSelection,{kind:"text"}>;text:string;prefix:string;clockMs:string}}
 |{kind:"changeSelectionLayout";data:import("./core.js").RichBlockLayoutPatch}
 |{kind:"changeSelectionFormats";data:{changes:readonly RichSelectionFormatChange[]}}
 |{kind:"deleteAtom";data:{paragraph:string;movement:"before"|"after"}}
 |{kind:"replaceAtomPlainText";data:{paragraph:string;text:string}}
 |{kind:"replaceAtomTypingText";data:{paragraph:string;text:string;clockMs:string}}
 |{kind:"insertTypingText";data:{text:string;clockMs:string}}
 |{kind:"deleteTypingRange";data:{selection:Extract<RichSelection,{kind:"text"}>;direction:"backward"|"forward";clockMs:string}}
 |{kind:"indentTaskItems";data:{container:string;first:string;last:string;nested:string|null}}
 |{kind:"outdentTaskItems";data:{container:string;first:string;last:string;tail:string|null}}
 |{kind:"exitTaskItem";data:{container:string;item:string;tail:string|null}}
 |{kind:"setCodeBlock";data:{block:string;language:string|null;formatPolicy:"rejectFormatted"|"removeFormats"}}
 |{kind:"setCodeLanguage";data:{block:string;language:string|null}}
 /** One existing insertion recipe; native Rust derives the same-flow position from the caret. */
 |{kind:"exitCodeBlock";data:{paragraph:string}}
 |{kind:"navigateFlow";data:{movement:"before"|"after"}}
 |{kind:"insertParagraphAdjacent";data:{paragraph:string;side:"before"|"after"}}
 |{kind:"setTaskChecked";data:{item:string;checked:boolean}}
 |{kind:"wrapBlockquote";data:{first:string;last:string;wrapper:string}}
 |{kind:"unwrapBlockquote";data:{wrapper:string}}
 /** Rich V4 collapsible sections (each refused by V1–V3 owners). The wrapped siblings become
  * the body of a new section with an empty summary; unwrap keeps the summary text as a paragraph. */
 |{kind:"wrapDetails";data:{first:string;last:string;wrapper:string;summary:string;open:boolean}}
 |{kind:"unwrapDetails";data:{wrapper:string}}
 /** Persisted open state; collapsing moves a selection inside the hidden body to the summary end. */
 |{kind:"setDetailsOpen";data:{block:string;open:boolean}}
 /** Enter from a summary caret: a fresh first body paragraph (expanding a collapsed section). */
 |{kind:"enterDetailsBody";data:{paragraph:string}}
 /** Rich V4: add one empty trailing caption (fresh block `caption`) to a table and place
  * the caret in it, as one history group. A table that already has a caption is refused. */
 |{kind:"addTableCaption";data:{table:string;caption:string}}
 /** Rich V4: remove a table's caption in one history group; an absent caption is a no-op.
  * A caret in the caption becomes a node selection of the table. */
 |{kind:"removeTableCaption";data:{table:string}}
 |{kind:"wrapTaskList";data:{first:string;last:string;container:string;items:readonly {block:string;checked:boolean}[]}}
 |{kind:"unwrapTaskList";data:{list:string}}
 |{kind:"insertHorizontalRule";data:{position:FlowPosition;block:string}}
 |{kind:"deleteHorizontalRule";data:{block:string;replacement:FlowDraft|null}}
 /** Rich V4: insert one page break (fresh block `block`) at a document-root position as one
  * history group; the selection is kept. A non-root position is refused. */
 |{kind:"insertPageBreak";data:{position:FlowPosition;block:string}}
 /** Rich V4: delete one page break as one history group. `paragraph` is a fresh floor used only
  * when nothing else would remain; a node-selected page break recovers like `deleteAtom`. */
 |{kind:"deletePageBreak";data:{block:string;paragraph:string}}
 |{kind:"splitTaskItem";data:{point:RichPoint;newItem:string;right:string;rightHeading:number|null}}
 |{kind:"joinTaskItems";data:{container:string;left:string;right:string}}
 |{kind:"setSelection";selection:RichSelection|null}
 |{kind:"insertPlainText";text:string}
 /** Exactly one LF within text, distinct from paragraph/list Enter. */
 |{kind:"insertHardBreak"}
 |{kind:"insertParagraph";data:{right:string;newItem:string|null}}
 |{kind:"pasteFlowAtText";data:{clipboardJson:string;allocation:ClipboardAllocation;right:string}}
 |{kind:"replaceTextRange";data:{selection:Extract<RichSelection,{kind:"text"}>;text:string}}
 |{kind:"undo"|"redo"|"deleteSelection"}
 |{kind:"setHeading";block:string;level:number|null}
 |{kind:"setPendingFormats";formats:readonly FormatLiteral[]|null}
 |{kind:"insertTable";data:{position:FlowPosition;table:TableDraft}}
 |{kind:"deleteTable";data:{table:string;replacement:FlowDraft|null}}
 |{kind:"insertTableRow";data:{table:string;before:string|null;row:TableRowDraft}}
 |{kind:"deleteTableRow";data:{table:string;row:string}}
 |{kind:"insertTableColumn";data:{table:string;before:string|null;column:TableColumnDraft;cells:readonly {row:string;cell:TableCellDraft}[]}}
 |{kind:"deleteTableColumn";data:{table:string;column:string}}
 |{kind:"moveTableRow";data:{table:string;row:string;before:string|null}}
 /** Move one retained block (never copied or deleted) into `parent` (null = document root) before
  * the direct child `before` (null = append), as one native history group. */
 |{kind:"moveBlock";data:{block:string;parent:string|null;before:string|null}}
 |{kind:"moveTableColumn";data:{table:string;column:string;before:string|null}}
 |{kind:"resizeTableColumn";data:{table:string;column:string;width:number}}
 |{kind:"mergeTableCells";data:{merge:string;replica:string;counter:string;lamport:string}}
 |{kind:"splitTableCell";data:{cell:RichCell}}
 |{kind:"setTableHeader";data:{header:boolean}}
 |{kind:"clearTableCells";data:{emptyBlocks:readonly string[]}}
 |{kind:"navigateGrid";data:{movement:"next"|"previous"|"left"|"right"|"up"|"down"|"rowStart"|"rowEnd"|"tableStart"|"tableEnd";extend:boolean}}
 |{kind:"insertImage";data:{position:FlowPosition;image:ImageDraft}}
 |{kind:"deleteImage";data:{image:string;replacement:FlowDraft|null}}
 |{kind:"replaceImage";data:{image:string;asset:string;generation:string}}
 |{kind:"setImageAlt";data:{image:string;alt:ImageAlt}}
 |{kind:"resizeImage";data:{image:string;size:ImageSize|null}}
 |{kind:"setImageCaption";data:{image:string;caption:TextDraft|null}}
 |{kind:"insertBlocks";data:{position:FlowPosition;blocks:readonly FlowDraft[]}}
 |{kind:"replaceBlocks";data:{first:string;last:string;blocks:readonly FlowDraft[]}}
 |{kind:"wrapList";data:{first:string;last:string;container:string;items:readonly string[];start:number|null}}
 |{kind:"unwrapList";data:{list:string}}
 |{kind:"setListKind";data:{list:string;start:number|null}}
 /** Rich V4 only: one ordered list's marker style, reversal and/or start, one history group. */
 |{kind:"setListNumbering";data:import("./core.js").RichListNumberingPatch}
 /** Rich V4 only: set (a well-formed BCP 47 tag, any letter case; Rust stores the canonical
  * case) or clear (`null`) the language of the native selection; a caret changes pending formats. */
 |{kind:"setTextLanguage";data:{language:string|null}}
 /** Rich V4 only: set, replace or clear (`href:null`) one image's link in one history group.
  * The href must already be canonical (`canonicalImageLinkHref`); a decorative image cannot be linked. */
 |{kind:"setImageLink";data:import("./core.js").RichImageLinkIntent}
 /** Rich V4 only: set, replace or clear (`name:null`) one paragraph/heading/code-block
  * bookmark in one history group. Links are not rewritten (a replaced or cleared name dangles). */
 |{kind:"setBookmark";data:import("./bookmark.js").RichSetBookmarkIntent}
 /** Rich V4 only: rename one bookmark and retarget every internal `#from` link to `#to`,
  * in one history group. */
 |{kind:"renameBookmark";data:import("./bookmark.js").RichRenameBookmarkIntent}
 /** Rich V4 only: replace one text range inside a paragraph or heading (normally the typed
  * `@query` trigger) by one mention plus a plain space, in one history group (one Undo step). */
 |{kind:"insertMention";data:{selection:Extract<RichSelection,{kind:"text"}>;mention:import("./mention.js").RichMention}}
 /** Remove one typed trigger range (a nonempty same-block range in a paragraph, heading or section
  * summary), then run one allowlisted command (`RichTriggerCompositeKind`) against the post-removal
  * document, as ONE native history unit. Requires `supportsTriggerComposite()`. */
 |{kind:"replaceTriggerThen";data:{selection:Extract<RichSelection,{kind:"text"}>;command:RichTriggerCompositeCommand}}
 /** Run 1–64 allowlisted commands (`RichCommandGroupKind`) in order, each against the publication left by the
  * previous ones, as ONE native history unit; any failure publishes nothing. Requires `supportsCommandGroup()`. */
 |{kind:"commandGroup";data:{commands:readonly RichCommandGroupStep[]}}
 |{kind:"indentListItems";data:{container:string;first:string;last:string;nested:{block:string;start:number|null}|null}}
 |{kind:"outdentListItems";data:{container:string;first:string;last:string;tail:string|null}}
 |{kind:"splitTextBlock";data:{point:RichPoint;right:string;rightHeading:number|null}}
 |{kind:"splitListItem";data:{point:RichPoint;newItem:string;right:string;rightHeading:number|null}}
 |{kind:"joinTextBlocks";data:{left:string;right:string}}
 /** `blocks: true` merges the right item as later blocks of the left (multi-block item); text is never joined. */
 |{kind:"joinListItems";data:{container:string;left:string;right:string;blocks?:true}}
 /** Move a later paragraph/heading of an item (and its following flow) into a fresh sibling item. */
 |{kind:"splitListItemBlock";data:{block:string;newItem:string}}
 |{kind:"insertFormattedText";data:{text:string;formatsJson:string}}
 |{kind:"setInlineFormat";data:{change:{kind:"set";formatsJson:string}|{kind:"remove";format:string};targets:readonly {block:string;start:string;end:string}[]}}
 /** Simultaneous changes to unique kinds; one guarded publication/history unit. */
 |{kind:"changeInlineFormats";data:{changes:readonly ({kind:"set";formatsJson:string}|{kind:"remove";format:string}|{kind:"patch";formatsJson:string;properties:readonly string[]})[];targets:readonly {block:string;start:string;end:string}[]}}
 |{kind:"pasteInlineClipboard";data:{clipboardJson:string}}
 |{kind:"pasteFlowClipboard";data:{clipboardJson:string;position:FlowPosition;allocation:ClipboardAllocation}}
 |{kind:"pasteGridClipboard";data:{clipboardJson:string;allocation:ClipboardAllocation}}
 /** Native letter case of the selection (a caret changes its whole block), one history group.
  * Requires `supportsCaseChange()`. See docs/FORMATTING_PRODUCTIVITY.md. */
 |{kind:"changeSelectionCase";data:import("./formatting_productivity.js").RichCaseChangeIntent};
