import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {transformSync} from "rolldown/utils";
import {instrumentContentSnapshotComparison,instrumentDocumentExportRead,instrumentDocumentPropertyComparison} from "./document-export-diagnostics.mjs";

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

test("snapshot diagnosis preserves short-circuit and exact getter counts", () => {
  const source = "return left.lineage === right.lineage && left.revision === right.revision;";
  for (const [lineage, revision, expected, revisionReads] of [
    ["a", "1", true, 1], ["b", "1", false, 0], ["a", "2", false, 1],
  ]) {
    const reads = {leftLineage:0,rightLineage:0,leftRevision:0,rightRevision:0}, logs=[];
    const left = {get lineage(){reads.leftLineage++;return "a";},get revision(){reads.leftRevision++;return "1";}};
    const right = {get lineage(){reads.rightLineage++;return lineage;},get revision(){reads.rightRevision++;return revision;}};
    const compare = Function("left","right","console",instrumentContentSnapshotComparison(source));
    assert.equal(compare(left,right,{error:(...args)=>logs.push(args)}),expected);
    assert.deepEqual(reads,{leftLineage:1,rightLineage:1,leftRevision:revisionReads,rightRevision:revisionReads});
    assert.equal(logs.length,expected?0:1);
  }
  const generated=readFileSync(new URL("../packages/breditor-browser/dist/browser_editor.js",import.meta.url),"utf8");
  assert.ok(instrumentContentSnapshotComparison(generated).includes("breditor content snapshot rejection"));
  assert.throws(()=>instrumentContentSnapshotComparison("return true;"));
});

test("property comparison captures operands once without overriding equality", () => {
  const source = `function documentTextBlockMatches(paragraph, projectedBlock) {
    const properties = paragraph, projectedProperty = projectedBlock, name = "value", propertyIndex = 0;
    return properties[name] === projectedProperty.value;
  }`;
  for (const [leftValue,rightValue,expected] of [[1193046,1193046,true],[1193046,0,false],[1,"1",false],[false,false,true]]) {
    let leftReads=0,rightReads=0;const logs=[];
    const compare = Function("console",instrumentDocumentPropertyComparison(source)+";return documentTextBlockMatches;")({error:(...args)=>logs.push(args)});
    const result=compare({get value(){leftReads++;return leftValue;}},{get value(){rightReads++;return rightValue;}});
    assert.equal(result,expected);assert.equal(leftReads,1);assert.equal(rightReads,1);
    assert.equal(logs.length,expected?0:1);
  }
  // Shipping dist intentionally stays old during private-candidate development.
  // Compile current source in memory rather than editing that default artifact.
  const sourceText=readFileSync(new URL("../packages/breditor-browser/src/wasm_document_json.ts",import.meta.url),"utf8");
  const generated=transformSync("wasm_document_json.ts",sourceText).code;
  assert.ok(instrumentDocumentPropertyComparison(generated).includes("breditor document property rejection"));
  assert.throws(()=>instrumentDocumentPropertyComparison("return true;"));
});
