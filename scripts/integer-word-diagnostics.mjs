// Private RGB24 workload diagnosis; never modify installed package bytes.
import assert from "node:assert/strict";

/** Capture already-read words, BigInt and decoded number only on deviation. */
export function instrumentIntegerWordDecode(code) {
  const site = "return numberFromInteger(value);";
  const wordsSite = "const presence = words[0], low = words[1], high = words[2];";
  assert.equal(code.split(site).length, 2, "integer conversion site changed");
  assert.equal(code.split(wordsSite).length, 2, "integer word read site changed");
  code=code.replace(wordsSite,wordsSite+`
    try { globalThis.__breditorLastIntegerWords = {presence, low, high,
        kind: "words-observed", decoded: undefined}; } catch {}`);
  return code.replace(site, `const decoded = numberFromInteger(value);
    try { globalThis.__breditorLastIntegerWords = {
        presence, low, high, integerSpelling: String(value), decoded
    }; } catch {}
    if (decoded !== 1193046) {
        try { console.error("breditor integer word decode deviation", JSON.stringify({
            presence, low, high, integerSpelling: String(value), decoded,
            lowSpelling: String(low), highSpelling: String(high)
        }).slice(0, 2048)); } catch {}
    }
    return decoded;`);
}

/** Observe existing property locals; optional capture brackets the final call. */
export function instrumentProjectedIntegerTuple(code, {captureBeforeString = false} = {}) {
  assert.equal(typeof captureBeforeString, "boolean");
  const legacy = "view, nodeIndex, formatIndex, propertyIndex));";
  const explicit = "const stringValue = invokeGenerated(methods.formatPropertyString, view, nodeIndex, formatIndex, propertyIndex);";
  const site = code.includes(legacy) ? legacy : explicit;
  assert.equal(code.split(site).length, 2, "projected property tuple site changed");
  if (captureBeforeString && site === explicit) {
    const integerSite = "const integerValue = invokeGenerated(methods.formatPropertyInteger, view, nodeIndex, formatIndex, propertyIndex);";
    assert.equal(code.split(integerSite).length, 2, "explicit integer call site changed");
    code = code.replace(integerSite, integerSite + `
    try { globalThis.__breditorIntegerBeforeString = {
        nodeIndex, formatIndex, propertyIndex, integerValue,
        words: globalThis.__breditorLastIntegerWords ?? null,
        invocation: globalThis.__breditorIntegerInvocation ?? null
    }; } catch {}`);
  }
  return code.replace(site, site + `
    if (name === "example/rgb24" && kind === "integer" && integerValue !== 1193046) {
        try { console.error("breditor projected integer tuple deviation", JSON.stringify({
            nodeIndex, formatIndex, propertyIndex, name, kind, integerValue,
            lastWords: globalThis.__breditorLastIntegerWords ?? null,
            lastInvocation: globalThis.__breditorIntegerInvocation ?? null,
            wordReturn: globalThis.__breditorIntegerWordReturn ?? null,
            transport: globalThis.__breditorProjectionTransports?.get(view) ?? null,
            beforeString: ${captureBeforeString && site === explicit ? "globalThis.__breditorIntegerBeforeString ?? null" : "null"}
        }).slice(0, 2048)); } catch {}
    }`);
}

/** Correlate every decoder result, including absence, with exact getter indices. */
export function instrumentIntegerWordReturn(code) {
  const site="return decodeProjectionIntegerWords(invokeGenerated(word, this, index, ordinal, property));";
  assert.equal(code.split(site).length,2,"integer word wrapper changed");
  return code.replace(site,`const call = {index, ordinal, property};
    const record = invokeGenerated(word, this, index, ordinal, property);
    const decoded = decodeProjectionIntegerWords(record);
    try { globalThis.__breditorIntegerWordReturn = {call, decoded,
        words: globalThis.__breditorLastIntegerWords ?? null}; } catch {}
    return decoded;`);
}

/** Trace the existing generic call boundary for the known RGB24 ordinal. */
export function instrumentIntegerInvocation(code) {
  const start = "function invokeGenerated(method, receiver, ...args) {";
  assert.equal(code.split(start).length, 2, "generated invocation helper changed");
  const from=code.indexOf(start), end=code.indexOf("\n}",from);
  assert.ok(end>from);
  let body=code.slice(from,end);
  const applied="const value = Reflect.apply(method, receiver, args);";
  const returned="return value;";
  assert.equal(body.split(applied).length,2);assert.equal(body.split(returned).length,2);
  body=body.replace(applied,applied+`
    const tracedInteger = typeof value === "number" && args.length === 3 && args[1] === 2 && args[2] === 0;
    if (tracedInteger) {
        try { globalThis.__breditorIntegerInvocation = {
            nodeIndex: args[0], formatIndex: args[1], propertyIndex: args[2],
            beforeGuard: value, words: globalThis.__breditorLastIntegerWords ?? null,
            wordWrapper: globalThis.__breditorIntegerWrappers?.has(method) ?? null,
            transport: globalThis.__breditorProjectionTransports?.get(receiver) ?? null
        }; } catch {}
    }`);
  body=body.replace(returned,`
    if (tracedInteger) {
        try { globalThis.__breditorIntegerInvocation.afterGuard = value;
            if (value !== 1193046) console.error("breditor integer invocation deviation",
                JSON.stringify(globalThis.__breditorIntegerInvocation).slice(0,2048)); } catch {}
    }
    ${returned}`);
  return code.slice(0,from)+body+code.slice(end);
}

/** Record admission and exact wrapper identity without additional view reads. */
export function instrumentProjectionTransportAdmission(code) {
  const start="function snapshotSemanticProjection(view, textBlocks, flatLists, nestedLists) {";
  assert.equal(code.split(start).length,2,"projection snapshot admission changed");
  code=code.replace(start,start+`
    const transportTrace = {textBlocks, flatLists, nestedLists, integerApplied:false};
    try {
        globalThis.__breditorProjectionTransports ??= new WeakMap();
        globalThis.__breditorIntegerWrappers ??= new WeakSet();
        globalThis.__breditorProjectionTransports.set(view, transportTrace);
    } catch {}`);
  for(const [site,field] of [
    ['const version = readGeneratedScalar(view, "projectionScalarWordsVersion");',"scalarVersion"],
    ['const integerVersion = readGeneratedScalar(view, "projectionIntegerWordsVersion");',"integerVersion"],
  ]) {
    assert.equal(code.split(site).length,2,"transport version read changed");
    code=code.replace(site,site+`\n    transportTrace.${field} = ${field==="scalarVersion"?"version":"integerVersion"};`);
  }
  const assignment=/methods\["formatPropertyInteger"\] = function\s*\(index, ordinal, property\) \{[\s\S]*?\n\s*\};/gu;
  let sites=0;
  code=code.replace(assignment,match=>{sites++;return match+`
    transportTrace.integerApplied = true;
    try { globalThis.__breditorIntegerWrappers.add(methods["formatPropertyInteger"]); } catch {}`;});
  assert.equal(sites,1,"integer wrapper assignment changed");
  return code;
}
