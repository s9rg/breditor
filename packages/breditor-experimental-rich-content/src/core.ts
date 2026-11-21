import type {RichCommand} from "./commands.js";
import type {RichWritingToolsRead} from "./writing_tools_types.js";
export type {RichWritingToolsRead,RichWritingCounts,RichWritingHeading} from "./writing_tools_types.js";
import type {RichRetainedAssetReferencesRead} from "./retained_asset_references_types.js";
export type {RichRetainedAssetReferencesRead,RichRetainedAssetReference} from "./retained_asset_references_types.js";
export type {RichCommand,RichTriggerCompositeKind,RichTriggerCompositeCommand,RichCommandGroupKind,RichCommandGroupStep,RichSelectionFormatChange,FormatLiteral,ImageAlt,ImageSize,TextDraft,ImageDraft,TableColumnDraft,TableCellDraft,TableRowDraft,TableDraft,FlowDraft,FlowPosition,ClipboardAllocation} from "./commands.js";
/** Initialized generated Wasm module; pass the same instance for all owners using it. */
export interface RichWasmModule {
  readonly BreditorRichProfile: {fromBootstrapJson(input: string): unknown;fromStandardBootstrapJsonV1?(input:string):unknown;fromStructuralBootstrapJsonV2?(input:string):unknown;fromStandardStructuralBootstrapJsonV2?(input:string):unknown;fromLayoutBootstrapJsonV3?(input:string):unknown;fromStandardLayoutBootstrapJsonV3?(input:string):unknown;fromBootstrapJsonV4?(input:string):unknown;fromStandardBootstrapJsonV4?(input:string):unknown};
}
export type RichCommandOutcome = "content" | "selection" | "typing" | "undo" | "redo" | "unchanged";
export interface RichPoint {block: string; offset: string; affinity: "before" | "after"}
export interface RichCell {table: string; row: string; column: string}
export type RichSelection = {kind: "text"; anchor: RichPoint; focus: RichPoint} | {kind: "node"; block: string} | {kind: "grid"; anchor: RichCell; focus: RichCell};
export type RichSelectionPolicy="original"|"document-v1";
export type RichHistoryPolicy="explicit"|"typing-v1";
/** Refused means literal input committed; report separately and never retry it. */
export type RichInputRuleOutcome="unchanged"|"inserted"|"applied"|"refused";
/** Explicitly selected native input-rule policies; never a saved document setting. */
export type RichInputRuleId="markdown-v1"|"autolink-v1"|"typography-v1";
/** Quote preset, or a custom pair of single non-ASCII scalars with optional inner no-break spacing. */
export type RichTypographyQuotes="english"|"german"|"french"|"swiss"|"polish"|{readonly double:readonly [string,string];readonly single:readonly [string,string];readonly space?:"nbsp"|"narrow-nbsp"};
/** `typography-v1` selection: `include` (groups or rule names) replaces the default groups, `exclude` removes. */
export interface RichTypographyOptions {readonly include?:readonly string[];readonly exclude?:readonly string[];readonly quotes?:RichTypographyQuotes}
/** Explicit native matching intent; never a persisted editor command. */
export interface RichSearchQuery {pattern:string;mode:"literal"|"regex";caseSensitive:boolean;wholeWords:boolean}
export interface RichSearchReplacement {text:string;mode:"literal"|"captures"}
/** Read-only metadata is not an edit/navigation credential; retain the opaque result object. */
export interface RichSearchMetadata {
 readonly format:"breditor/rich-search-results";readonly formatVersion:1;
 readonly schema:Readonly<{name:string;version:number;fingerprint:string}>;readonly document:string;
 readonly count:string;readonly captureCount:string;
 readonly matches:readonly Readonly<{block:string;start:string;end:string}>[];
}
/** Independently disposable native read. Frozen metadata remains readable after disposal. */
export interface RichSearchResults {
 metadata():RichSearchMetadata;
 navigate(active:string|null,direction:"next"|"previous",wrap:boolean):string|null;
 dispose():void;
}
/** Pure schema-admitted source content. This carries no destination allocation or edit authority. */
export interface RichClipboardTransfer {format:"breditor/rich-clipboard-transfer";formatVersion:1;kind:"text"|"flow"|"grid";structuredJson:string;plainText:string}
export type RichDocumentSelection=RichSelection|Readonly<{kind:"document"}>;
export interface RichProfileDescriptor {kind: "rich"; abiVersion: 1; schema: {name: string; version: number}; schemaFingerprint: string;richLanguageVersion?:2|3|4;taskStructureVersion?:1;blockLayoutVersion?:1;listNumberingVersion?:1;textLanguageVersion?:1;imageLinkVersion?:1;detailsVersion?:1;mentionVersion?:1;tableCaptionVersion?:1;pageBreakVersion?:1;bookmarkVersion?:1}
/** Closed native intent. Omission keeps, null clears; bounds are enforced in Rust. */
export interface RichBlockLayoutPatch {alignment?:"start"|"center"|"end"|"justify"|"left"|"right"|null;direction?:"ltr"|"rtl"|"auto"|null;indent?:number|null;lineHeightPercent?:number|null}
/** Closed rich V4 ordered-list marker families (CSS `list-style-type` keywords). */
export type RichListNumberStyle="decimal"|"lower-alpha"|"upper-alpha"|"lower-roman"|"upper-roman";
/** One ordered list's numbering intent. Omission keeps; a null style clears it; `reversed:false`
 * removes reversal; `start` sets the explicit first ordinal. At least one change is required. */
export interface RichListNumberingPatch {list:string;style?:RichListNumberStyle|null;reversed?:boolean;start?:number}
/** Rich V4 image link of one image. `href` is a canonical absolute HTTP(S) URL (see
 * `canonicalImageLinkHref`), or `null` to remove the link; `newWindow` is only allowed with an href. */
export type RichImageLinkIntent={image:string;href:string;newWindow?:boolean}|{image:string;href:null};
export type RichLayoutFieldState<T>={kind:"unavailable"}|{kind:"mixed"}|{kind:"uniform";value:T|null};
export interface RichBlockLayoutStateRead {
 format:"breditor/rich-block-layout-state";formatVersion:1;schema:{name:string;version:number;fingerprint:string};blocks:string;
 alignment:RichLayoutFieldState<NonNullable<RichBlockLayoutPatch["alignment"]>>;direction:RichLayoutFieldState<NonNullable<RichBlockLayoutPatch["direction"]>>;
 indent:RichLayoutFieldState<number>;lineHeightPercent:RichLayoutFieldState<number>;
}
/** Exact Rust-derived property state; all-present mixed values remain active. */
export type RichInlineFormatState = {kind:"unavailable"}|{kind:"unset"}|{kind:"uniform";format:import("./commands.js").FormatLiteral}|{kind:"mixed";presentEverywhere:boolean};
/** Read binding only, never a compiled proof or a mutation observation token. */
export interface RichInlineFormatStateRead {format:"breditor/rich-inline-format-state";formatVersion:1;schema:{name:string;version:number;fingerprint:string};formatKind:string;state:RichInlineFormatState}
/** Distinct coverage-aware state; the original node/grid-unavailable family is not widened. */
export interface RichSelectionFormatStateRead extends Omit<RichInlineFormatStateRead,"format"> {format:"breditor/rich-selection-format-state"}
export type RichCoverageDomain={kind:"document"}|{kind:"cell";table:string;row:string;column:string}|{kind:"caption";image:string};
/** Native explicit conversion read; host reporting is separate from the guarded content edit. */
export interface RichClipboardTextProjection {format:"breditor/rich-clipboard-text-projection";formatVersion:1;target:"caption"|"code";text:string;losses:readonly ("block-structure"|"inline-formatting"|"block-properties"|"table-geometry"|"embedded-content")[]}
/** Immutable native read only. No offsets, IDs or read bindings grant mutation authority. */
export interface RichSelectionCoverageRead {
 format:"breditor/rich-selection-coverage";formatVersion:1;schema:{name:string;version:number;fingerprint:string};document:string;
 scope:"none"|"document"|"text"|"node"|"grid";backward:boolean|null;selectedUtf16:string;
 nodes:readonly {block:string;parent:string|null;kind:string;extent:"whole"|"partial";domain:RichCoverageDomain;hiddenTable:boolean}[];
 text:readonly {block:string;kind:string;start:string;end:string;domain:RichCoverageDomain}[];
}
export interface RichView {
  format: "breditor/rich-view"; formatVersion: 1; revision: string; documentJson: string;
  /** Omitted means the original editable default. This live host policy is not document permission. */
  readOnly?:true;
  /** Last live host-policy publication; omitted until changed, never a durable permission. */
  readOnlyRevision?:string;
  /** Explicit native grouping; omitted preserves original per-dispatch history. */
  historyGrouping?:"typing-v1";
  /** Explicit shared semantic replay family; omitted retains the original range contract. */
  rangeEditing?:"general-v1";
  /** Original retained steps, not grouped Undo units. Present only in typing mode. */
  historyStepCount?:number;
  selection: RichSelection | null; pendingFormatsJson: string | null;
  undoDepth: number; redoDepth: number; historyCapacity: number;
  grid: {cells:readonly RichCell[];masters:readonly RichCell[]}|null;
  tables: readonly {id: string; hidden: boolean; rows: readonly string[]; columns: readonly {id: string; width: number}[];
    cells: readonly {base: RichCell; master: RichCell; rowSpan: number; columnSpan: number; sources: readonly RichCell[]}[]}[];
}
/** Separate extended read family; original rich views remain closed text/node/grid DTOs. */
export interface RichDocumentView extends Omit<RichView,"format"|"selection"> {format:"breditor/rich-document-view";selection:RichDocumentSelection|null}
export type RichEditorView<P extends RichSelectionPolicy="original">=P extends "document-v1"?RichDocumentView:RichView;
export interface RichCoreEditor<P extends RichSelectionPolicy="original"> {
  /** Native-only owner history, not complete-room closure or asset deletion authority. */
  supportsRetainedAssetReferences?():boolean;
  retainedAssetReferences?(expectedRevision?:string):RichRetainedAssetReferencesRead;
  /** Reject foreign/copied/stale reads before using an asynchronously captured inventory. */
  checkRetainedAssetReferences?(read:RichRetainedAssetReferencesRead,expectedRevision?:string):void;
  /** Native document-level prompt eligibility; independent of counts and saved settings. */
  supportsPlaceholder?():boolean;
  placeholderEmpty?(expectedRevision?:string):boolean;
  /** Complete optional native accepted-document counts and outline; no JS fallback. */
  supportsWritingTools?():boolean;
  writingTools?(expectedRevision?:string):RichWritingToolsRead;
  /** Both exclusive native calls must be present; no JS matching or older-runtime fallback. */
  supportsMarkdownInputRules?():boolean;
  /** Browser routing has a separate minimum runtime; programmatic version1 stays exact. */
  supportsMarkdownInputRouting?():boolean;
  insertPlainTextWithMarkdownRules?(text:string,namespace:string,expectedRevision?:string):RichInputRuleOutcome;
  insertTypingTextWithMarkdownRules?(text:string,clockMs:string,namespace:string,expectedRevision?:string):RichInputRuleOutcome;
  /** Version1 rule-set calls (`markdown-v1`, `autolink-v1`) and the Enter autolink split; no JS matching. */
  supportsInputRuleSets?():boolean;
  insertPlainTextWithInputRules?(text:string,rules:readonly RichInputRuleId[],namespace:string,expectedRevision?:string,typography?:RichTypographyOptions):RichInputRuleOutcome;
  insertTypingTextWithInputRules?(text:string,clockMs:string,rules:readonly RichInputRuleId[],namespace:string,expectedRevision?:string,typography?:RichTypographyOptions):RichInputRuleOutcome;
  /** Version1 `typography-v1` acceptance (and its optional `typography` request) in the rule-set calls. */
  supportsTypographyInputRules?():boolean;
  /** The `insertParagraph` record at a collapsed caret, then `autolink-v1` on the retained left block. */
  insertParagraphWithAutolink?(data:{readonly right:string;readonly newItem:string|null},expectedRevision?:string):RichInputRuleOutcome;
  /** Complete optional Rust capability; absent/older runtimes never fall back to DOM matching. */
  supportsSearch?():boolean;
  findText?(query:RichSearchQuery,expectedRevision?:string):RichSearchResults;
  checkSearchResults?(results:RichSearchResults,expectedRevision?:string):void;
  selectSearchMatch?(results:RichSearchResults,index:string,expectedRevision?:string):RichCommandOutcome;
  replaceSearchOne?(results:RichSearchResults,index:string,replacement:RichSearchReplacement,expectedRevision?:string):RichCommandOutcome;
  replaceSearchAll?(results:RichSearchResults,replacement:RichSearchReplacement,expectedRevision?:string):RichCommandOutcome;
  /** Separate optional parser/export bridge; old owners remain usable without this capability. */
  supportsClipboardInterchange?():boolean;
  admitClipboardRoot?(kind:"text"|"flow"|"grid",rootJson:string):RichClipboardTransfer;
  validateClipboard?(clipboardJson:string):RichClipboardTransfer;
  selectionPolicy?():P;
  supportsDocumentSelection?():boolean;
  /** Read-only grammar revision, not mutation authority. Legacy owners may omit it. */
  richLanguageVersion?():1|2|3|4;
  supportsStandardInlineControls?():boolean;
  supportsInlinePropertyPatches?():boolean;
  supportsReadOnly?():boolean;
  supportsTypingHistory?():boolean;
  /** Exact additive native code-exit command; an older owner may omit it. */
  supportsCodeExit?():boolean;
  /** Native logical movement and explicit text recovery beside atoms; no JS planning fallback. */
  supportsFlowNavigation?():boolean;
  /** Separate native whole-atom deletion/plain/first-key replacement capability. */
  supportsAtomEditing?():boolean;
  /** Additive closed general-range commands; an older module must not be silently substituted. */
  supportsGeneralRanges?():boolean;
  /** Strict native inline clipboard paste over a general target, independent of older range capability. */
  supportsGeneralInlinePaste?():boolean;
  /** Atomic native rich-flow paste at a general text range with a retained prose start. */
  supportsGeneralFlowPaste?():boolean;
  /** Native paragraph/list/task Enter over a general prose selection. */
  supportsGeneralParagraph?():boolean;
  /** Pure native general Copy, preserving partial table shape without unselected content. */
  supportsGeneralCopy?():boolean;
  generalClipboard?():ReturnType<RichCoreEditor["clipboard"]>;
  supportsClipboardTextPolicy?():boolean;
  projectClipboardText?(selection:Extract<RichSelection,{kind:"text"}>,clipboardJson:string,revision?:string):RichClipboardTextProjection|null;
  supportsSelectionFormatting?():boolean;
  supportsBlockLayout?():boolean;
  blockLayoutState?():RichBlockLayoutStateRead;
  /** Rich V4 ordered-list numbering; an older owner may omit it. */
  supportsListNumbering?():boolean;
  /** Rich V4 text-run language metadata; an older owner may omit it. */
  supportsTextLanguage?():boolean;
  /** Native `changeSelectionCase` (UPPER, lower, Title Case, cycle) in every rich language. */
  supportsCaseChange?():boolean;
  /** Rich V4 image links; an older owner may omit it. */
  supportsImageLinks?():boolean;
  /** Rich V4 collapsible sections; an older owner may omit it. */
  supportsDetails?():boolean;
  /** Rich V4 mention entities (`insertMention`); an older owner may omit it. */
  supportsMentions?():boolean;
  /** The owner's profile includes the opt-in ruby V1 extension (`breditor-ruby/ruby`); any rich language. */
  supportsRubyAnnotations?():boolean;
  /** Native `replaceTriggerThen` (slash commands as one Undo step); an older owner may omit it. */
  supportsTriggerComposite?():boolean;
  /** Native `commandGroup` (several commands as one Undo step); an older owner may omit it. */
  supportsCommandGroup?():boolean;
  /** Rich V4 table captions (`addTableCaption`, `removeTableCaption`); an older owner may omit it. */
  supportsTableCaptions?():boolean;
  /** Rich V4 root-level page breaks (`insertPageBreak`, `deletePageBreak`); an older owner may omit it. */
  supportsPageBreaks?():boolean;
  /** Rich V4 bookmarks and internal links (`setBookmark`, `renameBookmark`); an older owner may omit it. */
  supportsBookmarks?():boolean;
  /** Rich V4: exact bookmark/internal-link inventory, including dangling links, of the current snapshot. */
  bookmarkIndex?():import("./bookmark.js").RichBookmarkIndex;
  selectionCoverage?(scope?:"selection"|"document"):RichSelectionCoverageRead;
  selectionFormatState?(kind:string):RichSelectionFormatStateRead;
  enableTypingHistory?(expectedRevision?:string):boolean;
  closeTypingGroup?(expectedRevision?:string):boolean;
  setReadOnly?(value:boolean,expectedRevision?:string):boolean;
  caretFormats?():readonly import("./commands.js").FormatLiteral[];
  execute(command: string | RichCommand, expectedRevision?: string): RichCommandOutcome;
  view(): RichEditorView<P>;
  documentJson(): string;
  inlineFormatState(kind:string):RichInlineFormatStateRead;
  clipboard(): {format:"breditor/rich-clipboard-transfer";formatVersion:1;kind:"text"|"flow"|"grid";structuredJson:string;plainText:string} | null;
  checkpointJson(): string;
  dispose(): void;
}
/** Named explicit facade; no old command or checkpoint getter is reinterpreted. */
export interface RichDocumentCoreEditor extends RichCoreEditor<"document-v1"> {
  selectionPolicy():"document-v1";
  supportsDocumentSelection():boolean;
  /** Separate optional native capability; older document-selection owners remain usable. */
  supportsDocumentClipboard():boolean;
  supportsDocumentNavigation():boolean;
  /** Native outer reading-order start/end, without inventing text endpoints in no-text documents. */
  collapseDocumentSelection(side:"before"|"after",expectedRevision?:string):RichCommandOutcome;
  selectDocument(expectedRevision?:string):RichCommandOutcome;
  copyDocument():ReturnType<RichCoreEditor["clipboard"]>;
  replaceDocumentPlainText(paragraph:string,text:string,expectedRevision?:string):RichCommandOutcome;
  replaceDocumentTypingText(paragraph:string,text:string,clockMs:string,expectedRevision?:string):RichCommandOutcome;
  /** Prefix must be permanently reserved, including failed and undone attempts. */
  pasteDocumentClipboard(clipboardJson:string,prefix:string,expectedRevision?:string):RichCommandOutcome;
}
export interface RichCoreProfile {
  /** Check optional prompt policy before creating/recovering an owner. */
  supportsPlaceholder?():boolean;
  descriptor(): RichProfileDescriptor;
  inlineCatalogJson(): string;
  createEditor(documentJson: string, historyCapacity?: string): RichCoreEditor;
  restoreEditor(checkpointJson: string): RichCoreEditor;
  supportsTypingHistory?():boolean;
  restoreTypingEditor?(checkpointJson:string):RichCoreEditor;
  supportsDocumentSelection?():boolean;
  createDocumentEditor?(documentJson:string,historyCapacity?:string):RichDocumentCoreEditor;
  restoreDocumentEditor?(checkpointJson:string):RichDocumentCoreEditor;
  restoreDocumentTypingEditor?(checkpointJson:string):RichDocumentCoreEditor;
  /** Explicit old-family replay followed by new-family observation/save routing; not an AST import. */
  restoreOriginalAsDocumentEditor?(checkpointJson:string,history?:RichHistoryPolicy):RichDocumentCoreEditor;
  dispose(): void;
}
