import {
 BreditorSessionCheckpointAutosave,
 type SessionCheckpointAutosaveFlushResult,
 type SessionCheckpointAutosaveOptions,
 type SessionCheckpointAutosaveStatus,
 type SessionCheckpointAutosaveStatusObserver,
} from "@breditor/browser/autosave";
import type {RichWritingToolsHost} from "../writing_tools_host.js";
import type {RichDocumentView,RichView} from "../core.js";
import type {RichLocalSessionStore} from "./local_session_store.js";

type Publication = Pick<RichWritingToolsHost, "surface" | "writingState" | "subscribeWriting">;
export type RichLocalAutosaveHost = {checkpointJson(): string; view(): Pick<RichView | RichDocumentView,"format">} &
 (Publication | {writing(): Publication});

export interface RichLocalAutosave {
 getStatus(): SessionCheckpointAutosaveStatus;
 observeStatus(observer: SessionCheckpointAutosaveStatusObserver): () => void;
 flush(): Promise<SessionCheckpointAutosaveFlushResult>;
 retry(): Promise<SessionCheckpointAutosaveFlushResult>;
 dispose(): void;
}

const editors = new WeakSet<HTMLElement>();
const stores = new WeakSet<Pick<RichLocalSessionStore, "save">>();
const encoder = new TextEncoder();

/** Borrow one local editor and its exclusive checkpoint destination. */
export function mountRichLocalAutosave(
 editor: RichLocalAutosaveHost,
 store: Pick<RichLocalSessionStore, "save">,
 options: SessionCheckpointAutosaveOptions = {},
): RichLocalAutosave {
 const publication = "writing" in editor ? editor.writing() : editor;
 const initial = publication.writingState();
 if (initial.closed) throw new Error("Use an open local editor for autosave");
 const format = editor.view().format;
 if (format !== "breditor/rich-view" && format !== "breditor/rich-document-view") {
  throw new Error("Local autosave requires a local rich checkpoint owner");
 }
 if (editors.has(publication.surface) || stores.has(store)) {
  throw new Error("Local autosave is already mounted on this editor or store");
 }

 const autosave = new BreditorSessionCheckpointAutosave(
  {
   read() {
    const current = publication.writingState();
    if (current.closed) return {ok: false};
    if (current.busy || current.composing) return undefined;
    const checkpointJson = editor.checkpointJson();
    return {ok: true, checkpoint: {checkpointJson, checkpointUtf8Bytes: encoder.encode(checkpointJson).byteLength}};
   },
  },
  {
   async save(_token: undefined, checkpointJson: string) {
    await store.save(checkpointJson);
    return {ok: true, token: undefined};
   },
  },
  undefined,
  options,
 );

 let revision = initial.revision;
 let disposed = false;
 const unsubscribe = publication.subscribeWriting(() => {
  const current = publication.writingState();
  if (current.closed) {
   dispose();
   return;
  }
  if (current.revision === revision) return;
  revision = current.revision;
  autosave.markDirty();
 });
 function dispose(): void {
  if (disposed) return;
  disposed = true;
  unsubscribe();
  autosave.dispose();
  editors.delete(publication.surface);
  stores.delete(store);
 }

 editors.add(publication.surface);
 stores.add(store);
 autosave.markDirty();
 return {
  getStatus: () => autosave.getStatus(),
  observeStatus: observer => autosave.observeStatus(observer),
  flush: () => autosave.flush(),
  retry: () => autosave.retry(),
  dispose,
 };
}

export type {
 SessionCheckpointAutosaveFlushResult as RichLocalAutosaveFlushResult,
 SessionCheckpointAutosaveOptions as RichLocalAutosaveOptions,
 SessionCheckpointAutosaveStatus as RichLocalAutosaveStatus,
} from "@breditor/browser/autosave";
