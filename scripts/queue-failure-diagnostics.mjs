// Disposable synthetic-fixture diagnosis only. Never modify installed packages
// or production logging. Retain normal terminal queue semantics after logging.
import assert from "node:assert/strict";

/** Diagnostic comparison trials; no retries or overrides of computed results. */
export function instrumentParagraphComparison(code, headingComparison = "strict") {
  assert.ok(["strict", "same-value", "same-value-minimal"].includes(headingComparison), "unknown heading comparison variant");
  const start = "export function paragraphsEqual(left, right) {";
  assert.equal(code.split(start).length, 2, "paragraph comparator start changed");
  const from = code.indexOf(start), end = code.indexOf("\n}", from);
  assert.ok(end > from);
  let body = code.slice(from, end);
  if (headingComparison === "same-value-minimal") {
    const expression = "left.headingLevel !== right.headingLevel";
    assert.equal(body.split(expression).length, 2, "heading comparison changed");
    return code.slice(0, from) + body.replace(expression, "!Object.is(left.headingLevel, right.headingLevel)") + code.slice(end);
  }
  for (const [name, expression] of [
    ["heading", "left.headingLevel !== right.headingLevel"],
    ["runCount", "left.runs.length !== right.runs.length"],
    ["leftAbsent", "leftRun === undefined"],
    ["rightAbsent", "rightRun === undefined"],
    ["text", "leftRun.text !== rightRun.text"],
    ["strong", "leftRun.strong !== rightRun.strong"],
    ["formats", "!formatDetailsEqual(leftRun.formatDetails, rightRun.formatDetails)"],
  ]) {
    assert.equal(body.split(expression).length, 2, `paragraph comparison changed: ${name}`);
    const captured = name === "heading"
      ? headingComparison === "same-value"
        ? "!Object.is((headingLeft = left.headingLevel), (headingRight = right.headingLevel))"
        : "(headingLeft = left.headingLevel) !== (headingRight = right.headingLevel)" : expression;
    body = body.replace(expression, `paragraphComparisonDiagnostic(${JSON.stringify(name)}, ${captured})`);
  }
  body = body.replace(start, start + `
    let headingLeft, headingRight;
    const paragraphComparisonDiagnostic = (operand, mismatch) => {
        if (mismatch) {
            try { console.error("breditor paragraph comparison mismatch", JSON.stringify({operand, left, right,
                capturedHeading: {leftType: typeof headingLeft, rightType: typeof headingRight,
                    left: headingLeft, right: headingRight, sameValue: Object.is(headingLeft, headingRight)}}).slice(0, 4096)); } catch {}
        }
        return mismatch;
    };`);
  return code.slice(0, from) + body + code.slice(end);
}

// Preserve the validator's bounded failure code before the adapter replaces it
// with its generic exception. Synthetic disposable bundles only.
export function instrumentProjectionUpdateFailures(code) {
  const anchor = 'throw new TypeError("Wasm projection update is invalid");';
  assert.equal(code.split(anchor).length, 2, "projection-update diagnostic site changed");
  return code.replace(anchor, `try { console.error("breditor projection update rejection", JSON.stringify(converted.error).slice(0, 2048)); } catch {}\n${anchor}`);
}

/** Label existing rejection expressions without changing their returned value. */
export function instrumentProjectionValidationSites(code, moduleName) {
  assert.ok(["wasm_projection_adapter", "flat_list_projection_update", "nested_list_projection_update"].includes(moduleName));
  code = instrumentProjectionCaughtErrors(code, moduleName);
  let sites = 0;
  const transformed = code.replace(/projectionFailure\("(projection\.[a-z_]+)"\)/gu, (expression, errorCode, offset) => {
    // These are default result placeholders, not taken rejection branches.
    if (/let result\s*=\s*$/u.test(code.slice(Math.max(0, offset - 40), offset))) return expression;
    sites++;
    const line = code.slice(0, offset).split("\n").length;
    const label = JSON.stringify(`${moduleName}:${line}:${errorCode}`);
    return `((() => { try { console.error("breditor projection rejection site", ${label}); } catch {} })(), ${expression})`;
  });
  assert.ok(sites > 0, "projection rejection expressions changed");
  if (moduleName === "wasm_projection_adapter" && transformed.includes("const plannedBlock = layout?.textBlocks[paragraphOrdinal];")) {
    return instrumentParagraphShapeOperands(transformed);
  }
  if (!["flat_list_projection_update", "nested_list_projection_update"].includes(moduleName)) return transformed;
  // Capture already-owned JS snapshots only after an equality rejection. Never
  // reread a Wasm handle, retry validation, or change the rejected result.
  const family = moduleName === "nested_list_projection_update" ? "nested" : "flat";
  const comparator = family === "nested" ? "nestedListRootsEqual" : "flatListRootsEqual";
  const anchor = `if (a === undefined || b === undefined || !${comparator}(a, b))\n            return false;`;
  if (!transformed.includes("function verifyImpact(")) return transformed;
  assert.equal(transformed.split(anchor).length, 2, `${family} impact retain diagnostic site changed`);
  const withSnapshots = transformed.replace(anchor, `if (a === undefined || b === undefined || !${comparator}(a, b)) {
            try {
                const before = JSON.stringify(a) ?? "undefined", after = JSON.stringify(b) ?? "undefined";
                let offset = 0;
                while (offset < before.length && offset < after.length && before[offset] === after[offset]) offset++;
                console.error("breditor ${family} impact mismatch", JSON.stringify({oldIndex, newIndex, impact: input,
                    beforeLength: before.length, afterLength: after.length, offset,
                    before: before.slice(Math.max(0, offset - 256), offset + 1024),
                    after: after.slice(Math.max(0, offset - 256), offset + 1024)}).slice(0, 4096));
            } catch {}
            return false;
        }`);
  if (withSnapshots.includes("export function flatListRootsEqual(a, b)")) return instrumentFlatRootComparison(withSnapshots);
  return withSnapshots.includes("export function nestedListRootsEqual(a, b)")
    ? instrumentNestedRootComparison(withSnapshots) : withSnapshots;
}

/** Diagnostic-only labels for already-evaluated nested comparison operands. */
export function instrumentNestedRootComparison(code) {
  const start = "export function nestedListRootsEqual(a, b) {";
  assert.equal(code.split(start).length, 2, "nested comparator start changed");
  const from = code.indexOf(start), end = code.indexOf("\n}", from);
  assert.ok(end > from, "nested comparator end changed");
  let body = code.slice(from, end);
  const operands = [
    ["textParagraph", "paragraphsEqual(a.block, b.block)", "null"],
    ["kind", "a.kind === b.kind", "null"],
    ["start", "a.start === b.start", "null"],
    ["itemCount", "a.items.length === b.items.length", "null"],
    ["itemPresent", "b.items[index] !== undefined", "[index]"],
    ["paragraph", "paragraphsEqual(item.block, b.items[index].block)", "[index]"],
    ["sectionCount", "item.lists.length === b.items[index].lists.length", "[index]"],
    ["sectionPresent", "b.items[index].lists[section] !== undefined", "[index, section]"],
    ["childList", "nestedListRootsEqual(list, b.items[index].lists[section])", "[index, section]"],
  ];
  for (const [name, expression, context] of operands) {
    assert.equal(body.split(expression).length, 2, `nested comparator operand changed: ${name}`);
    body = body.replace(expression, `nestedComparisonDiagnostic(${JSON.stringify(name)}, ${expression}, ${context})`);
  }
  body = body.replace(start, start + `
    const nestedComparisonDiagnostic = (operand, value, indexes) => {
        if (!value) {
            try { console.error("breditor nested comparison false", JSON.stringify({operand, indexes})); } catch {}
        }
        return value;
    };`);
  return code.slice(0, from) + body + code.slice(end);
}

/** Preserve swallowed projection exceptions in diagnostic builds only. */
export function instrumentProjectionCaughtErrors(code, moduleName) {
  return code.replace(/catch \{(?=\s*return projectionFailure\("projection\.[a-z_]+"\))/gu,
    `catch (projectionDiagnosticError) { try { let message = "<unprintable>", stack = ""; try { message = String(projectionDiagnosticError).slice(0, 1024); } catch {} try { if (typeof projectionDiagnosticError?.stack === "string") stack = projectionDiagnosticError.stack.slice(0, 4096); } catch {} console.error("breditor projection caught exception", ${JSON.stringify(moduleName)}, message, stack); } catch {}`);
}

/** Label false operands without replacing the equality algorithm or retrying it. */
export function instrumentFlatRootComparison(code) {
  const start = "export function flatListRootsEqual(a, b) {";
  assert.equal(code.split(start).length, 2, "flat comparator start changed");
  const from = code.indexOf(start), end = code.indexOf("\n}", from);
  assert.ok(end > from, "flat comparator end changed");
  let body = code.slice(from, end);
  const checks = [
    ["kind", "a.kind === b.kind"],
    ["start", "a.start === b.start"],
    ["length", "a.items.length === b.items.length"],
    ["itemPresent", "b.items[index] !== undefined"],
    ["paragraph", "paragraphsEqual(item, b.items[index])"],
  ];
  for (const [name, expression] of checks) {
    assert.equal(body.split(expression).length, 2, `flat comparator operand changed: ${name}`);
    const context = ["itemPresent", "paragraph"].includes(name) ? "index" : "null";
    body = body.replace(expression, `flatComparisonDiagnostic(${JSON.stringify(name)}, ${expression}, ${context})`);
  }
  body = body.replace(start, start + `
    const flatComparisonDiagnostic = (operand, value, index) => {
        if (!value) {
            try { console.error("breditor flat comparison false", JSON.stringify({operand, index,
                left: index === null ? {kind: a.kind, start: a.start, length: a.items?.length} : a.items[index],
                right: index === null ? {kind: b.kind, start: b.start, length: b.items?.length} : b.items[index]}).slice(0, 4096)); } catch {}
        }
        return value;
    };`);
  return code.slice(0, from) + body + code.slice(end);
}

/** Disposable fixture only: preserve short-circuit order and single reads. */
export function instrumentParagraphShapeOperands(code) {
  const start = "        if (paragraphIndex !== expectedIndex ||";
  const end = "!formatPropertyProbeIsAbsent(view, methods, paragraphIndex, 0, 0)) {";
  assert.equal(code.split(start).length, 2, "paragraph diagnostic start changed");
  assert.equal(code.split(end).length, 2, "paragraph diagnostic end changed");
  const from = code.indexOf(start), to = code.indexOf(end, from) + end.length;
  assert.ok(to > from);
  let condition = code.slice(from, to);
  const operands = [
    ["listMetadata", "listMetadataIsAbsent(view, methods, paragraphIndex)"],
    ["nodeKind", "invokeGenerated(methods.nodeKind, view, paragraphIndex)"],
    ["text", "invokeGenerated(methods.text, view, paragraphIndex)"],
    ["formatCount", "invokeGenerated(methods.formatCount, view, paragraphIndex)"],
    ["formatType", "invokeGenerated(methods.formatType, view, paragraphIndex, 0)"],
    ["formatPropertyAbsent", "formatPropertyProbeIsAbsent(view, methods, paragraphIndex, 0, 0)"],
  ];
  for (const [name, expression] of operands) {
    assert.equal(condition.split(expression).length, 2, `paragraph operand changed: ${name}`);
    condition = condition.replace(expression, `paragraphDiagnosticRead(${JSON.stringify(name)}, ${expression})`);
  }
  return code.slice(0, from) + `
        const paragraphDiagnostic = {paragraphOrdinal, paragraphIndex, expectedIndex, blockType, headingLevel};
        const paragraphDiagnosticRead = (name, value) => {
            paragraphDiagnostic[name] = {type: typeof value, value: typeof value === "string" ? value.slice(0, 256) : value};
            return value;
        };
` + condition + `
            try { console.error("breditor paragraph shape operands", JSON.stringify(paragraphDiagnostic).slice(0, 4096)); } catch {}
` + code.slice(to);
}

// Capture the terminal router boundary too: queueUncertain does not imply an
// executor exception. Read each scalar independently before teardown destroys
// the useful state. This is only injected into disposable synthetic bundles.
export function instrumentRouterFailures(code) {
  const anchor = /(#fault\(reason\)\s*\{\s*if \(this\.#status\.kind !== "live"\)\s*return;)/gu;
  let sites = 0;
  const result = code.replace(anchor, match => {
    sites++;
    return `${match}
    const routerDiagnostic = {reason};
    try { routerDiagnostic.adapterState = this.#adapter.state; } catch {}
    try { routerDiagnostic.queueCode = this.#queue.failure?.code; } catch {}
    try { routerDiagnostic.queueDisposed = this.#queue.disposed; } catch {}
    try { routerDiagnostic.stack = new Error("router fault boundary").stack?.slice(0, 4096); } catch {}
    try { console.error("breditor router failure", JSON.stringify(routerDiagnostic)); } catch {}
    `;
  });
  assert.equal(sites, 1, "router diagnostic fault site changed");
  return result;
}

export function instrumentQueueFailures(code) {
  const sites = [];
  const transformed = code.replace(/\}\s+catch \{\n(\s+)((?:const failure = )?this\.#fail\("command_queue\.(executor|observer)_threw", (?:sequence|pending\.sequence)\);)/gu,
    (_, indent, statement, phase) => {
      sites.push(phase);
      // Catch-site capture also sees engine-created exceptions, unlike a
      // constructor proxy. Read message and stack independently: arbitrary
      // thrown values/accessors and even the logger may themselves throw.
      // Only use this with synthetic fixtures; stacks can contain local URLs.
      return `} catch (queueDiagnosticError) {
${indent}let queueDiagnosticMessage = "<unprintable>";
${indent}let queueDiagnosticStack = "<unavailable>";
${indent}try { queueDiagnosticMessage = String(queueDiagnosticError).slice(0, 1024); } catch {}
${indent}try {
${indent}  const stack = queueDiagnosticError?.stack;
${indent}  if (typeof stack === "string") queueDiagnosticStack = stack.slice(0, 4096);
${indent}} catch {}
${indent}try { console.error("breditor queue failure: ${phase}", queueDiagnosticMessage, queueDiagnosticStack); } catch {}
${indent}${statement}`;
    });
  assert.deepEqual(sites.sort(), ["executor", "executor", "observer", "observer"], "queue diagnostic catch sites changed");
  return transformed;
}

// Stress only the disposable fixture's owner loop. Keep all correctness
// assertions, disposal and the yield between owners exactly as written.
export function repeatPerformanceOwners(code, repetitions) {
  assert.ok(Number.isSafeInteger(repetitions) && repetitions >= 3 && repetitions <= 100, "owner repetitions must be 3..100");
  const anchor = "repetition < 3";
  assert.equal(code.split(anchor).length, 2, "performance owner loop changed");
  return code.replace(anchor, `repetition < ${repetitions}`);
}

// Separate focus-triggered native notifications from the synthetic selection
// delivery in the original reproducer. Only rewrite the disposable fixture;
// these wall-clock spans include task waits and are not performance samples.
export function schedulePerformanceSelection(code, mode) {
  assert.ok(["focus-task", "native-selection"].includes(mode), "invalid selection scheduling mode");
  const anchor = `    measured("selectionMs", () => {
      owner!.focus(); const block = host.querySelectorAll("li")[middle]!.firstElementChild!;
      const range = document.createRange(); range.selectNodeContents(block); range.collapse(false);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });`;
  assert.equal(code.split(anchor).length, 2, "performance selection scheduling anchor changed");
  const delivery = mode === "focus-task"
    ? `      document.dispatchEvent(new Event("selectionchange"));`
    : `      await nativeSelection;`;
  const nativeWait = mode === "native-selection" ? `
      // Register before changing the range. Ignore synthetic events, and fail
      // rather than silently falling back to synthetic delivery on timeout.
      const nativeSelection = new Promise<void>((resolve, reject) => {
        const listener = (event: Event) => {
          if (!event.isTrusted) return;
          clearTimeout(timer); document.removeEventListener("selectionchange", listener); resolve();
        };
        const timer = setTimeout(() => {
          document.removeEventListener("selectionchange", listener);
          reject(new Error("Native selectionchange did not arrive"));
        }, 5000);
        document.addEventListener("selectionchange", listener);
      });` : "";
  return code.replace(anchor, `    progress = \`\${items} items, repetition \${repetition}: selectionMs (${mode})\`;
    {
      const selectionStart = performance.now();
      owner!.focus();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      equal(owner!.getStatus().phase, "live");
      const block = host.querySelectorAll("li")[middle]!.firstElementChild!;
      const range = document.createRange(); range.selectNodeContents(block); range.collapse(false);${nativeWait}
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
${delivery}
      equal(owner!.getStatus().phase, "live");
      host.getBoundingClientRect(); metrics["selectionMs"] = performance.now() - selectionStart;
    }`);
}
