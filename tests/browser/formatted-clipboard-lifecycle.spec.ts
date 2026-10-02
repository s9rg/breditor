import { expect, test } from "@playwright/test";

test("formatted clipboard, Link history, and immediate caret moves preserve one warm owner", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__breditorHarness?.phase === "ready" || window.__breditorStartupError !== undefined);
  expect(await page.evaluate(() => window.__breditorStartupError)).toBeUndefined();

  const completed = await page.evaluate(async () => {
    const harness = window.__breditorHarness!;
    const fixture = await harness.mountReferenceFormatting(false, "https://example.test/reference");
    const root = document.querySelector(`[data-breditor-reference-formatting-probe="${fixture.probeId}"]`)!;
    const host = root.querySelector<HTMLElement>("[contenteditable]")!;
    const nextTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
    const click = (name: string) => {
      const button = [...root.querySelectorAll<HTMLButtonElement>("button")]
        .find(candidate => candidate.textContent === name || candidate.getAttribute("aria-label") === name);
      if (!button) throw new Error(`missing ${name} control`);
      button.focus();
      button.click();
    };
    const assertLive = (text: string) => {
      if (harness.referenceFormattingSnapshot(fixture.probeId).status.phase !== "live") throw new Error("owner faulted");
      if (host.textContent !== text) throw new Error("document text differs");
    };
    const select = (anchor: number, focus: number) => {
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      const leaves: Text[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) leaves.push(node as Text);
      const locate = (offset: number): [Text, number] => {
        for (const leaf of leaves) {
          if (offset <= leaf.length) return [leaf, offset];
          offset -= leaf.length;
        }
        throw new Error("selection exceeds text");
      };
      const selection = window.getSelection();
      if (!selection) throw new Error("native selection unavailable");
      host.focus();
      selection.setBaseAndExtent(...locate(anchor), ...locate(focus));
      document.dispatchEvent(new Event("selectionchange"));
    };
    const clipboard = (operation: "copy" | "cut") => {
      // Controlled events only: do not read or replace the user's OS clipboard.
      const transfer = new DataTransfer();
      const event = new ClipboardEvent(operation, { bubbles: true, composed: true, cancelable: true, clipboardData: transfer });
      host.dispatchEvent(event);
      if (!event.defaultPrevented) throw new Error(`${operation} was not handled`);
      return (event.clipboardData ?? transfer).getData("text/plain");
    };
    const input = (inputType: string, data: string | null = null) => {
      const event = new InputEvent("beforeinput", { bubbles: true, composed: true, cancelable: true, inputType, data });
      host.dispatchEvent(event);
      if (!event.defaultPrevented) throw new Error(`${inputType} was not handled`);
    };
    const facts = () => {
      const selection = window.getSelection();
      const endpoint = (node: Node | null | undefined, offset: number | undefined) => ({
        type: node?.nodeType, connected: node?.isConnected, owned: node ? host.contains(node) : false, offset,
      });
      return { count: selection?.rangeCount, anchor: endpoint(selection?.anchorNode, selection?.anchorOffset), focus: endpoint(selection?.focusNode, selection?.focusOffset) };
    };
    click("Link");
    const url = root.querySelector<HTMLInputElement>('input[type="text"]')!;
    let priorHref = "https://example.test/reference";
    let stage = "initial";
    let cycle = 0;
    try {
      for (; cycle < 60; cycle++) {
        stage = "Link apply";
        select(0, fixture.text.length);
        const href = `https://example.test/cycle/${cycle}`;
        url.focus(); url.value = href;
        url.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
        click("Apply Link");
        assertLive(fixture.text);
        if (host.querySelector("a")?.getAttribute("href") !== href) throw new Error("Link apply differs");
        stage = "Link undo/redo";
        click("Undo");
        if (host.querySelector("a")?.getAttribute("href") !== priorHref) throw new Error("Link undo differs");
        click("Redo");
        if (host.querySelector("a")?.getAttribute("href") !== href) throw new Error("Link redo differs");
        const beforeCut = harness.referenceFormattingDocument(fixture.probeId);
        stage = "copy/cut";
        select(cycle % 2 === 0 ? 0 : 5, cycle % 2 === 0 ? 5 : 0);
        if (clipboard("copy") !== fixture.text.slice(0, 5)) throw new Error("copy differs");
        if (harness.referenceFormattingDocument(fixture.probeId) !== beforeCut) throw new Error("copy mutated document");
        if (clipboard("cut") !== fixture.text.slice(0, 5)) throw new Error("cut differs");
        const remaining = fixture.text.slice(5);
        assertLive(remaining);
        stage = "immediate caret";
        select(remaining.length, remaining.length);
        if (cycle % 3 !== 0) {
          if (cycle % 3 === 2) await nextTask();
          input("deleteByCut");
          host.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteByCut" }));
          assertLive(remaining);
        }
        stage = "typing";
        input("insertText", "!");
        assertLive(`${remaining}!`);
        stage = "history after cut/caret";
        for (const [name, text] of [
          ["Undo", remaining], ["Undo", fixture.text],
          ["Redo", remaining], ["Redo", `${remaining}!`],
          ["Undo", remaining], ["Undo", fixture.text],
        ] as const) { click(name); assertLive(text); }
        if (harness.referenceFormattingDocument(fixture.probeId) !== beforeCut) throw new Error("history lost canonical formatting");
        if (host.querySelector("mark")?.textContent !== fixture.text) throw new Error("Highlight was lost");
        priorHref = href;
        await nextTask();
      }
      stage = "retained redo checkpoint";
      const checkpoint = harness.referenceFormattingBackup(fixture.probeId);
      if (await harness.restoreReferenceFormattingBackup(checkpoint) !== checkpoint) throw new Error("checkpoint restore differs");
      click("Redo"); assertLive(fixture.text.slice(5));
      click("Redo"); assertLive(`${fixture.text.slice(5)}!`);
    } catch (error) {
      throw new Error(`formatted clipboard cycle=${cycle} stage=${stage} status=${JSON.stringify(harness.referenceFormattingSnapshot(fixture.probeId).status)} selection=${JSON.stringify(facts())}: ${String(error)}`);
    }
    harness.cleanupReferenceFormatting(fixture.probeId);
    // Opt-in diagnostic hook observes the local count before Playwright
    // transports it; the original numeric return and assertion remain intact.
    (window as unknown as { breditorTraceLoopResult?: (value: number) => void })
      .breditorTraceLoopResult?.(cycle);
    return cycle;
  });
  expect(completed).toBe(60);
});
