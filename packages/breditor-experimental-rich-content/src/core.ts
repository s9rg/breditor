import type {RichCommand} from "./commands.js";
export type {RichCommand,RichSelectionFormatChange,FormatLiteral,ImageAlt,ImageSize,TextDraft,ImageDraft,TableColumnDraft,TableCellDraft,TableRowDraft,TableDraft,FlowDraft,FlowPosition,ClipboardAllocation} from "./commands.js";
/** Initialized generated Wasm module; pass the same instance for all owners using it. */
export interface RichWasmModule {
  readonly BreditorRichProfile: {fromBootstrapJson(input: string): unknown;fromStandardBootstrapJsonV1?(input:string):unknown;fromStructuralBootstrapJsonV2?(input:string):unknown;fromStandardStructuralBootstrapJsonV2?(input:string):unknown;fromLayoutBootstrapJsonV3?(input:string):unknown;fromStandardLayoutBootstrapJsonV3?(input:string):unknown};
}
export type RichCommandOutcome = "content" | "selection" | "typing" | "undo" | "redo" | "unchanged";
export interface RichPoint {block: string; offset: string; affinity: "before" | "after"}
export interface RichCell {table: string; row: string; column: string}
export type RichSelection = {kind: "text"; anchor: RichPoint; focus: RichPoint} | {kind: "node"; block: string} | {kind: "grid"; anchor: RichCell; focus: RichCell};
export interface RichProfileDescriptor {kind: "rich"; abiVersion: 1; schema: {name: string; version: number}; schemaFingerprint: string;richLanguageVersion?:2|3;taskStructureVersion?:1;blockLayoutVersion?:1}
/** Closed native intent. Omission keeps, null clears; bounds are enforced in Rust. */
export interface RichBlockLayoutPatch {alignment?:"start"|"center"|"end"|"justify"|"left"|"right"|null;direction?:"ltr"|"rtl"|"auto"|null;indent?:number|null;lineHeightPercent?:number|null}
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
export interface RichCoreEditor {
  /** Read-only grammar revision, not mutation authority. Legacy owners may omit it. */
  richLanguageVersion?():1|2|3;
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
  supportsSelectionFormatting?():boolean;
  supportsBlockLayout?():boolean;
  blockLayoutState?():RichBlockLayoutStateRead;
  selectionCoverage?(scope?:"selection"|"document"):RichSelectionCoverageRead;
  selectionFormatState?(kind:string):RichSelectionFormatStateRead;
  enableTypingHistory?(expectedRevision?:string):boolean;
  closeTypingGroup?(expectedRevision?:string):boolean;
  setReadOnly?(value:boolean,expectedRevision?:string):boolean;
  caretFormats?():readonly import("./commands.js").FormatLiteral[];
  execute(command: string | RichCommand, expectedRevision?: string): RichCommandOutcome;
  view(): RichView;
  documentJson(): string;
  inlineFormatState(kind:string):RichInlineFormatStateRead;
  clipboard(): {format:"breditor/rich-clipboard-transfer";formatVersion:1;kind:"text"|"flow"|"grid";structuredJson:string;plainText:string} | null;
  checkpointJson(): string;
  dispose(): void;
}
export interface RichCoreProfile {
  descriptor(): RichProfileDescriptor;
  inlineCatalogJson(): string;
  createEditor(documentJson: string, historyCapacity?: string): RichCoreEditor;
  restoreEditor(checkpointJson: string): RichCoreEditor;
  supportsTypingHistory?():boolean;
  restoreTypingEditor?(checkpointJson:string):RichCoreEditor;
  dispose(): void;
}
