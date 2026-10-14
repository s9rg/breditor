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
 |{kind:"list";block:string;start:number|null;items:readonly {block:string;body:readonly FlowDraft[]}[]}
 |({kind:"image"}&ImageDraft)|({kind:"table"}&TableDraft);
export interface FlowPosition {parent:{kind:"document"}|{kind:"cell";cell:RichCell}|{kind:"listItem";block:string};before:string|null}
/** Use a unique prefix for every authored paste, including failed/undone ones. */
export interface ClipboardAllocation {prefix:string;replica:string;counter:string;lamport:string}
export type RichCommand =
 |{kind:"setSelection";selection:RichSelection|null}
 |{kind:"insertPlainText";text:string}
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
 |{kind:"indentListItems";data:{container:string;first:string;last:string;nested:{block:string;start:number|null}|null}}
 |{kind:"outdentListItems";data:{container:string;first:string;last:string;tail:string|null}}
 |{kind:"splitTextBlock";data:{point:RichPoint;right:string;rightHeading:number|null}}
 |{kind:"splitListItem";data:{point:RichPoint;newItem:string;right:string;rightHeading:number|null}}
 |{kind:"joinTextBlocks";data:{left:string;right:string}}
 |{kind:"joinListItems";data:{container:string;left:string;right:string}}
 |{kind:"insertFormattedText";data:{text:string;formatsJson:string}}
 |{kind:"setInlineFormat";data:{change:{kind:"set";formatsJson:string}|{kind:"remove";format:string};targets:readonly {block:string;start:string;end:string}[]}}
 |{kind:"pasteInlineClipboard";data:{clipboardJson:string}}
 |{kind:"pasteFlowClipboard";data:{clipboardJson:string;position:FlowPosition;allocation:ClipboardAllocation}}
 |{kind:"pasteGridClipboard";data:{clipboardJson:string;allocation:ClipboardAllocation}};
