import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";

import {
  openBreditorBrowserEditor,
  type BreditorBrowserEditor,
  type BreditorBrowserEditorOpenError,
  type BreditorBrowserEditorPersistenceResult,
  type BreditorBrowserEditorPersistenceStatus,
  type BreditorBrowserEditorSnapshot,
} from "@breditor/browser";
import initializeWasm, * as breditorWasm from "@breditor/wasm";

const EMPTY_DOCUMENT_JSON = JSON.stringify({
  format: "breditor/document",
  formatVersion: 1,
  schema: { name: "breditor/base", version: 1 },
  root: {
    kind: "element",
    type: "breditor/document",
    entityId: null,
    properties: {},
    children: [
      {
        kind: "element",
        type: "breditor/paragraph",
        entityId: null,
        properties: {},
        children: [],
      },
    ],
  },
});

let wasmInitialization: Promise<unknown> | undefined;

/**
 * React cannot await an effect cleanup. Bound retirement so a broken storage
 * implementation cannot retain the editor host forever and block a restart.
 */
const RETIREMENT_FLUSH_TIMEOUT_MS = 5_000;
const CONTROLLED_NAVIGATION_FLUSH_TIMEOUT_MS = 15_000;

function ensureWasm(): Promise<unknown> {
  if (wasmInitialization === undefined) {
    const attempt = Promise.resolve().then(() => initializeWasm());
    let recoverable: Promise<unknown>;
    recoverable = attempt.catch((error: unknown) => {
      if (wasmInitialization === recoverable) wasmInitialization = undefined;
      throw error;
    });
    wasmInitialization = recoverable;
  }
  return wasmInitialization;
}

function noSubscription(): () => void {
  return () => {};
}

export interface BreditorEditorProps {
  readonly label: string;
  readonly primaryModifier: "control" | "meta";
}

export type BreditorNavigationFlushOutcome =
  | Readonly<{
      status: "settled";
      result: BreditorBrowserEditorPersistenceResult;
    }>
  | Readonly<{ status: "editor_unavailable" }>
  | Readonly<{ status: "timed_out" }>
  | Readonly<{ status: "unexpected_failure" }>;

/** Commands an application can use before it starts a controlled navigation. */
export interface BreditorEditorHandle {
  /**
   * Flushes the currently published editor without disposing it. Navigate only
   * after inspecting the returned outcome. This cannot protect page teardown.
   */
  flushBeforeNavigation(
    timeoutMs?: number,
  ): Promise<BreditorNavigationFlushOutcome>;
}

interface EditorConfiguration {
  readonly label: string;
  readonly primaryModifier: "control" | "meta";
}

type EditorLifecycle =
  | Readonly<EditorConfiguration & { phase: "starting" }>
  | Readonly<
      EditorConfiguration & {
        phase: "ready";
        editor: BreditorBrowserEditor;
      }
    >
  | Readonly<
      EditorConfiguration & {
        phase: "failed";
        error: BreditorBrowserEditorOpenError;
      }
    >;

function hasConfiguration(
  lifecycle: EditorLifecycle,
  label: string,
  primaryModifier: "control" | "meta",
): boolean {
  return (
    lifecycle.label === label && lifecycle.primaryModifier === primaryModifier
  );
}

type BoundedSettlement<T> =
  | Readonly<{ status: "settled"; value: T }>
  | Readonly<{ status: "timed_out" }>
  | Readonly<{ status: "rejected" }>;

function boundedSettlement<T>(
  operation: PromiseLike<T>,
  timeoutMs: number,
): Promise<BoundedSettlement<T>> {
  return new Promise((resolve) => {
    let complete = false;
    const finish = (outcome: BoundedSettlement<T>): void => {
      if (complete) return;
      complete = true;
      globalThis.clearTimeout(timeout);
      resolve(outcome);
    };
    const timeout = globalThis.setTimeout(
      () => finish(Object.freeze({ status: "timed_out" })),
      timeoutMs,
    );
    Promise.resolve(operation).then(
      (value) => finish(Object.freeze({ status: "settled", value })),
      () => finish(Object.freeze({ status: "rejected" })),
    );
  });
}

function validTimeout(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function setMountsRetiring(
  editorHost: HTMLDivElement,
  toolbarHost: HTMLDivElement,
  retiring: boolean,
): void {
  try {
    editorHost.inert = retiring;
  } catch {
    // A missing platform `inert` implementation cannot break lifecycle cleanup.
  }
  try {
    toolbarHost.inert = retiring;
  } catch {
    // The contenteditable host is still independently quiesced below.
  }
  if (!retiring) return;
  try {
    editorHost.setAttribute("contenteditable", "false");
  } catch {
    // The runtime owns and restores this attribute during eventual disposal.
  }
  try {
    editorHost.blur();
  } catch {
    // Losing focus is defense in depth; `inert` and contenteditable are primary.
  }
}

async function retireEditor(
  editor: BreditorBrowserEditor,
  editorHost: HTMLDivElement,
  toolbarHost: HTMLDivElement,
): Promise<void> {
  setMountsRetiring(editorHost, toolbarHost, true);
  try {
    await boundedSettlement(
      editor.flushPersistence(),
      RETIREMENT_FLUSH_TIMEOUT_MS,
    );
  } catch {
    // Includes a hostile thenable or unexpected synchronous implementation bug.
  } finally {
    try {
      editor.dispose();
    } catch {
      // Retirement must settle so a replacement is never blocked indefinitely.
    }
  }
}

function persistenceMessage(
  persistence: BreditorBrowserEditorPersistenceStatus,
): string {
  switch (persistence.phase) {
    case "disabled":
      return "Autosave is off.";
    case "idle":
      return "All changes saved.";
    case "scheduled":
      return "Unsaved changes; save scheduled.";
    case "saving":
      return "Saving changes…";
    case "paused":
      return "Autosave paused; changes are not saved.";
    case "disposed":
      return persistence.dirty
        ? "Persistence stopped with unsaved changes."
        : "Persistence stopped.";
  }
}

/**
 * React owns only the two empty mounts and surrounding status UI. Breditor
 * exclusively owns every child installed beneath the editor and toolbar refs.
 */
export const BreditorEditor = forwardRef<
  BreditorEditorHandle,
  BreditorEditorProps
>(function BreditorEditor(
  { label, primaryModifier }: BreditorEditorProps,
  ref,
): ReactElement {
  const [editorHost, setEditorHost] = useState<HTMLDivElement | null>(null);
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const [lifecycle, setLifecycle] = useState<EditorLifecycle>(() => ({
    phase: "starting",
    label,
    primaryModifier,
  }));
  const generation = useRef(0);
  const activeEditor = useRef<BreditorBrowserEditor | undefined>(undefined);
  const ownershipLane = useRef<Promise<void>>(Promise.resolve());

  useImperativeHandle(
    ref,
    () => ({
      async flushBeforeNavigation(
        timeoutMs = CONTROLLED_NAVIGATION_FLUSH_TIMEOUT_MS,
      ): Promise<BreditorNavigationFlushOutcome> {
        const editor = activeEditor.current;
        if (editor === undefined) {
          return Object.freeze({ status: "editor_unavailable" });
        }
        if (!validTimeout(timeoutMs)) {
          return Object.freeze({ status: "unexpected_failure" });
        }
        try {
          // A faulted editor can still have a valid committed Rust revision that
          // persistence should capture. Only a disposed owner is unavailable.
          if (editor.getStatus().phase === "disposed") {
            return Object.freeze({ status: "editor_unavailable" });
          }
          const outcome = await boundedSettlement(
            editor.flushPersistence(),
            timeoutMs,
          );
          if (outcome.status === "timed_out") {
            return Object.freeze({ status: "timed_out" });
          }
          if (outcome.status === "rejected") {
            return Object.freeze({ status: "unexpected_failure" });
          }
          return Object.freeze({
            status: "settled",
            result: outcome.value,
          });
        } catch {
          return Object.freeze({ status: "unexpected_failure" });
        }
      },
    }),
    [],
  );

  useEffect(() => {
    if (editorHost === null || toolbarHost === null) return;
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    const abort = new AbortController();
    let owned: BreditorBrowserEditor | undefined;

    setLifecycle({ phase: "starting", label, primaryModifier });

    const opening = ownershipLane.current.then(async () => {
      try {
        await ensureWasm();
        if (abort.signal.aborted || generation.current !== currentGeneration) {
          return;
        }
        setMountsRetiring(editorHost, toolbarHost, false);
        const result = await openBreditorBrowserEditor({
          host: editorHost,
          label,
          wasm: breditorWasm,
          initialDocument: {
            lineageId: "breditor-react-reference",
            documentJson: EMPTY_DOCUMENT_JSON,
            historyCapacity: 100,
          },
          keyboard: {
            editing: "beforeinputPrimary",
            primaryModifier,
            shortcuts: "enabled",
          },
          toolbar: { host: toolbarHost },
          persistence: {
            indexedDB: window.indexedDB,
            crypto: window.crypto.subtle,
          },
          signal: abort.signal,
        });
        if (!result.ok) {
          if (
            !abort.signal.aborted &&
            generation.current === currentGeneration
          ) {
            setLifecycle({
              phase: "failed",
              label,
              primaryModifier,
              error: result.error,
            });
          }
          return;
        }
        if (abort.signal.aborted || generation.current !== currentGeneration) {
          await retireEditor(result.editor, editorHost, toolbarHost);
          return;
        }
        owned = result.editor;
        activeEditor.current = owned;
        setLifecycle({
          phase: "ready",
          label,
          primaryModifier,
          editor: owned,
        });
        owned.focus();
      } catch {
        if (owned !== undefined) {
          const retiring = owned;
          // Clear local ownership before the first await so a React cleanup
          // cannot observe and enqueue a second retirement for this editor.
          owned = undefined;
          if (activeEditor.current === retiring)
            activeEditor.current = undefined;
          await retireEditor(retiring, editorHost, toolbarHost);
        }
        if (!abort.signal.aborted && generation.current === currentGeneration) {
          setLifecycle({
            phase: "failed",
            label,
            primaryModifier,
            error: {
              code: "browser_editor.setup_failed",
              message: "The Breditor example could not start the editor.",
            },
          });
        }
      }
    });
    // Both branches settle the lane. No rejected lifecycle promise is ever left
    // unobserved, and every later configuration queues behind this one.
    ownershipLane.current = opening.then(
      () => undefined,
      () => undefined,
    );

    return () => {
      abort.abort();
      if (generation.current === currentGeneration) generation.current += 1;
      const retiring = owned;
      if (retiring !== undefined) {
        if (activeEditor.current === retiring) activeEditor.current = undefined;
        setMountsRetiring(editorHost, toolbarHost, true);
        const retirement = ownershipLane.current.then(() =>
          retireEditor(retiring, editorHost, toolbarHost),
        );
        ownershipLane.current = retirement.then(
          () => undefined,
          () => undefined,
        );
      }
      owned = undefined;
    };
  }, [editorHost, label, primaryModifier, toolbarHost]);

  const currentLifecycle = hasConfiguration(lifecycle, label, primaryModifier)
    ? lifecycle
    : undefined;
  const editor =
    currentLifecycle?.phase === "ready" ? currentLifecycle.editor : undefined;
  const openError =
    currentLifecycle?.phase === "failed" ? currentLifecycle.error : undefined;

  const subscribe = useCallback(
    (listener: () => void) => editor?.subscribe(listener) ?? noSubscription(),
    [editor],
  );
  const getSnapshot = useCallback(
    (): BreditorBrowserEditorSnapshot | undefined => editor?.getSnapshot(),
    [editor],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return (
    <section
      className="editor-shell"
      aria-busy={currentLifecycle?.phase !== "failed" && editor === undefined}
    >
      <div className="toolbar-mount" ref={setToolbarHost} />
      <div className="editor-mount" ref={setEditorHost} />
      <p className="editor-status" role="status">
        {openError !== undefined
          ? openError.message
          : snapshot === undefined
            ? "Starting editor…"
            : snapshot.status.phase === "live"
              ? persistenceMessage(snapshot.persistence)
              : `Editor state: ${snapshot.status.phase}`}
      </p>
    </section>
  );
});
