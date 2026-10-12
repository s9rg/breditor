// Private disposable-bundle diagnosis. Never change installed or shipping code.
import assert from "node:assert/strict";

/** Attribute a rejected read without retries, extra Wasm reads or overrides. */
export function instrumentDocumentExportRead(code) {
  const start = "#readDocumentJson() {", next = "#readPlainText() {";
  assert.equal(code.split(start).length, 2, "document read method changed");
  const from = code.indexOf(start), end = code.indexOf(next, from);
  assert.ok(end > from, "plain-text method boundary changed");
  let body = code.slice(from, end);
  const expression = "return consumed.ok &&", tail = ": consumed;";
  assert.equal(body.split(expression).length, 2, "document correlation changed");
  assert.equal(body.split(tail).length, 2, "document read result changed");
  body = body.replace(expression, "return diagnosticDocumentRead(consumed, consumed.ok &&")
    .replace(tail, ": consumed);")
    .replace(start, start + `
        const diagnosticDocumentRead = (consumed, result) => {
            if (!result.ok) {
                try { console.error("breditor document export read rejection", JSON.stringify({
                    stage: consumed.ok ? "projection-correlation" : "wasm-result-consumption",
                    error: result.error,
                    documentLength: consumed.ok ? consumed.document.documentJson.length : undefined,
                    snapshot: consumed.ok ? consumed.document.snapshot : undefined
                }).slice(0, 2048)); } catch {}
            }
            return result;
        };`);
  const caught = "catch {\n            return invalidWasmDocumentJsonReadResult();";
  assert.equal(body.split(caught).length, 2, "document exception site changed");
  body = body.replace(caught, `catch (error) {
            try { console.error("breditor document export read exception", String(error).slice(0, 2048)); } catch {}
            return invalidWasmDocumentJsonReadResult();`);
  return code.slice(0, from) + body + code.slice(end);
}
