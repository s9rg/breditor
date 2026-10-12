// Private RGB24 workload diagnosis; never modify installed package bytes.
import assert from "node:assert/strict";

/** Capture already-read words, BigInt and decoded number only on deviation. */
export function instrumentIntegerWordDecode(code) {
  const site = "return numberFromInteger(value);";
  assert.equal(code.split(site).length, 2, "integer conversion site changed");
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
        words: globalThis.__breditorLastIntegerWords ?? null
    }; } catch {}`);
  }
  return code.replace(site, site + `
    if (name === "example/rgb24" && kind === "integer" && integerValue !== 1193046) {
        try { console.error("breditor projected integer tuple deviation", JSON.stringify({
            nodeIndex, formatIndex, propertyIndex, name, kind, integerValue,
            lastWords: globalThis.__breditorLastIntegerWords ?? null,
            beforeString: ${captureBeforeString && site === explicit ? "globalThis.__breditorIntegerBeforeString ?? null" : "null"}
        }).slice(0, 2048)); } catch {}
    }`);
}
