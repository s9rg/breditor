/**
 * Real Rust/DOM clipboard boundary oracle, serialized into a Playwright page.
 * All helpers are local so this function has no runtime closure dependencies.
 * Controlled events never read or replace the operating-system clipboard.
 */
export async function clipboardBoundaryProbe(options: {
  scenario: "crossParagraph" | "crossParagraphHtml" | "boundaryOnly" | "rejectedPaste";
  backward: boolean;
}): Promise<void> {
  const harness = window.__breditorHarness!;
  const host = document.querySelector<HTMLElement>("#editor")!;
  const seed = ["Left🙂", "", "Right e\u0301 & <tag>", "尾"];
  let stage = "setup";
  let failedCheck = "unexpected exception";
  const assert = (condition: boolean, message: string) => {
    if (!condition) {
      failedCheck = message;
      throw new Error(message);
    }
  };
  const live = () => assert(harness.snapshot().status.phase === "live", "owner faulted");
  const exported = (format: "plainText" | "documentJson") => {
    const result = harness.exportContent(format);
    if (!result.ok) throw new Error("public export failed");
    return result.value;
  };
  const revision = () => BigInt(harness.snapshot().document.revision);
  const paragraphs = (expected: readonly string[]) => {
    live();
    assert(exported("plainText") === expected.join("\n"), "semantic paragraph text differs");
    assert(JSON.stringify([...host.querySelectorAll("p")].map(node => node.textContent)) === JSON.stringify(expected), "rendered paragraph structure differs");
  };
  const click = (name: "Bold" | "Undo" | "Redo") => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("#toolbar button")]
      .find(candidate => candidate.textContent === name || candidate.getAttribute("aria-label") === name);
    if (!button || button.getAttribute("aria-disabled") !== "false") throw new Error(`${name} is unavailable`);
    button.click();
    live();
  };
  const redoEnabled = () => document.querySelector('#toolbar button[aria-label="Redo"]')?.getAttribute("aria-disabled") === "false"
    || [...document.querySelectorAll("#toolbar button")].some(button => button.textContent === "Redo" && button.getAttribute("aria-disabled") === "false");
  const select = async (start: readonly [number, number], end: readonly [number, number], backward = options.backward) => {
    const point = ([paragraph, offset]: readonly [number, number]): readonly [Node, number] => {
      const block = host.querySelectorAll("p")[paragraph];
      if (!block) throw new Error("selection paragraph absent");
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      for (let leaf = walker.nextNode(); leaf; leaf = walker.nextNode()) {
        const length = leaf.textContent!.length;
        if (offset <= length) return [leaf, offset];
        offset -= length;
      }
      if (offset === 0 && block.textContent === "") return [block, 0];
      throw new Error("selection offset exceeds paragraph");
    };
    host.focus();
    const anchor = point(backward ? end : start);
    const focus = point(backward ? start : end);
    window.getSelection()!.setBaseAndExtent(...anchor, ...focus);
    document.dispatchEvent(new Event("selectionchange"));
    // Include the engine's own queued native selectionchange, not just our hint.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    live();
  };
  const clipboard = (kind: "copy" | "cut" | "paste", payload: Readonly<Record<string, string>> = {}) => {
    const transfer = new DataTransfer();
    const event = new ClipboardEvent(kind, { clipboardData: transfer, bubbles: true, composed: true, cancelable: true });
    // Firefox may construct a distinct event-owned transfer.
    const data = event.clipboardData ?? transfer;
    for (const [type, text] of Object.entries(payload)) data.setData(type, text);
    host.dispatchEvent(event);
    assert(event.defaultPrevented, `${kind} was not canceled`);
    live();
    return { plain: data.getData("text/plain"), html: data.getData("text/html") };
  };
  const echoes = (kind: "cut" | "paste") => {
    const before = revision();
    const inputType = kind === "cut" ? "deleteByCut" : "insertFromPaste";
    const event = new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true });
    host.dispatchEvent(event);
    assert(event.defaultPrevented, "echo was not canceled");
    host.dispatchEvent(new InputEvent("input", { inputType, bubbles: true }));
    assert(revision() === before, "echo advanced document revision");
    live();
  };
  try {
    await harness.select(0, 0);
    clipboard("paste", { "text/plain": seed.join("\n") });
    paragraphs(seed);
    await select([0, 0], [0, 4], false);
    click("Bold");
    const beforeSecondBold = exported("documentJson");
    await select([2, 0], [2, 5], false);
    click("Bold");
    const original = exported("documentJson");

    if (options.scenario === "rejectedPaste") {
      stage = "prepare retained redo";
      await select([3, 1], [3, 1]);
      assert(harness.beforeInput("insertText", "!"), "typing was not canceled");
      paragraphs([seed[0]!, "", seed[2]!, "尾!"]);
      const edited = exported("documentJson");
      click("Undo");
      assert(exported("documentJson") === original, "initial undo differs");
      const invalidPayloads: Readonly<Record<string, string>>[] = [
        { "text/plain": "", "text/html": "<p>must not fall back</p>" },
        { "text/plain": "\ud800", "text/html": "<p>must not fall back</p>" },
        { "text/plain": "\udc00" },
        { "text/plain": "a".repeat(65_537) },
        { "text/plain": "🙂".repeat(16_385) },
        { "text/plain": "\n".repeat(10_000) },
        { "text/plain": "\r".repeat(10_000) },
        { "text/plain": "\r\n".repeat(10_000) },
        { "text/html": '<p onclick="bad()">blocked</p>' },
        { "text/html": "<script>bad()</script>" },
        { "application/x-breditor-test": "unsupported" },
      ];
      for (const [index, payload] of invalidPayloads.entries()) {
        stage = `reject payload ${index}`;
        await select([0, 4], [2, 8]);
        const before = revision();
        clipboard("paste", payload);
        assert(revision() === before, "rejected paste advanced revision");
        assert(exported("documentJson") === original, "rejected paste changed canonical content");
        assert(redoEnabled(), "rejected paste discarded redo");
      }
      stage = "replay retained redo";
      click("Redo");
      assert(exported("documentJson") === edited, "redo after rejection differs");
      click("Undo");
      assert(exported("documentJson") === original, "undo after rejection differs");
      await select([0, 4], [2, 8]);
      stage = "preferred plain paste branches history";
      clipboard("paste", { "text/plain": "OK", "text/html": '<script>not authoritative</script>' });
      paragraphs(["LeftOK & <tag>", "尾"]);
      assert(!redoEnabled(), "successful replacement retained stale redo branch");
      click("Undo");
      assert(exported("documentJson") === original, "replacement undo lost formatting");
      return;
    }

    const boundaryOnly = options.scenario === "boundaryOnly";
    const start = [0, boundaryOnly ? 6 : 4] as const;
    const end = boundaryOnly ? [1, 0] as const : [2, 8] as const;
    const copiedText = boundaryOnly ? "\n" : "🙂\n\nRight e\u0301";
    const copiedHtml = boundaryOnly ? "<p><br></p><p><br></p>"
      : "<p>🙂</p><p><br></p><p><strong>Right</strong> e\u0301</p>";
    const cutText = boundaryOnly ? [seed[0]!, seed[2]!, seed[3]!] : ["Left & <tag>", "尾"];
    stage = "copy escaped mixed formatting";
    await select([2, 0], [2, seed[2]!.length]);
    const escaped = clipboard("copy");
    assert(escaped.plain === seed[2] && escaped.html === "<p><strong>Right</strong> e\u0301 &amp; &lt;tag&gt;</p>", "mixed-format escaping differs");
    assert(exported("documentJson") === original, "mixed-format copy mutated document");
    stage = "copy selected structure";
    await select(start, end);
    const beforeCopy = revision();
    const copy = clipboard("copy");
    assert(copy.plain === copiedText && copy.html === copiedHtml, "copy representations differ");
    assert(revision() === beforeCopy && exported("documentJson") === original, "copy mutated document");
    stage = "cut selected structure";
    const beforeCut = revision();
    const cut = clipboard("cut");
    assert(cut.plain === copiedText && cut.html === copiedHtml, "cut representations differ");
    assert(revision() === beforeCut + 1n, "cut did not commit exactly once");
    echoes("cut");
    paragraphs(cutText);
    const afterCut = exported("documentJson");
    stage = "cut history round trip";
    click("Undo");
    assert(exported("documentJson") === original, "cut undo lost canonical formatting");
    click("Redo");
    assert(exported("documentJson") === afterCut, "cut redo differs");
    click("Undo");
    assert(exported("documentJson") === original, "second cut undo differs");

    stage = "multiline replacement";
    await select(start, end);
    const beforePaste = revision();
    // Both CRLF and bare CR normalize in Rust; HTML fallback decodes entities
    // and discards source formatting rather than importing DOM markup.
    const replacement = boundaryOnly ? "\r\n" : "Q🙂\r\n\r終e\u0301";
    clipboard("paste", options.scenario === "crossParagraphHtml"
      ? { "text/html": "<p><strong>Q🙂</strong></p><p><br></p><p>終e&#769;</p>" }
      : { "text/plain": replacement, "text/html": "<p>not authoritative</p>" });
    assert(revision() === beforePaste + 1n, "paste did not commit exactly once");
    echoes("paste");
    const pastedText = boundaryOnly ? seed : ["LeftQ🙂", "", "終e\u0301 & <tag>", "尾"];
    paragraphs(pastedText);
    if (!boundaryOnly) {
      assert(host.querySelectorAll("strong").length === 1 && host.querySelector("strong")?.textContent === "Left", "paste retained source formatting or damaged retained prefix");
    }
    const afterPaste = exported("documentJson");
    if (boundaryOnly) {
      // Identical replacement is selection-only: no content-history entry,
      // and the redo branch from the preceding cut/Undo is still valid.
      assert(afterPaste === original, "identical replacement changed content");
      assert(redoEnabled(), "selection-only paste discarded redo");
    }
    stage = "typing at restored paste caret";
    assert(harness.beforeInput("insertText", "!"), "post-paste typing was not canceled");
    paragraphs(boundaryOnly ? [seed[0]!, "!", seed[2]!, seed[3]!] : ["LeftQ🙂", "", "終e\u0301! & <tag>", "尾"]);
    const afterTyping = exported("documentJson");
    assert(!redoEnabled(), "typing retained stale redo branch");
    stage = "replacement and typing history: undo typing";
    click("Undo");
    assert(exported("documentJson") === afterPaste, "typing coalesced with paste");
    stage = "replacement and typing history: undo replacement";
    click("Undo");
    assert(exported("documentJson") === (boundaryOnly ? beforeSecondBold : original), "second undo reached wrong content-history entry");
    stage = "replacement and typing history: redo replacement";
    click("Redo");
    assert(exported("documentJson") === afterPaste, "paste redo differs");
    stage = "replacement and typing history: redo typing";
    click("Redo");
    assert(exported("documentJson") === afterTyping, "typing redo differs");
  } catch {
    // Keep exception text payload-free, including malformed/oversized inputs.
    throw new Error(`clipboard boundary scenario=${options.scenario} backward=${options.backward} stage=${stage} check=${failedCheck} status=${JSON.stringify(harness.snapshot().status)} revision=${harness.snapshot().document.revision}`);
  }
}
