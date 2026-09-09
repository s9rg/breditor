import { useId, useState, type FormEvent, type ReactElement } from "react";

import {
  type BreditorBrowserEditor,
  type BreditorBrowserEditorSnapshot,
  type BreditorBrowserIntentResult,
  type BrowserActionStateEntry,
} from "@breditor/browser";
import {
  MAX_REFERENCE_LINK_HREF_UTF8,
  REFERENCE_FORMATTING_IDS,
  createReferenceLinkRemoveInputJson,
  createReferenceLinkSetInputJson,
} from "@breditor/reference-highlight";

export interface LinkControlsProps {
  readonly editor: BreditorBrowserEditor | undefined;
  readonly snapshot: BreditorBrowserEditorSnapshot | undefined;
}

type LinkOperation = "apply" | "remove";

function linkActionState(
  snapshot: BreditorBrowserEditorSnapshot | undefined,
): BrowserActionStateEntry | undefined {
  if (snapshot?.actionState.status !== "fresh") return undefined;
  return snapshot.actions?.entries.find(
    (entry) => entry.id === REFERENCE_FORMATTING_IDS.linkPresenceStateId,
  );
}

function intentFeedback(
  operation: LinkOperation,
  result: BreditorBrowserIntentResult,
): string {
  const noun = operation === "apply" ? "Link" : "Link removal";
  switch (result.status) {
    case "committed":
      return operation === "apply" ? "Link applied." : "Link removed.";
    case "blocked":
      return `${noun} blocked (${result.reasonCode}).`;
    case "unhandled":
      return `${noun} was not handled.`;
    case "rejected":
      return `${noun} rejected (${result.reason}).`;
    case "failed":
      return `${noun} failed.`;
  }
}

/**
 * React-owned typed Link controls beside the runtime-owned declarative toolbar.
 *
 * `executeIntentJson` deliberately runs while focus remains in this form. The
 * browser runtime uses its Rust-owned semantic selection, so opening or using
 * the form never requires reconstructing a range from a missing DOM selection.
 */
export function LinkControls({
  editor,
  snapshot,
}: LinkControlsProps): ReactElement {
  const urlId = useId();
  const newWindowId = useId();
  const stateId = useId();
  const feedbackId = useId();
  const [href, setHref] = useState("");
  const [openInNewWindow, setOpenInNewWindow] = useState(false);
  const [feedback, setFeedback] = useState<string | undefined>(undefined);

  const state = linkActionState(snapshot);
  const stateIsResolved =
    state?.availability === "enabled" ||
    ((state?.availability === "blocked" ||
      state?.availability === "disabled") &&
      state.activation === "inactive" &&
      state.reasonCode === "breditor/inline-format-unchanged");
  const controlsReady =
    editor !== undefined &&
    snapshot?.status.phase === "live" &&
    stateIsResolved;
  const activation = state?.activation;
  const removeEnabled =
    controlsReady &&
    state.availability === "enabled" &&
    (activation === "active" || activation === "mixed");
  const stateMessage =
    !controlsReady
      ? "Link controls are unavailable for the current selection."
      : activation === "active"
        ? "Link formatting is active on the selection."
        : activation === "mixed"
          ? "Link formatting is mixed across the selection."
          : "Link formatting is inactive on the selection.";

  const execute = (
    operation: LinkOperation,
    createInputJson: () => string,
  ): void => {
    if (
      !controlsReady ||
      editor === undefined ||
      (operation === "remove" && !removeEnabled)
    ) return;
    try {
      const inputJson = createInputJson();
      const result = editor.executeIntentJson(
        REFERENCE_FORMATTING_IDS.linkIntentId,
        inputJson,
      );
      setFeedback(intentFeedback(operation, result));
    } catch {
      // Neither an input payload nor a thrown implementation message crosses
      // this application boundary.
      setFeedback(
        operation === "apply" ? "Link rejected." : "Link removal rejected.",
      );
    }
  };

  const applyLink = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    execute("apply", () =>
      createReferenceLinkSetInputJson(href, openInNewWindow),
    );
  };

  return (
    <form
      className="link-controls"
      aria-label="Link formatting"
      onSubmit={applyLink}
    >
      <div className="link-controls__url">
        <label htmlFor={urlId}>Link URL</label>
        <input
          id={urlId}
          type="url"
          inputMode="url"
          autoComplete="url"
          maxLength={MAX_REFERENCE_LINK_HREF_UTF8}
          placeholder="https://example.com"
          value={href}
          required
          disabled={!controlsReady}
          aria-label="Link URL"
          aria-describedby={`${stateId} ${feedbackId}`}
          onChange={(event) => {
            setHref(event.currentTarget.value);
            setFeedback(undefined);
          }}
        />
      </div>
      <label className="link-controls__checkbox" htmlFor={newWindowId}>
        <input
          id={newWindowId}
          type="checkbox"
          checked={openInNewWindow}
          disabled={!controlsReady}
          aria-label="Open in new window"
          onChange={(event) => {
            setOpenInNewWindow(event.currentTarget.checked);
            setFeedback(undefined);
          }}
        />
        Open in new window
      </label>
      <div className="link-controls__actions">
        <button
          type="submit"
          disabled={!controlsReady || href.trim().length === 0}
        >
          Apply Link
        </button>
        <button
          type="button"
          disabled={!removeEnabled}
          onClick={() =>
            execute("remove", createReferenceLinkRemoveInputJson)
          }
        >
          Remove Link
        </button>
      </div>
      <p id={stateId} className="link-controls__state">
        {stateMessage}
      </p>
      <p
        id={feedbackId}
        className="link-controls__feedback"
        aria-live="polite"
        aria-atomic="true"
      >
        {feedback ?? ""}
      </p>
    </form>
  );
}
