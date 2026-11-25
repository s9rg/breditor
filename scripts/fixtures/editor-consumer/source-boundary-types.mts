/** Small independent types for the installed application lifecycle and persistence routes. */
import type {
  BreditorBrowserEditor, BreditorBrowserEditorOpenResult, BreditorBrowserEditorOptions,
  openBreditorBrowserEditor,
} from "@breditor/browser";
import type { LocalEditor, LocalEditorOptions, LocalInitial, openLocalEditor } from "@breditor/editor";
import type { mountLocalAutosave } from "@breditor/editor/autosave";
import type { SharedEditorSession, SharedEditorSessionOptions, openSharedEditor } from "@breditor/editor/collaboration";
import type { BreditorSharedEditorHandle, BreditorSharedEditorProps } from "@breditor/editor/collaboration/react";
import type { BreditorEditorHandle } from "@breditor/editor/react";
import type { StaticRenderOptions, renderStaticDocument } from "@breditor/editor/static";

export type Assert<T extends true> = T;
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? (<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false
  : false;

type BrowserOpen = Assert<Equal<typeof openBreditorBrowserEditor,
  (options: BreditorBrowserEditorOptions) => Promise<BreditorBrowserEditorOpenResult>>>;
type BrowserDispose = Assert<Equal<BreditorBrowserEditor["dispose"], () => void>>;
type LocalOpen = Assert<Equal<typeof openLocalEditor, (options: LocalEditorOptions) => Promise<LocalEditor>>>;
type LocalHistoryInitial = Assert<Equal<Extract<LocalInitial, { kind: "checkpoint" | "typingCheckpoint" }>,
  { kind: "checkpoint"; checkpointJson: string } | { kind: "typingCheckpoint"; checkpointJson: string }>>;
type LocalCheckpoint = Assert<Equal<LocalEditor["checkpointJson"], () => string>>;
type LocalAutosaveInput = Assert<Equal<Parameters<Parameters<typeof mountLocalAutosave>[1]["save"]>[0], string>>;
type SharedOpen = Assert<Equal<typeof openSharedEditor,
  (options: SharedEditorSessionOptions) => Promise<SharedEditorSession>>>;
type SharedCheckpoint = Assert<Equal<SharedEditorSession["checkpointJson"], () => string>>;
type SharedClose = Assert<Equal<SharedEditorSession["close"], () => Promise<void>>>;
type LocalReactCheckpoint = Assert<Equal<BreditorEditorHandle["checkpointJson"], () => string | null>>;
type SharedReactCheckpoint = Assert<Equal<BreditorSharedEditorHandle["checkpointJson"], () => string | null>>;
type SharedReactRecoveryRequired = Assert<Equal<{} extends Pick<BreditorSharedEditorProps, "onCloseError"> ? true : false, false>>;
type StaticExport = Assert<Equal<typeof renderStaticDocument, (document: unknown, options?: StaticRenderOptions) => string>>;
