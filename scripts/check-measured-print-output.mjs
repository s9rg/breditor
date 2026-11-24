/** Compare a fresh installed native fixture’s measured screen flow with Chromium PDF pages. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync} from "node:fs";
import {join, relative} from "node:path";
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
assert.deepEqual(install.source,source,"Build the installed interchange consumer from this source first");
const consumer = realpathSync(install.consumer);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const required = ["@breditor/browser","@breditor/editor","@breditor/experimental-rich-content"];
const archives = required.map(name=>{
  const archive = install.archives.find(candidate=>candidate.name===name);
  assert.ok(archive);
  assert.equal(digest(readFileSync(archive.path)),archive.sha256,`Installed archive changed: ${name}`);
  assert.ok(realpathSync(join(consumer,"node_modules",name)).startsWith(`${consumer}/node_modules/`));
  return {name,path:archive.path,sha256:archive.sha256};
});
const installedScope = join(consumer,"node_modules/@breditor");
const wasmPath = join(installedScope,"experimental-rich-content/dist/breditor_wasm_bg.wasm");
const wasm = readFileSync(wasmPath);
assert.equal(digest(wasm),install.functionalProbe.localWasmSha256);

const entry = join(consumer,"measured-print-output.mjs");
copyFileSync(join(root,"scripts/fixtures/interchange-consumer/measured-print-output.mjs"),entry);
const bundle = await rolldown({input:entry,platform:"browser",logLevel:"silent"});
const {output} = await bundle.generate({format:"esm",codeSplitting:false});
await bundle.close();
assert.equal(output.length,1);
const archiveProof = mkdtempSync(join(target,"print-archive-check-"));
try {
  const packed = new Map();
  for(const archive of archives){
    const name = archive.name.slice("@breditor/".length);
    const directory = join(archiveProof,name);
    mkdirSync(directory);
    execFileSync("/usr/bin/tar",["-xf",archive.path,"-C",directory],{timeout:10000});
    packed.set(name,join(directory,"package"));
  }
  const installedModules = Object.keys(output[0].modules).filter(path=>path!==entry&&path!=="\0rolldown/runtime.js");
  assert.ok(installedModules.every(path=>path.startsWith(`${installedScope}/`)),"Bundle used a module outside the installed archives");
  assert.ok(installedModules.includes(join(installedScope,"experimental-rich-content/dist/browser/print.js")));
  assert.ok(installedModules.includes(join(installedScope,"editor/dist/static_document.js")));
  for(const path of [...installedModules,wasmPath]){
    assert.equal(realpathSync(path),path,`Installed module is a symlink: ${path}`);
    const modulePath = relative(installedScope,path);
    const [name,...parts] = modulePath.split("/");
    assert.ok(packed.has(name),`Evidence uses an unpinned archive: ${name}`);
    assert.ok(readFileSync(path).equals(readFileSync(join(packed.get(name),...parts))),`Installed ${modulePath} differs from its archive`);
  }
} finally {rmSync(archiveProof,{recursive:true,force:true});}

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
const pdfRoot = mkdtempSync(join(target,"measured-print-output-"));
const runningHeader = 'Release handoff "PDF" <proof>';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route("**/*",route=>{
    const {origin,pathname:path} = new URL(route.request().url());
    if(origin!==fixtureOrigin)return route.abort();
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
  },{asset:pixelAsset,raster:`data:image/png;base64,${pixel.toString("base64")}`,runningHeader});
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
    for(const [index,text] of pages.entries()){
      assert.equal(text.replace(/\s+/g," ").split(runningHeader).length,2,`Expected one running header on ${scenario} page ${index+1}`);
      const counters=[...text.matchAll(/\b(\d+)\s*\/\s*(\d+)\b/g)].map(match=>[Number(match[1]),Number(match[2])]);
      assert.deepEqual(counters,[[index+1,pages.length]],`${scenario} page counter`);
    }
    assert.ok(forcedIndex>0);
    assert.ok(pages[0].includes("BeforeForcedBreak"));
    assert.ok(pages.slice(0,forcedIndex).every(text=>!text.includes("AfterForcedBreak")));
    assert.ok(pages[forcedIndex].includes("AfterForcedBreak"));
    assert.ok(pages.slice(forcedIndex).every(text=>text.includes("RepeatFixtureHeader")));
    const rowsPerPage = pages.map(text=>[...text.matchAll(/FixtureRow(\d{2})/g)].map(match=>match[1]));
    assert.ok(rowsPerPage.slice(0,forcedIndex).every(rows=>rows.length===0));
    assert.deepEqual(rowsPerPage.flat(),expectedRows,scenario);
    assert.equal(rowsPerPage.at(-1).at(-1),"16");
    results[scenario]={screen:screen.measured,rasterHeight:screen.rasterHeight,pdfPages:pages.length,
      forcedPage:forcedIndex+1,runningHeaderPages:pages.length,numberedPages:pages.length,
      repeatedHeaderPages:pages.length-forcedIndex,rowsPerPage:rowsPerPage.map(rows=>rows.length),
      pdfPath:relative(target,path),pdfSha256:digest(pdf)};
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
    wasmSha256:digest(wasm),archives:archives.map(({name,sha256})=>({name,sha256})),native,results};
  const pendingReceipt = join(pdfRoot,"measured-print-output.json");
  writeFileSync(pendingReceipt,JSON.stringify(evidence,null,2)+"\n");
  renameSync(pendingReceipt,join(target,"measured-print-output.json"));
  console.log(JSON.stringify(evidence,null,2));
} finally {await browser.close();}
