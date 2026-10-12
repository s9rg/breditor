// Reduced argument-transfer experiment, not editor or release qualification.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createServer} from "node:http";
import {readFile, realpath, mkdtemp, writeFile} from "node:fs/promises";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseSync} from "rolldown/utils";
import {webkit} from "playwright-core";
import {verifyFailureBundle} from "./retain-nested-list-failure.mjs";
import {webkitReplayTier} from "./webkit-replay-tier.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.argv.length, 3, "usage: node scripts/probe-retained-bridge-arguments.mjs <retained measurement.json>");
const tier = webkitReplayTier(process.env);
assert.equal(tier.mode, "default", "reduced bridge probe requires default JavaScript tiers");
const repository = await realpath(fileURLToPath(new URL("../", import.meta.url)));
const sourcePath = await realpath(resolve(process.argv[2]));
assert.match(relative(join(repository, "target/nested-list-reproductions"), sourcePath), /^failure-[a-zA-Z0-9]+\/measurement\.json$/u);
const manifest = JSON.parse(await readFile(join(dirname(sourcePath), "retention.json")));
const {source, files} = await verifyFailureBundle(sourcePath, manifest);
const scripts = Object.keys(source.bundleAssets).filter(name => name.endsWith(".js"));
assert.equal(scripts.length, 1);
const script = files[`bundle/assets/${scripts[0]}`].toString("utf8");
const parsed = parseSync("retained.js", script);
assert.deepEqual(parsed.errors, []);
// Pin these exact inspected declarations; fail closed if the control changes.
const declarations = parsed.program.body.filter(node => node.type === "FunctionDeclaration");
const bridge = declarations.filter(node => node.id.name === "z");
const guard = declarations.filter(node => node.id.name === "Ph");
assert.equal(bridge.length, 1); assert.equal(guard.length, 1);
const bridgeCode = script.slice(bridge[0].start, bridge[0].end);
const guardCode = script.slice(guard[0].start, guard[0].end);
assert.equal(bridgeCode, 'function z(e,t,...n){let r=Reflect.apply(e,t,n);if(Ph(r))throw TypeError(`generated scalar method returned a thenable`);return r}');
assert.equal(guardCode, 'function Ph(e){if((typeof e!=`object`||!e)&&typeof e!=`function`)return!1;let t;try{t=e.then}catch{return!0}return t!==void 0&&(Rh(e),!0)}');
const module = `${bridgeCode}\n${guardCode}\n
function Rh(){throw Error("non-primitive result is outside this probe");}
const output=document.getElementById("result");
const receiver=Object.freeze({token:"bridge-probe"});
function observed(parent,ordinal){return String(parent)+"|"+String(ordinal)+"|"+this.token;}
function returnedNumber(parent){return parent;}
try{
  let checks=0;
  // Fractional warm-up probes argument representation only, not valid AST indices.
  const warm=z(observed,receiver,0.5,0.5);
  if(warm!=="0.5|0.5|bridge-probe")throw Error("warm-up mismatch: "+warm);
  for(let index=0;index<10000;index++){
    const parent=index%2===0?634:1587,ordinal=index%3;
    const expected=String(parent)+"|"+String(ordinal)+"|bridge-probe";
    const actual=z(observed,receiver,parent,ordinal);
    if(actual!==expected)throw Error(JSON.stringify({index:String(index),expected,actual}));
    checks++;
    const actualNumber=z(returnedNumber,receiver,parent,ordinal);
    if(!Object.is(actualNumber,parent))throw Error(JSON.stringify({index:String(index),expectedNumber:String(parent),actualNumber:String(actualNumber),actualType:typeof actualNumber}));
    checks++;
    if(index%128===0)await new Promise(resolve=>setTimeout(resolve,4));
  }
  output.textContent=JSON.stringify({checks:String(checks),result:"passed"});output.dataset.status="passed";
}catch(error){output.textContent=String(error);output.dataset.status="failed";}`;
const output = await mkdtemp(join(dirname(sourcePath), "bridge-probe-"));
await writeFile(join(output, "probe.js"), module, {flag: "wx"});
const report = {status: "running", sourcePath, sourceMeasurementSha256: hash(files["measurement.json"]),
  javaScriptTierMode: tier.mode, requestedJavaScriptTierOverrides: tier.overrides,
  bridgeSha256: hash(bridgeCode), guardSha256: hash(guardCode), probeSha256: hash(module),
  releaseQualified: false, rustLoaded: false, wasmLoaded: false, editorLoaded: false,
  scope: "Exact inspected bridge and primitive guard, string- and number-returning mock methods, 4ms task yields; not a production getter, native input or performance qualification", runs: []};
const save = () => writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
await save();
const server = createServer((request, response) => {
  if (request.url === "/") {response.setHeader("Content-Type", "text/html");response.end('<div id="result" data-status="running"></div><script type="module" src="/probe.js"></script>');}
  else if (request.url === "/probe.js") {response.setHeader("Content-Type", "text/javascript");response.end(module);}
  else {response.writeHead(404);response.end();}
});
await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
console.log(JSON.stringify({output}));
try {
  for (let run=0;run<10;run++) {
    let browser;
    const result={run,status:"running",pageErrors:[]};report.runs.push(result);
    try {
      browser=await webkit.launch({env:tier.browserEnvironment});result.version=browser.version();
      const page=await browser.newPage();page.on("pageerror",error=>{if(result.pageErrors.length<16)result.pageErrors.push(String(error));});
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.locator('#result[data-status="passed"],#result[data-status="failed"]').waitFor({timeout:30000});
      result.fixtureStatus=await page.locator("#result").getAttribute("data-status");
      result.details=await page.locator("#result").textContent();
      assert.equal(result.fixtureStatus,"passed",result.details);assert.deepEqual(result.pageErrors,[]);
      assert.equal(JSON.parse(result.details).checks,"20000");result.status="passed";
    }catch(error){result.status="failed";result.error=String(error);}
    finally{await browser?.close();await save();}
    console.log(JSON.stringify({run,status:result.status,details:result.details}));
    if(result.status==="failed")break;
  }
  report.status=report.runs.every(run=>run.status==="passed")?"passed":"failed";
  await verifyFailureBundle(sourcePath, manifest);
  await save();if(report.status==="failed")process.exitCode=1;
}finally{await new Promise(resolveClose=>server.close(resolveClose));}
