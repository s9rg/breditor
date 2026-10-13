// Disposable synthetic-fixture diagnosis only. Never modify installed packages
// or production logging. Retain normal terminal queue semantics after logging.
import assert from "node:assert/strict";

/** Capture exact comparator arguments and its result; never retry or override. */
export function instrumentNestedParagraphResults(code) {
  const expression = "paragraphsEqual(item.block, b.items[index].block)";
  const start = "export function nestedListRootsEqual(a, b) {";
  assert.equal(code.split(expression).length, 2, "nested paragraph call changed");
  assert.equal(code.split(start).length, 2, "nested comparator start changed");
  return code.replace(expression, "diagnosticParagraphResult(item.block, b.items[index].block, index)")
    .replace(start, start + `
    const diagnosticParagraphResult = (left, right, index) => {
        const result = paragraphsEqual(left, right);
        if (!result) {
            try {
                const scalar = value => ({type: typeof value, value,
                    spelling: typeof value === "number" ? String(value) : undefined});
                console.error("breditor nested paragraph operands", JSON.stringify({index, result,
                    sameReference: left === right, left, right,
                    internalMismatch: globalThis.__breditorParagraphMismatch ?? null,
                    internalPropertyMismatch: globalThis.__breditorFormatPropertyMismatch ?? null,
                    heading: {left: scalar(left.headingLevel), right: scalar(right.headingLevel),
                        sameValue: Object.is(left.headingLevel, right.headingLevel)},
                    runCounts: {left: left.runs.length, right: right.runs.length},
                    runs: left.runs.slice(0, 8).map((run, ordinal) => {
                        const other = right.runs[ordinal];
                        return {ordinal, rightPresent: other !== undefined,
                            textEqual: other !== undefined && run.text === other.text,
                            strongEqual: other !== undefined && run.strong === other.strong,
                            formatJsonEqual: other !== undefined && JSON.stringify(run.formatDetails) === JSON.stringify(other.formatDetails)};
                    })}).slice(0, 8192));
            } catch {}
        }
        return result;
    };`);
}

/** Diagnostic comparison trials; no retries or overrides of computed results. */
export function instrumentParagraphComparison(code, headingComparison = "strict", {failureCapture = false} = {}) {
  assert.equal(typeof failureCapture, "boolean");
  assert.ok(["strict", "same-value", "same-value-minimal"].includes(headingComparison), "unknown heading comparison variant");
  const start = "export function paragraphsEqual(left, right) {";
  assert.equal(code.split(start).length, 2, "paragraph comparator start changed");
  const from = code.indexOf(start), end = code.indexOf("\n}", from);
  assert.ok(end > from);
  let body = code.slice(from, end);
  const headingExpression = body.includes("!ownedHeadingLevelsEqual(left.headingLevel, right.headingLevel)")
    ? "!ownedHeadingLevelsEqual(left.headingLevel, right.headingLevel)"
    : body.includes("!Object.is(left.headingLevel, right.headingLevel)")
      ? "!Object.is(left.headingLevel, right.headingLevel)" : "left.headingLevel !== right.headingLevel";
  if (headingComparison === "same-value-minimal") {
    const expression = headingExpression;
    assert.equal(body.split(expression).length, 2, "heading comparison changed");
    return code.slice(0, from) + body.replace(expression, "!Object.is(left.headingLevel, right.headingLevel)") + code.slice(end);
  }
  for (const [name, expression] of [
    ["heading", headingExpression],
    ["runCount", "left.runs.length !== right.runs.length"],
    ["leftAbsent", "leftRun === undefined"],
    ["rightAbsent", "rightRun === undefined"],
    ["text", "leftRun.text !== rightRun.text"],
    ["strong", "leftRun.strong !== rightRun.strong"],
    ["formats", "!formatDetailsEqual(leftRun.formatDetails, rightRun.formatDetails)"],
  ]) {
    assert.equal(body.split(expression).length, 2, `paragraph comparison changed: ${name}`);
    const captured = name === "heading"
      ? headingComparison === "strict" && headingExpression.startsWith("!ownedHeadingLevelsEqual")
        ? "!ownedHeadingLevelsEqual((headingLeft = left.headingLevel), (headingRight = right.headingLevel))"
        : headingComparison === "same-value" || headingExpression.startsWith("!Object.is")
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
  if (failureCapture) {
    body = body.replace(start, start + "\n    globalThis.__breditorParagraphMismatch = undefined;\n    globalThis.__breditorFormatPropertyMismatch = undefined;");
    const logging = 'console.error("breditor paragraph comparison mismatch", JSON.stringify({operand, left, right,';
    assert.equal(body.split(logging).length, 2, "paragraph diagnostic payload changed");
    body = body.replace(logging, 'globalThis.__breditorParagraphMismatch = JSON.stringify({operand, left, right,');
    body = body.replace('sameValue: Object.is(headingLeft, headingRight)}}).slice(0, 4096));',
      'sameValue: Object.is(headingLeft, headingRight)}}).slice(0, 4096);');
  }
  return code.slice(0, from) + body + code.slice(end);
}

/** Store exact typed scalar operands only on rejection; never override it. */
export function instrumentFormatPropertyComparison(code) {
  const start = "function formatDetailsEqual(left, right) {";
  const expression = "leftProperty.value !== rightProperty.value";
  assert.equal(code.split(start).length, 2, "format equality method changed");
  assert.equal(code.split(expression).length, 2, "format property comparison changed");
  return code.replace(expression, "diagnosticPropertyMismatch(leftProperty.value, rightProperty.value, formatIndex, propertyIndex)")
    .replace(start, start + `
    const diagnosticPropertyMismatch = (left, right, formatIndex, propertyIndex) => {
        const mismatch = left !== right;
        if (mismatch) {
            try { globalThis.__breditorFormatPropertyMismatch = JSON.stringify({
                formatIndex, propertyIndex, leftType: typeof left, rightType: typeof right,
                left, right, sameValueAfterRejection: Object.is(left, right)
            }).slice(0, 2048); } catch {}
        }
        return mismatch;
    };`);
}

// Preserve the validator's bounded failure code before the adapter replaces it
// with its generic exception. Synthetic disposable bundles only.
export function instrumentProjectionUpdateFailures(code) {
  const anchor = 'throw new TypeError("Wasm projection update is invalid");';
  assert.equal(code.split(anchor).length, 2, "projection-update diagnostic site changed");
  return code.replace(anchor, `try { console.error("breditor projection update rejection", JSON.stringify(converted.error).slice(0, 2048)); } catch {}\n${anchor}`);
}

/** Label existing rejection expressions without changing their returned value. */
export function instrumentProjectionValidationSites(code, moduleName, {blockTypeCallMarker = true} = {}) {
  assert.equal(typeof blockTypeCallMarker, "boolean", "block call marker must be boolean");
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
    const marked = blockTypeCallMarker ? instrumentBlockTypeCall(transformed) : transformed;
    return instrumentNestedLayoutRejections(instrumentParagraphShapeOperands(instrumentAdmittedBlockIndex(marked)));
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

/** Failure-only local scalar capture; do not reread generated metadata. */
export function instrumentNestedLayoutRejections(code) {
  const start = "function readNestedListLayout(view, methods, rootCount, nodeCount) {";
  assert.equal(code.split(start).length, 2, "nested layout diagnostic start changed");
  const from = code.indexOf(start), to = code.indexOf("\n}", from) + 2;
  assert.ok(to > from + start.length, "nested layout diagnostic end changed");
  let body = code.slice(from, to);
  const sites = [
    ["capabilities", "rootCount, nodeCount"],
    ["block.index", "index, next, nodeCount"],
    ["block.type", "index, next, nodeCount, type"],
    ["block.runs", "index, next, nodeCount, runs"],
    ["list.indexOrDepth", "index, next, nodeCount, depth"],
    ["list.kindOrWrapper", "index, next, nodeCount, type, kind"],
    ["list.countOrStart", "index, next, nodeCount, kind, start, count"],
    ["item.indexOrWrapper", "index, next, nodeCount, item, ordinal, count"],
    ["item.children", "index, next, nodeCount, item, children"],
    ["item.block", "index, next, nodeCount, item, children"],
    ["item.childList", "index, next, nodeCount, item, section, depth"],
    ["item.extraChild", "index, next, nodeCount, item, children"],
    ["list.extraItem", "index, next, nodeCount, count"],
    ["root.index", "index, next, nodeCount, root"],
    ["root.block", "index, next, nodeCount, root"],
    ["root.list", "index, next, nodeCount, root"],
  ];
  let site = 0;
  body = body.replace(/return (null|false);/gu, (_, value) => {
    const entry = sites[site++];
    assert.ok(entry, "unexpected nested layout rejection");
    return `return nestedLayoutReject(${JSON.stringify(entry[0])}, ${value}, {${entry[1]}});`;
  });
  assert.equal(site, sites.length, "nested layout rejection count changed");
  const coverage = /return next === nodeCount \? \{\s*shapes,\s*textBlocks\s*\} : null;/gu;
  assert.equal([...body.matchAll(coverage)].length, 1, "nested layout coverage branch changed");
  body = body.replace(coverage, 'return next === nodeCount ? { shapes, textBlocks } : nestedLayoutReject("coverage", null, {next, nodeCount, rootCount});');
  body = body.replace(start, start + `
    const nestedLayoutReject = (stage, result, scalars) => {
        try { console.error("breditor nested layout rejection", JSON.stringify({stage,
            scalars: Object.fromEntries(Object.entries(scalars).map(([name, value]) => [name, {
                type: typeof value,
                value: typeof value === "string" ? value.slice(0, 256)
                    : value === null || typeof value === "number" || typeof value === "boolean" ? value : undefined,
                spelling: typeof value === "number" ? String(value) : undefined,
            }])),
        }).slice(0, 4096)); } catch {}
        return result;
    };`);
  return code.slice(0, from) + body + code.slice(to);
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
  // Capture both primitive operands once, rather than rereading the owned
  // snapshots after rejection or relying on JSON to preserve numeric types.
  body = body.replace("a.start === b.start", "nestedStartComparisonDiagnostic(a.start, b.start)");
  body = body.replace(start, start + `
    const nestedStartComparisonDiagnostic = (left, right) => {
        const equal = left === right;
        if (!equal) {
            try { console.error("breditor nested start operands", JSON.stringify({
                left: {type: typeof left, value: left, spelling: typeof left === "number" ? String(left) : undefined},
                right: {type: typeof right, value: right, spelling: typeof right === "number" ? String(right) : undefined},
            }).slice(0, 4096)); } catch {}
        }
        return equal;
    };
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
export function instrumentAdmittedBlockIndex(code) {
  const anchors = ["if (paragraphIndex !== expectedIndex) {",
    'if (typeof paragraphIndex !== "number" || !projectionU32sEqual(paragraphIndex, expectedIndex)) {'];
  if (!code.includes("const blockType = invokeGenerated(methods.elementType, view, paragraphIndex);") &&
      !code.includes("const blockType = (paragraphBlockTypeInvoked = true, invokeGenerated(methods.elementType, view, paragraphIndex));")) return code;
  const matches = anchors.filter(anchor => code.includes(anchor));
  assert.equal(matches.length, 1, "admitted block index branch changed or mixed");
  const anchor = matches[0];
  assert.equal(code.split(anchor).length, 2, "admitted block index branch changed");
  return code.replace(anchor, anchor + `
            try { console.error("breditor admitted block index rejection", JSON.stringify({
                paragraphOrdinal,
                paragraphIndex: {type: typeof paragraphIndex, value: paragraphIndex},
                expectedIndex: {type: typeof expectedIndex, value: expectedIndex},
                plannedBlockPresent: plannedBlock !== undefined,
                handle: view.__wbg_ptr,
                rawElementTypeCalls: globalThis.__breditorElementTypeTrace?.(),
            }).slice(0, 4096)); } catch {}`);
}

export function instrumentBlockTypeCall(code) {
  const admittedDeclaration = "const blockType = invokeGenerated(methods.elementType, view, paragraphIndex);";
  if (code.includes(admittedDeclaration)) {
    assert.equal(code.split(admittedDeclaration).length, 2, "admitted block type declaration changed");
    assert.ok(!code.includes("const blockType = paragraphIndex === expectedIndex"), "mixed block type declarations");
    return code.replace(admittedDeclaration,
      "let paragraphBlockTypeInvoked = false;\n        const blockType = (paragraphBlockTypeInvoked = true, invokeGenerated(methods.elementType, view, paragraphIndex));");
  }
  const declaration = "const blockType = paragraphIndex === expectedIndex";
  const call = "? invokeGenerated(methods.elementType, view, paragraphIndex) : undefined;";
  assert.equal(code.split(declaration).length, 2, "block type declaration changed");
  assert.equal(code.split(call).length, 2, "block type call changed");
  return code.replace(declaration, "let paragraphBlockTypeInvoked = false;\n        " + declaration)
    .replace(call, "? (paragraphBlockTypeInvoked = true, invokeGenerated(methods.elementType, view, paragraphIndex)) : undefined;");
}

export function instrumentParagraphShapeOperands(code) {
  const legacyStart = "        if (paragraphIndex !== expectedIndex ||";
  const admittedStart = "        if (!listMetadataIsAbsent(view, methods, paragraphIndex) ||";
  assert.ok(!(code.includes(legacyStart) && code.includes(admittedStart)), "mixed paragraph shape conditions");
  const start = code.includes(legacyStart) ? legacyStart : admittedStart;
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
        const paragraphDiagnostic = {paragraphOrdinal, paragraphIndex, expectedIndex,
            blockTypeInvoked: typeof paragraphBlockTypeInvoked === "boolean" ? paragraphBlockTypeInvoked : undefined,
            blockType: {type: typeof blockType, value: blockType},
            headingLevel: {type: typeof headingLevel, value: headingLevel}};
        const paragraphDiagnosticRead = (name, value) => {
            paragraphDiagnostic[name] = {type: typeof value, value: typeof value === "string" ? value.slice(0, 256) : value};
            return value;
        };
` + condition + `
            try { paragraphDiagnostic.handle = view.__wbg_ptr; } catch {}
            try { paragraphDiagnostic.rawElementTypeCalls = globalThis.__breditorElementTypeTrace?.(); } catch {}
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

/** Capture owner-only terminal transitions before disposal erases queue state. */
export function instrumentOwnerFailures(code) {
  const anchor = /(#fault\(reason\)\s*\{\s*if \(this\.#status\.phase !== "live"\)\s*return;)/gu;
  let sites = 0;
  const result = code.replace(anchor, match => {
    sites++;
    return `${match}
    const ownerDiagnostic = {reason};
    try { ownerDiagnostic.adapterState = this.#adapter.state; } catch {}
    try { ownerDiagnostic.queueCode = this.#queue.failure?.code; } catch {}
    try { ownerDiagnostic.queueDisposed = this.#queue.disposed; } catch {}
    try { ownerDiagnostic.stack = new Error("owner fault boundary").stack?.slice(0, 4096); } catch {}
    try { console.error("breditor owner failure", JSON.stringify(ownerDiagnostic)); } catch {}
    `;
  });
  assert.equal(sites, 1, "owner diagnostic fault site changed");
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

// Diagnostic-only progress mirrors existing phase assignments into the fixture
// DOM. Ordinary measurement bytes are untouched. Failed diagnostics must not
// change editor execution or hide its original error.
export function instrumentFixtureProgress(code) {
  assert.ok(!code.includes("recordFixtureProgress"), "duplicate fixture progress transform");
  const initial = 'let progress = "initialization";';
  assert.equal(code.split(initial).length, 2, "fixture initialization anchor changed");
  let assignments = 0;
  code = code.replace(/^(\s*)progress = ([^\n]+);$/gmu, (line, indent) => {
    assignments++;
    return `${line}\n${indent}recordFixtureProgress(progress);`;
  });
  assert.equal(assignments, 3, "fixture phase assignments changed");
  code = code.replace(initial, `${initial}
function recordFixtureProgress(value: string, completed?: number): void {
  if (value.endsWith(": startup")) fixtureCaseStartedWallMs = Date.now();
  try { output.setAttribute("data-progress", value); } catch {}
  if (completed !== undefined) {
    try { output.setAttribute("data-cases-completed", String(completed)); } catch {}
    if (completed > 0 && fixtureCaseStartedWallMs !== undefined) {
      const elapsed = Date.now() - fixtureCaseStartedWallMs;
      fixtureWorkTotalWallMs += elapsed;
      try { output.setAttribute("data-work-total-wall-ms", String(fixtureWorkTotalWallMs)); } catch {}
      try { output.setAttribute("data-work-last-wall-ms", String(elapsed)); } catch {}
    }
  }
}
let fixtureCaseStartedWallMs: number | undefined;
let fixtureWorkTotalWallMs = 0;
let fixtureDrainTotalMs = 0;
let fixtureDrainMaxMs = 0;
let fixtureDrainTotalWallMs = 0;
let fixtureDrainStartedWallMs = 0;
function recordFixtureDrainStart(): number {
  const start = performance.now();
  fixtureDrainStartedWallMs = Date.now();
  try { output.setAttribute("data-drain-start-ms", String(start)); } catch {}
  try { output.setAttribute("data-drain-start-wall-ms", String(fixtureDrainStartedWallMs)); } catch {}
  return start;
}
function recordFixtureDrainEnd(start: number): void {
  const elapsed = performance.now() - start;
  fixtureDrainTotalMs += elapsed;
  fixtureDrainMaxMs = Math.max(fixtureDrainMaxMs, elapsed);
  fixtureDrainTotalWallMs += Date.now() - fixtureDrainStartedWallMs;
  try { output.setAttribute("data-drain-total-ms", String(fixtureDrainTotalMs)); } catch {}
  try { output.setAttribute("data-drain-max-ms", String(fixtureDrainMaxMs)); } catch {}
  try { output.setAttribute("data-drain-total-wall-ms", String(fixtureDrainTotalWallMs)); } catch {}
  try { output.removeAttribute("data-drain-start-ms"); } catch {}
  try { output.removeAttribute("data-drain-start-wall-ms"); } catch {}
}
recordFixtureProgress(progress, 0);`);
  const compile = "  const compiled = wasm.BreditorCompiledProfile.fromBootstrapJsonV5(semanticProfile.bootstrapJson);";
  assert.equal(code.split(compile).length, 2, "fixture compilation anchor changed");
  code = code.replace(compile, `  recordFixtureProgress("profile compilation");\n${compile}`);
  const drain = "      await new Promise<void>(resolve => setTimeout(resolve, 0));";
  assert.equal(code.split(drain).length, 2, "fixture owner drain anchor changed");
  code = code.replace(drain, `      recordFixtureProgress(\`\${items} items, repetition \${repetition}: drain\`, cases.length);
      const fixtureDrainStart = recordFixtureDrainStart();
${drain}
      recordFixtureDrainEnd(fixtureDrainStart);`);
  const exportRead = "    const value = owner!.exportContent(format);";
  assert.equal(code.split(exportRead).length, 2, "fixture export anchor changed");
  return code.replace(exportRead, `    recordFixtureProgress(\`\${items} items, repetition \${repetition}: export \${format}\`);\n${exportRead}`);
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
