import { expect, test } from "@playwright/test";

// These are controlled DOM event schedules, not OS clipboard automation. Keep
// the system clipboard untouched while testing the optional native echo paths.
const schedules = ["none", "paired", "delayed", "inputOnly", "staleAfterCaret"] as const;

for (const schedule of schedules) {
  test(`clipboard ${schedule} echoes preserve exactly-once history and caret liveness`, async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() =>
      window.__breditorHarness?.phase === "ready" || window.__breditorStartupError !== undefined,
    );
    expect(await page.evaluate(() => window.__breditorStartupError)).toBeUndefined();

    await page.evaluate(async (schedule) => {
      const harness = window.__breditorHarness!;
      const host = document.getElementById("editor")!;
      const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
      const assertLive = () => {
        if (harness.snapshot().status.phase !== "live") throw new Error("owner is not live");
      };
      const selectionFacts = () => {
        try {
          const selection = window.getSelection();
          const point = (node: Node | null, offset: number | undefined) => ({
            nodeType: node?.nodeType, connected: node?.isConnected,
            owned: node !== null && host.contains(node), offset,
          });
          const range = selection?.rangeCount === 1 ? selection.getRangeAt(0) : null;
          return {
            rangeCount: selection?.rangeCount,
            anchor: point(selection?.anchorNode ?? null, selection?.anchorOffset),
            focus: point(selection?.focusNode ?? null, selection?.focusOffset),
            start: point(range?.startContainer ?? null, range?.startOffset),
            end: point(range?.endContainer ?? null, range?.endOffset),
          };
        } catch { return { unreadable: true }; }
      };
      const clipboard = (operation: "copy" | "cut" | "paste", plainText?: string) => {
        const transfer = new DataTransfer();
        const event = new ClipboardEvent(operation, {
          bubbles: true, cancelable: true, composed: true, clipboardData: transfer,
        });
        const data = event.clipboardData ?? transfer;
        if (plainText !== undefined) {
          data.setData("text/plain", plainText);
          data.setData("text/html", "<strong>not the authoritative representation</strong>");
        }
        host.dispatchEvent(event);
        if (!event.defaultPrevented) throw new Error(`${operation} was not canceled`);
        return data.getData("text/plain");
      };
      const echoes = async (operation: "cut" | "paste") => {
        if (schedule === "none") return;
        const inputType = operation === "cut" ? "deleteByCut" : "insertFromPaste";
        if (schedule === "delayed") await nextTask();
        const before = JSON.stringify(harness.snapshot().document);
        if (schedule !== "inputOnly") {
          const event = new InputEvent("beforeinput", {
            bubbles: true, cancelable: true, composed: true, inputType,
          });
          host.dispatchEvent(event);
          if (!event.defaultPrevented) throw new Error("clipboard echo was not canceled");
        }
        if (schedule === "delayed") await nextTask();
        host.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType }));
        if (JSON.stringify(harness.snapshot().document) !== before) {
          throw new Error("clipboard echo changed the document frontier");
        }
        assertLive();
      };
      const history = (label: "Undo" | "Redo", expected: string) => {
        const button = Array.from(document.querySelectorAll<HTMLButtonElement>("#toolbar button"))
          .find((button) => button.textContent === label || button.getAttribute("aria-label") === label);
        if (button === undefined) throw new Error("history control is missing");
        button.click();
        if (harness.text() !== expected) throw new Error(`${label} content mismatch`);
        assertLive();
      };

      for (let cycle = 0; cycle < 12; cycle += 1) {
        let stage = "reset";
        try {
          await harness.select(0, harness.text().length);
          if (!harness.beforeInput("insertText", "Hello 🙂 world")) throw new Error("reset rejected");
          stage = "select and copy";
          await harness.select(cycle % 2 === 0 ? 0 : 5, cycle % 2 === 0 ? 5 : 0);
          const beforeCopy = JSON.stringify(harness.snapshot().document);
          if (clipboard("copy") !== "Hello") throw new Error("copy content mismatch");
          if (JSON.stringify(harness.snapshot().document) !== beforeCopy) throw new Error("copy mutated document");
          stage = "cut";
          if (clipboard("cut") !== "Hello" || harness.text() !== " 🙂 world") throw new Error("cut content mismatch");
          if (schedule !== "staleAfterCaret") await echoes("cut");
          stage = "caret";
          await harness.select(9, 9);
          if (schedule === "staleAfterCaret") {
            await echoes("cut");
            if (harness.selection().anchorOffset !== 9 || harness.selection().focusOffset !== 9) throw new Error("stale cut echo moved caret");
          }
          stage = "paste";
          clipboard("paste", "!");
          if (harness.text() !== " 🙂 world!") throw new Error("paste content mismatch");
          if (schedule === "staleAfterCaret") await harness.select(0, 0);
          await echoes("paste");
          if (schedule === "staleAfterCaret" &&
            (harness.selection().anchorOffset !== 0 || harness.selection().focusOffset !== 0)) throw new Error("stale paste echo moved caret");
          stage = "history";
          history("Undo", " 🙂 world");
          history("Undo", "Hello 🙂 world");
          history("Redo", " 🙂 world");
          history("Redo", " 🙂 world!");
          stage = "continued typing";
          await harness.select(10, 10);
          if (!harness.beforeInput("insertText", "?")) throw new Error("typing rejected");
          if (harness.text() !== " 🙂 world!?") throw new Error("typing content mismatch");
          assertLive();
        } catch (error) {
          // Structural endpoints distinguish native incoherence from an owner
          // fault without retaining DOM text, markup, or clipboard payloads.
          throw new Error(`clipboard cycle=${cycle} stage=${stage} status=${JSON.stringify(harness.snapshot().status)} selection=${JSON.stringify(selectionFacts())}: ${String(error)}`);
        }
      }
    }, schedule);
  });
}
