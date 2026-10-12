import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {instrumentDocumentExportRead} from "./document-export-diagnostics.mjs";

test("document read attribution preserves exact result and one correlation", () => {
  const source = `class Owner {
    #readDocumentJson() {
      const consumed = consume();
      try {
        return consumed.ok && !correlate(consumed.document)
          ? invalidWasmDocumentJsonReadResult()
          : consumed;
      } catch {
            return invalidWasmDocumentJsonReadResult();
      }
    }
    #readPlainText() {}
    read() { return this.#readDocumentJson(); }
  }`;
  for (const mode of ["pass", "consume", "correlate", "throw"]) {
    let calls = 0; const logs = [];
    const consumed = mode === "consume" ? {ok:false,error:{code:"consume"}} :
      {ok:true,document:{documentJson:"{}",snapshot:{revision:"1"}}};
    const rejected = {ok:false,error:{code:"correlate"}};
    const Owner = Function("consume", "correlate", "invalidWasmDocumentJsonReadResult", "console",
      instrumentDocumentExportRead(source) + ";return Owner;")(
        () => consumed, () => {calls++; if(mode === "throw") throw Error("fixture"); return mode === "pass";},
        () => rejected, {error: (...args) => logs.push(args)});
    const result = new Owner().read();
    assert.equal(result, mode === "pass" || mode === "consume" ? consumed : rejected);
    assert.equal(calls, mode === "consume" ? 0 : 1);
    assert.equal(logs.length, mode === "pass" ? 0 : 1);
    if (mode === "consume" || mode === "correlate") assert.equal(JSON.parse(logs[0][1]).stage,
      mode === "consume" ? "wasm-result-consumption" : "projection-correlation");
  }
});

test("current generated adapter admits exact diagnostic sites; drift rejects", () => {
  const source = readFileSync(new URL("../packages/breditor-browser/dist/wasm_command_adapter.js", import.meta.url), "utf8");
  assert.ok(instrumentDocumentExportRead(source).includes("projection-correlation"));
  assert.throws(() => instrumentDocumentExportRead(source.replace("return consumed.ok &&", "return false &&")));
});
