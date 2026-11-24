/** Compare a fresh installed native fixture’s measured screen flow with Chromium PDF pages. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync, mkdirSync, readFileSync, realpathSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import {rolldown} from "rolldown";
import {pixel,pixelAsset} from "./fixtures/interchange-consumer/pixel.mjs";
import {sourceEvidence} from "./candidate-release/evidence.mjs";

assert.equal(process.platform,"darwin","The optional PDF comparison uses macOS PDFKit");
const root = fileURLToPath(new URL("../",import.meta.url));
const target = join(root,"target");
const source = sourceEvidence(root);
const install = JSON.parse(readFileSync(join(target,"interchange-installed-consumer.json"),"utf8"));
assert.equal(install.format,"breditor/interchange-installed-consumer");
assert.equal(install.passed,true);
assert.equal(install.workspaceLinks,false);
const consumer = realpathSync(install.consumer);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const required = ["@breditor/editor","@breditor/experimental-rich-content"];
const archives = required.map(name=>{
  const archive = install.archives.find(candidate=>candidate.name===name);
  assert.ok(archive);
  assert.equal(digest(readFileSync(archive.path)),archive.sha256,`Installed archive changed: ${name}`);
  assert.ok(realpathSync(join(consumer,"node_modules",name)).startsWith(`${consumer}/node_modules/`));
  return {name,sha256:archive.sha256};
});
for(const [name,filename] of [["breditor-editor","static_document.js"],["breditor-experimental-rich-content","browser/print.js"]]){
  const distFile = join("dist",filename);
  assert.ok(readFileSync(join(root,"packages",name,distFile)).equals(
    readFileSync(join(consumer,"node_modules/@breditor",name.slice("breditor-".length),distFile))),`Compiled ${filename} differs from the installed file`);
}
const wasm = readFileSync(join(consumer,"node_modules/@breditor/experimental-rich-content/dist/breditor_wasm_bg.wasm"));
assert.equal(digest(wasm),install.functionalProbe.localWasmSha256);

const entry = join(consumer,"measured-print-output.mjs");
copyFileSync(join(root,"scripts/fixtures/interchange-consumer/measured-print-output.mjs"),entry);
const bundle = await rolldown({input:entry,platform:"browser",logLevel:"silent"});
const {output} = await bundle.generate({format:"esm",codeSplitting:false});
await bundle.close();
assert.equal(output.length,1);

const fixtureOrigin = "http://127.0.0.1:49839";
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;font:14px/20px Menlo,monospace} p,figure{margin:0} table{width:100%;border-collapse:collapse}
tr{height:80px} figure img{display:block;object-fit:fill} .breditor-page-break{min-height:1px}
</style><main data-breditor-rich></main><script type="module" src="/fixture.mjs"></script>`;
const readPdfPages = `function run(args) {
  ObjC.import('PDFKit');
  const file = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(args[0]));
  const pages = [];
  for (let index=0; index<file.pageCount; index++) pages.push(ObjC.unwrap(file.pageAtIndex(index).string));
  return JSON.stringify(pages);
}`;
const pdfRoot = join(target,"measured-print-output");
mkdirSync(pdfRoot,{recursive:true});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route(`${fixtureOrigin}/**`,route=>{
    const path = new URL(route.request().url()).pathname;
    if(path==="/")return route.fulfill({contentType:"text/html",body:html});
    if(path==="/fixture.mjs")return route.fulfill({contentType:"text/javascript",body:output[0].code});
    if(path==="/fixture.wasm")return route.fulfill({contentType:"application/wasm",body:wasm});
    return route.abort();
  });
  await page.goto(fixtureOrigin);
  await page.waitForFunction(()=>typeof globalThis.createMeasuredPrintFixture==="function");
  const native = await page.evaluate(async raster=>{
    let fixture;
    try { fixture = await globalThis.createMeasuredPrintFixture(raster); }
    catch(error){throw Error(`Native print fixture failed (${error.code??"unknown"}): ${error.message}`,{cause:error});}
    const {show,...native} = fixture;
    globalThis.showMeasuredPrintFixture = show;
    return native;
  },{asset:pixelAsset,raster:`data:image/png;base64,${pixel.toString("base64")}`});
  assert.deepEqual(native,{undone:true,reopened:true,journalExact:true,redoPreserved:true,edited:true,resized:true,hadHistory:true});
  const results = {};
  const expectedRows = Array.from({length:16},(_,index)=>String(index+1).padStart(2,"0"));
  for(const scenario of ["initial","edited","undone","resized","reopened"]){
    const screen = await page.evaluate(name=>globalThis.showMeasuredPrintFixture(name),scenario);
    assert.equal(screen.measurementPreserved,true);
    const path = join(pdfRoot,`${scenario}.pdf`);
    const pdf = await page.pdf({path,preferCSSPageSize:true});
    const pages = JSON.parse(execFileSync("/usr/bin/osascript",["-l","JavaScript","-e",readPdfPages,path],{encoding:"utf8",timeout:10000}));
    const forcedIndex = screen.measured.pages.findIndex(page=>page.reason==="forced");
    assert.equal(pages.length,screen.measured.pages.length,scenario);
    assert.ok(forcedIndex>0);
    assert.ok(pages[0].includes("BeforeForcedBreak"));
    assert.ok(pages.slice(0,forcedIndex).every(text=>!text.includes("AfterForcedBreak")));
    assert.ok(pages[forcedIndex].includes("AfterForcedBreak"));
    assert.ok(pages.slice(forcedIndex).every(text=>text.includes("RepeatFixtureHeader")));
    const rowsPerPage = pages.map(text=>[...text.matchAll(/FixtureRow(\d{2})/g)].map(match=>match[1]));
    assert.deepEqual(rowsPerPage.flat(),expectedRows,scenario);
    assert.equal(rowsPerPage.at(-1).at(-1),"16");
    results[scenario]={screen:screen.measured,rasterHeight:screen.rasterHeight,pdfPages:pages.length,
      forcedPage:forcedIndex+1,repeatedHeaderPages:pages.length-forcedIndex,rowsPerPage:rowsPerPage.map(rows=>rows.length),pdfSha256:digest(pdf)};
  }
  assert.deepEqual(results.undone.screen,results.initial.screen);
  assert.deepEqual(results.reopened.screen,results.initial.screen);
  assert.ok(results.edited.pdfPages>results.initial.pdfPages);
  assert.ok(results.resized.rasterHeight>results.initial.rasterHeight);
  assert.ok(results.resized.screen.pages.find(page=>page.reason==="forced").topCssPx>
    results.initial.screen.pages.find(page=>page.reason==="forced").topCssPx);
  assert.deepEqual(sourceEvidence(root),source);
  const evidence={format:"breditor/measured-print-output",formatVersion:1,source,browser:browser.version(),font:"Menlo 14px/20px",
    os:execFileSync("/usr/bin/sw_vers",["-productVersion"],{encoding:"utf8"}).trim(),
    wasmSha256:digest(wasm),archives,native,results};
  writeFileSync(join(target,"measured-print-output.json"),JSON.stringify(evidence,null,2)+"\n");
  console.log(JSON.stringify(evidence,null,2));
} finally {await browser.close();}
