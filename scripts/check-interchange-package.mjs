/** Install packed archives offline; replay the same native/SDK/React probe without workspace links. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {cpSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {build} from "vite";
import {installedArchiveDigests} from "./installed-archive-digests.mjs";
import {sourceEvidence} from "./candidate-release/evidence.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),temporary=mkdtempSync(join(tmpdir(),"breditor-interchange-consumer-")),archives=join(temporary,"archives"),consumer=join(temporary,"consumer");
const source=sourceEvidence(root);
const run=(command,args,cwd=root)=>execFileSync(command,args,{cwd,stdio:"inherit"});
for(const name of ["breditor-experimental-rich-content","breditor-collaboration","breditor-editor","breditor-interchange"])run(process.execPath,["node_modules/typescript/bin/tsc","-p",`packages/${name}/tsconfig.json`]);
mkdirSync(archives);cpSync(join(root,"scripts/fixtures/interchange-consumer"),consumer,{recursive:true});
const names=["@breditor/browser","@breditor/experimental-rich-content","@breditor/collaboration","@breditor/editor","@breditor/interchange"],packs=JSON.parse(execFileSync("npm",["pack","--ignore-scripts","--json","--pack-destination",archives,...names.flatMap(name=>["--workspace",name])],{cwd:root,encoding:"utf8"}));
const archiveEvidence=installedArchiveDigests(archives,packs,names);
const paths=archiveEvidence.map(({filename})=>join(archives,filename));
run("npm",["install","--offline","--ignore-scripts","--no-audit","--no-fund","--package-lock=false",...paths,"react@19.2.8","react-dom@19.2.8","@types/react@19.2.18","jsdom@29.1.1","fake-indexeddb@6.2.6"],consumer);
for(const name of names){const installed=realpathSync(join(consumer,"node_modules",name));assert.ok(installed.startsWith(`${realpathSync(consumer)}/node_modules/`),`Workspace link escaped installed proof: ${name}`);}
run(process.execPath,[join(root,"node_modules/typescript/bin/tsc"),"--noEmit","--strict","--exactOptionalPropertyTypes","--target","ES2022","--module","NodeNext","--lib","ES2022,DOM","--types","react","types.ts"],consumer);
const adapter=join(consumer,"node_modules/@breditor/interchange");
const adapterManifest=JSON.parse(readFileSync(join(adapter,"package.json"),"utf8"));
const rootManifest=JSON.parse(readFileSync(join(root,"package.json"),"utf8"));
assert.equal(adapterManifest.license,rootManifest.license,"Installed interchange license expression differs from the workspace");
for(const filename of ["LICENSE-MIT","LICENSE-APACHE"]){
 assert.ok(readFileSync(join(adapter,filename)).equals(readFileSync(join(root,filename))),
  `Installed interchange ${filename} differs from the canonical license`);
}
run(process.execPath,["docx-runtime.mjs"],consumer);
cpSync(join(root,"crates/breditor-core/tests/fixtures/pre-v4"),join(consumer,"pre-v4"),{recursive:true});
const historicalRichReaders=JSON.parse(execFileSync(process.execPath,["historical-rich-readers.mjs"],{cwd:consumer,encoding:"utf8",timeout:10000}));
assert.equal(historicalRichReaders.passed,true);
assert.deepEqual(historicalRichReaders.fixtures.map(({language,historySteps,crossProfileRefusals})=>[language,historySteps,crossProfileRefusals]),[[1,11,3],[2,11,3],[3,11,3]]);
// These are generated test artifacts, not modified product source. Only import/resource paths change.
let probe=readFileSync(join(root,"scripts/probe-browser-interchange.mjs"),"utf8");
const replacements=[
 ['"../packages/breditor-editor/dist/index.js"','"@breditor/editor"'],['"../packages/breditor-editor/dist/collaboration.js"','"@breditor/editor/collaboration"'],
 ['"../packages/breditor-editor/dist/react.js"','"@breditor/editor/react"'],['"../packages/breditor-editor/dist/shared_react.js"','"@breditor/editor/collaboration/react"'],
 ['"../packages/breditor-interchange/dist/index.js"','"@breditor/interchange"'],['"./fixtures/editor-consumer/coverage-seed.mjs"','"./coverage-seed.mjs"'],
 ['"../packages/breditor-interchange/dist/xml.js"','"@breditor/interchange/xml"'],
 ['new URL("../packages/breditor-experimental-rich-content/dist/breditor_wasm_bg.wasm",import.meta.url)','new URL(import.meta.resolve("@breditor/experimental-rich-content/wasm-binary"))'],
 ['new URL("../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm",import.meta.url)','new URL(import.meta.resolve("@breditor/collaboration/wasm-binary"))'],
 ['"../packages/breditor-interchange/tests/fixtures/word.html"','"./word.html"']
];
for(const [before,after]of replacements){assert.equal(probe.split(before).length,2,`Expected one exact resource mapping: ${before}`);probe=probe.replace(before,after);}assert.ok(!probe.includes("../packages/"));
writeFileSync(join(consumer,"probe.mjs"),probe);cpSync(join(root,"scripts/fixtures/editor-consumer/coverage-seed.mjs"),join(consumer,"coverage-seed.mjs"));cpSync(join(root,"packages/breditor-interchange/tests/fixtures/word.html"),join(consumer,"word.html"));
const result=JSON.parse(execFileSync(process.execPath,["probe.mjs",join(consumer,"node_modules/@breditor/experimental-rich-content/dist"),join(consumer,"node_modules/@breditor/collaboration/dist/runtime")],{cwd:consumer,encoding:"utf8",timeout:360000,maxBuffer:1024*1024}));assert.equal(result.passed,true);
assert.equal(historicalRichReaders.wasmSha256,result.localWasmSha256);
const modules={};
for(const [name,entry] of [["default","default-entry.ts"],["interchange","interchange-entry.ts"],["docx","docx-entry.ts"],["xml","xml-entry.ts"]]){
 const bundle=await build({configFile:false,root:consumer,logLevel:"error",build:{target:"es2022",write:false,minify:false,lib:{entry:join(consumer,entry),formats:["es"],fileName:name}}});
 const outputs=(Array.isArray(bundle)?bundle:[bundle]).flatMap(b=>b.output);
 modules[name]=outputs.filter(o=>o.type==="chunk").flatMap(o=>Object.keys(o.modules));
 assert.ok(modules[name].length>0);
}
const foreign=id=>/node_modules\/(?:parse5|markdown-it|css-tree)\//.test(id);assert.ok(!modules.default.some(foreign),"Default editor must not import the foreign parser graph");for(const name of ["parse5","markdown-it","css-tree"])assert.ok(modules.interchange.some(id=>id.includes(`/node_modules/${name}/`)),`Explicit adapter bundle must include ${name}`);
const docxForeignParserModules=modules.docx.filter(foreign).length;
assert.equal(docxForeignParserModules,0,"The installed DOCX entry must not import the HTML or Markdown parser graph");
const xmlForeignParserModules=modules.xml.filter(foreign).length;
assert.equal(xmlForeignParserModules,0,"The installed XML entry must not import the HTML or Markdown parser graph");
assert.equal(result.xmlExports,2,"Expected XML export from cold-restored native local and shared editors");
assert.equal(result.documentXmlExports,2,"Expected source-bound XML from cold-restored native local and shared editors");
assert.deepEqual(installedArchiveDigests(archives,packs,names),archiveEvidence,"Installed archives changed during qualification");
assert.deepEqual(sourceEvidence(root),source,"Source files changed during the installed probe");
const report={format:"breditor/interchange-installed-consumer",formatVersion:1,passed:true,source,consumer,archives:archiveEvidence.map((archive,i)=>({...archive,path:paths[i]})),installedInterchangeLicenses:true,strictConsumerTypes:true,workspaceLinks:false,defaultForeignParserModules:modules.default.filter(foreign).length,optInForeignParserModules:modules.interchange.filter(foreign).length,docxForeignParserModules,xmlForeignParserModules,installedDocxExport:true,historicalRichReaders,functionalProbe:{...result,scope:"Installed archives with bare package imports and bundled paired Wasm; compiled managed SDK/React synthetic DOM/clipboard/IDB/locks. Not OS clipboard, captured Office applications, cross-browser, IME, accessibility or release qualification."}};
mkdirSync(join(root,"target"),{recursive:true});
writeFileSync(join(root,"target/interchange-installed-consumer.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
