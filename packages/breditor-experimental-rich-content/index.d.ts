import type {RichCommand} from "./commands.js";
export type {RichCommand,FormatLiteral,ImageAlt,ImageSize,TextDraft,ImageDraft,TableColumnDraft,TableCellDraft,TableRowDraft,TableDraft,FlowDraft,FlowPosition,ClipboardAllocation} from "./commands.js";
/** Initialized generated Wasm module; pass the same instance for all owners using it. */
export interface RichWasmModule {
  readonly BreditorRichProfile: {fromBootstrapJson(input: string): unknown};
}
export type RichCommandOutcome = "content" | "selection" | "typing" | "undo" | "redo" | "unchanged";
export interface RichPoint {block: string; offset: string; affinity: "before" | "after"}
export interface RichCell {table: string; row: string; column: string}
export type RichSelection = {kind: "text"; anchor: RichPoint; focus: RichPoint} | {kind: "node"; block: string} | {kind: "grid"; anchor: RichCell; focus: RichCell};
export interface RichProfileDescriptor {kind: "rich"; abiVersion: 1; schema: {name: string; version: number}; schemaFingerprint: string}
export interface RichView {
  format: "breditor/rich-view"; formatVersion: 1; revision: string; documentJson: string;
  selection: RichSelection | null; pendingFormatsJson: string | null;
  undoDepth: number; redoDepth: number; historyCapacity: number;
  tables: readonly {id: string; hidden: boolean; rows: readonly string[]; columns: readonly {id: string; width: number}[];
    cells: readonly {base: RichCell; master: RichCell; rowSpan: number; columnSpan: number; sources: readonly RichCell[]}[]}[];
}
export interface RichCoreEditor {
  execute(command: string | RichCommand, expectedRevision?: string): RichCommandOutcome;
  view(): RichView;
  documentJson(): string;
  clipboard(): {format:"breditor/rich-clipboard-transfer";formatVersion:1;kind:"text"|"flow"|"grid";structuredJson:string;plainText:string} | null;
  checkpointJson(): string;
  dispose(): void;
}
export interface RichCoreProfile {
  descriptor(): RichProfileDescriptor;
  createEditor(documentJson: string, historyCapacity?: string): RichCoreEditor;
  restoreEditor(checkpointJson: string): RichCoreEditor;
  dispose(): void;
}
export class RichCommandError extends Error {readonly code: string; constructor(code: string, message: string)}
export function compileRichProfile(wasm: RichWasmModule, bootstrapJson: string): RichCoreProfile;
