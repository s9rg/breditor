import type { BreditorBrowserEditorSnapshot } from "@breditor/browser";

/** Test-only evidence recorder. Never accepts clipboard, document, or input data. */
export const MANUAL_EVENT_LIMIT = 256;
export const MANUAL_CHECKS = ["copy", "cut", "paste", "caret", "history", "formatting"] as const;
export type ManualCheck = typeof MANUAL_CHECKS[number];
export type ManualEventKind = "copy" | "cut" | "paste" | "beforeinput" | "input" | "compositionstart" | "compositionend";
type OwnerFacts = {
  phase: BreditorBrowserEditorSnapshot["status"]["phase"] | "starting" | "startupFailed";
  reason: string | null;
  revision: string | null;
};
type EventFacts = {
  sequence: number;
  kind: ManualEventKind;
  trusted: boolean;
  inputType: string | null;
  defaultPrevented: boolean;
  settled: boolean;
  before: OwnerFacts;
  after: OwnerFacts | null;
};

const INPUT_TYPES = new Set([
  "insertText", "insertCompositionText", "insertFromComposition", "insertFromPaste",
  "insertFromPasteAsQuotation", "deleteByCut", "deleteContentBackward",
  "deleteContentForward", "insertParagraph", "insertLineBreak", "historyUndo", "historyRedo",
]);

export class ManualClipboardRecorder {
  #owner: OwnerFacts = { phase: "starting", reason: null, revision: null };
  #fault: OwnerFacts | null = null;
  #events: EventFacts[] = [];
  #sequence = 0;
  #pending = 0;
  #dropped = 0;
  #trusted = { copy: 0, cut: 0, paste: 0 };
  #checks = new Set<ManualCheck>();

  /** Only public owner status/revision is retained; no snapshot object survives. */
  observe(snapshot: Pick<BreditorBrowserEditorSnapshot, "status" | "document">): void {
    const status = snapshot.status;
    this.#owner = {
      phase: status.phase,
      reason: status.phase === "faulted" ? status.reason : null,
      revision: snapshot.document.revision,
    };
    if (status.phase === "faulted") this.#fault ??= { ...this.#owner };
  }

  startupFailed(): void {
    this.#owner = { phase: "startupFailed", reason: null, revision: null };
    this.#fault ??= { ...this.#owner };
  }

  confirm(check: ManualCheck, checked: boolean): void {
    if (checked) this.#checks.add(check);
    else this.#checks.delete(check);
  }

  /** Capture order now; settlement updates the same record after handlers run. */
  begin(kind: ManualEventKind, trusted: boolean, inputType: string | null): number {
    const sequence = ++this.#sequence;
    this.#pending++;
    if (trusted && (kind === "copy" || kind === "cut" || kind === "paste")) this.#trusted[kind]++;
    if (this.#events.length === MANUAL_EVENT_LIMIT) {
      this.#events.shift();
      this.#dropped++;
    }
    this.#events.push({
      sequence, kind, trusted,
      inputType: inputType === null ? null : INPUT_TYPES.has(inputType) ? inputType : "other",
      defaultPrevented: false, settled: false, before: { ...this.#owner }, after: null,
    });
    return sequence;
  }

  /** The caller settles each begun event once, including records evicted by the cap. */
  settle(sequence: number, defaultPrevented: boolean): void {
    this.#pending--;
    const record = this.#events.find(event => event.sequence === sequence);
    if (record) {
      record.defaultPrevented = defaultPrevented;
      record.settled = true;
      record.after = { ...this.#owner };
    }
  }

  report() {
    const complete = MANUAL_CHECKS.every(check => this.#checks.has(check))
      && Object.values(this.#trusted).every(count => count > 0);
    const outcome = this.#fault !== null ? "fault-observed"
      : this.#dropped > 0 ? "truncated"
      : this.#owner.phase !== "live" || this.#pending > 0 || !complete ? "incomplete"
      : "operator-confirmed";
    return {
      format: "breditor/manual-clipboard-evidence", formatVersion: 1,
      outcome,
      qualification: "Not automatic certification. Trusted events can also originate from browser automation; checklist observations are self-reported.",
      owner: { ...this.#owner }, firstFault: this.#fault === null ? null : { ...this.#fault },
      observedEvents: this.#sequence, pendingEvents: this.#pending, droppedEvents: this.#dropped,
      trustedClipboardEvents: { ...this.#trusted },
      operatorChecks: Object.fromEntries(MANUAL_CHECKS.map(check => [check, this.#checks.has(check)])),
      events: this.#events.map(event => ({
        ...event, before: { ...event.before }, after: event.after === null ? null : { ...event.after },
      })),
    };
  }
}
