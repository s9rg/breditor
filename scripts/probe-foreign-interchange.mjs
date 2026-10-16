/** Real foreign fixtures -> opt-in converter -> actual native admission/paste -> exact future recovery. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,realpathSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createRichInterchange} from "@breditor/interchange";
import {compileStandardLayoutRichProfileV3} from "../packages/breditor-experimental-rich-content/index.js";
import {createSharedDocumentEditor} from "../packages/breditor-collaboration/dist/core.js";
import {restoreSharedDocumentEditor} from "../packages/breditor-collaboration/dist/profile.js";
import {coverageSeed,paragraph} from "./fixtures/editor-consumer/coverage-seed.mjs";
const hash=v=>createHash("sha256").update(v).digest("hex");
async function runtime(directory,name){const bytes=readFileSync(resolve(directory,`${name}_bg.wasm`)),module=await import(pathToFileURL(resolve(directory,`${name}.js`)));await module.default({module_or_path:bytes});return{module,sha256:hash(bytes)};}
const fixture=name=>readFileSync(new URL(`../packages/breditor-interchange/tests/fixtures/${name}`,import.meta.url),"utf8");
const schema={name:"example/foreign-interchange",version:1};
const assets=new Map([["https://assets.example/diagram.png",{asset:"diagram-bytes",generation:"v1"}],["https://assets.example/seed.png",{asset:"asset",generation:"gen"}]]);
const options={resolveImage:({src})=>assets.get(src),exportImage:binding=>[...assets].find(([,v])=>v.asset===binding.asset&&v.generation===binding.generation)?.[0]};
const cases=[
 {name:"word",method:"importHtml",source:fixture("word.html")},
 {name:"google-docs",method:"importHtml",source:fixture("google-docs.html")},
 {name:"excel",method:"importHtml",source:fixture("excel.html")},
 {name:"markdown",method:"importMarkdown",source:fixture("everyday.md")},
 {name:"inline",method:"importHtml",source:'<strong>Inline 🙂</strong> <em>日本</em>'},
 {name:"image-caption",method:"importHtml",source:'<figure><img src="https://assets.example/diagram.png" alt="Diagram 🙂" width="200" height="100"><figcaption>A <em>caption</em> 日本</figcaption></figure>'},
 {name:"formats-layout",method:"importHtml",source:'<h3 dir="auto" style="text-align:end;line-height:150%;margin-inline-start:4em">Heading</h3><p><strong>B</strong><em>I</em><u>U</u><s>S</s><code>C</code><sub>D</sub><sup>E</sup><span style="color:#123456;background-color:#abcdef;font-size:16px;font-family:monospace">T</span><a href="https://example.org" target="_blank">L</a></p>'},
 {name:"tasks-code",method:"importHtml",source:'<ul><li><input type="checkbox" checked disabled>Done<ul><li><input type="checkbox" disabled>Nested</li></ul></li><li><input type="checkbox" disabled>Next</li></ul><blockquote><p>A<br>B</p></blockquote><pre><code class="language-rust">let x = "🙂";\n</code></pre><hr>'},
 {name:"whitespace",method:"importHtml",source:'<p style="white-space:pre-wrap">  A\t🙂\n日本\r\nB  </p><p></p><p><span style="white-space:pre-wrap"> leading  </span></p>'},
 {name:"sanitized",method:"importHtml",source:'<p onclick="SECRET">Before<script>SECRET</script><a href="javascript:SECRET">kept</a><span style="background-image:url(SECRET)">after</span></p>'},
];
function ok(result,label){assert.equal(result.ok,true,`${label}: ${JSON.stringify(result)}`);return result.value;}
/** Drop only conversion-owned identities; keep all content, format literals, asset references and base-cell partitions. */
function content(transfer){
 const root=JSON.parse(transfer.structuredJson).document.root;
 function visit(n){if(n.kind==="text")return{text:n.text,formats:n.formats};const p={...n.properties};for(const k of ["block-id","document-id","table-id","row-id","column-id","image-id"])delete p[`breditor/${k}`];
  if(n.type==="breditor/table"){const rows=n.children.map(r=>r.properties["breditor/row-id"]),columns=n.properties["breditor/columns"].map(c=>c.id);p["breditor/columns"]=n.properties["breditor/columns"].map(c=>({width:c.width}));p["breditor/merges"]=n.properties["breditor/merges"].map(m=>({r0:rows.indexOf(m["first-row"]),r1:rows.indexOf(m["last-row"]),c0:columns.indexOf(m["first-column"]),c1:columns.indexOf(m["last-column"])})).sort((a,b)=>a.r0-b.r0||a.c0-b.c0);}
  return{type:n.type,properties:p,children:n.children.map(visit)};
 }return visit(root);
}
function semantic(document){const value=JSON.parse(document);const visit=n=>{for(const m of n.properties?.["breditor/merges"]??[]){delete m.lamport;delete m.writer;delete m.counter;}for(const c of n.children??[])visit(c);};visit(value.root);return value;}
export async function probeForeignInterchange(localDirectory,sharedDirectory){
 const local=await runtime(localDirectory,"breditor_wasm"),shared=await runtime(sharedDirectory,"breditor_shared");
 assert.equal(hash(readFileSync("packages/breditor-experimental-rich-content/dist/breditor_wasm_bg.wasm")),local.sha256);assert.equal(hash(readFileSync("packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm")),shared.sha256);
 const lp=compileStandardLayoutRichProfileV3(local.module,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema,extensions:[]})),sp=shared.module.SharedRichProfile.from_standard_configuration_json_v3(JSON.stringify({format:"breditor/shared-rich-profile",formatVersion:3,schema,extensions:[]}));
 let trials=0,pureStates=0,htmlRounds=0,markdownRounds=0,restores=0,future=0,peerComparisons=0,partitionRounds=0,gridPastes=0,gridRefusals=0;const lossReports={};
 try{
  const source=coverageSeed(lp.descriptor());
  for(const natural of [false,true])for(const sample of cases){
   const b=lp.createDocumentEditor(source),a=createSharedDocumentEditor(sp.create(source,"101"));let ar,br;
   try{
    if(natural){a.enableTypingHistory();b.enableTypingHistory();}const adapters=[createRichInterchange(a,options),createRichInterchange(b,options)];
    a.setReadOnly(true);b.setReadOnly(true);const beforeA=[a.checkpointJson(),a.view(),a.updateFrame()],beforeB=[b.checkpointJson(),b.view()];
    const ca=ok(adapters[0][sample.method](sample.source),`shared ${sample.name}`),cb=ok(adapters[1][sample.method](sample.source),`local ${sample.name}`);assert.deepEqual(ca,cb);if(sample.name==="inline")assert.equal(ca.kind,"text");
    for(const adapter of adapters){
     const html=ok(adapter.exportHtml(cb.structuredJson),`${sample.name} HTML export`),fromHtml=ok(adapter.importHtml(html),`${sample.name} HTML reimport`);assert.deepEqual(content(fromHtml),content(cb),`${sample.name} HTML content`);assert.equal(fromHtml.plainText,cb.plainText);htmlRounds++;
     const md=ok(adapter.exportMarkdown(cb.structuredJson),`${sample.name} Markdown export`),fromMd=ok(adapter.importMarkdown(md),`${sample.name} Markdown reimport`);assert.deepEqual(content(fromMd),content(cb),`${sample.name} Markdown content`);assert.equal(fromMd.plainText,cb.plainText);markdownRounds++;
    }
    lossReports[sample.name]=adapters[1][sample.method](sample.source).losses;assert.deepEqual([a.checkpointJson(),a.view(),a.updateFrame()],beforeA);assert.deepEqual([b.checkpointJson(),b.view()],beforeB);pureStates+=2;
    a.setReadOnly(false);b.setReadOnly(false);a.selectDocument();b.selectDocument();const before=a.documentJson();a.pasteDocumentClipboard(ca.structuredJson,`foreign-${trials}`);b.pasteDocumentClipboard(cb.structuredJson,`foreign-${trials}`);assert.equal(a.view().undoDepth,1);assert.equal(b.view().undoDepth,1);assert.deepEqual(semantic(a.documentJson()),semantic(b.documentJson()));
    ar=createSharedDocumentEditor(restoreSharedDocumentEditor(sp,"room",a.checkpointJson(),natural?"typing-v1":"explicit"));br=natural?lp.restoreDocumentTypingEditor(b.checkpointJson()):lp.restoreDocumentEditor(b.checkpointJson());assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(b.checkpointJson(),br.checkpointJson());restores+=2;
    for(const command of ["undo","redo","undo","redo"]){a[command]();ar[command]();b.execute({kind:command});br.execute({kind:command});assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(b.checkpointJson(),br.checkpointJson());assert.deepEqual(semantic(a.documentJson()),semantic(b.documentJson()));future+=2;if(command==="undo")assert.equal(a.documentJson(),before);}
    trials++;
   }finally{a.dispose();b.dispose();ar?.dispose();br?.dispose();}
  }
  // Covered cells in an existing merge contain distinct text and an image: all partitions must survive.
  const donor=lp.createDocumentEditor(source);try{donor.execute({kind:"setSelection",selection:{kind:"node",block:"table"}});const clip=donor.copyDocument(),adapter=createRichInterchange(donor,options);for(const method of ["exportHtml","exportMarkdown"]){const encoded=ok(adapter[method](clip.structuredJson),method),back=ok(adapter[method==="exportHtml"?"importHtml":"importMarkdown"](encoded),method);assert.deepEqual(content(back),content(clip));assert.equal(back.plainText,clip.plainText);partitionRounds++;}}finally{donor.dispose();}
  for(const natural of [false,true]){
   const a=createSharedDocumentEditor(sp.create(source,"101")),b=lp.createDocumentEditor(source);let ar,br;
   try{
    if(natural){a.enableTypingHistory();b.enableTypingHistory();}
    const selection={kind:"grid",anchor:{table:"t",row:"r0",column:"c0"},focus:{table:"t",row:"r2",column:"c3"}},markup=`<table>${Array.from({length:3},(_,r)=>`<tr>${Array.from({length:4},(_,c)=>`<${r===0?"th":"td"}>Grid ${r}:${c}</${r===0?"th":"td"}>`).join("")}</tr>`).join("")}</table>`;
    a.select(selection);b.execute({kind:"setSelection",selection});const beforeA=a.checkpointJson(),beforeB=b.checkpointJson(),beforeDoc=a.documentJson();
    const ac=createRichInterchange(a,options),bc=createRichInterchange(b,options),wrong=ok(ac.importHtml(fixture("excel.html"),{kind:"grid"}),"grid shape fixture");assert.equal(wrong.kind,"grid");
    assert.throws(()=>a.paste(wrong.structuredJson,{kind:"grid"},`grid-rejected-${natural}`));assert.throws(()=>b.execute({kind:"pasteGridClipboard",data:{clipboardJson:wrong.structuredJson,allocation:{prefix:`grid-rejected-${natural}`,replica:"901",counter:"1",lamport:"100"}}}));assert.equal(a.checkpointJson(),beforeA);assert.equal(b.checkpointJson(),beforeB);gridRefusals+=2;
    const ca=ok(ac.importHtml(markup,{kind:"grid"}),"shared grid"),cb=ok(bc.importHtml(markup,{kind:"grid"}),"local grid");assert.deepEqual(ca,cb);
    a.paste(ca.structuredJson,{kind:"grid"},`grid-${natural}`);b.execute({kind:"pasteGridClipboard",data:{clipboardJson:cb.structuredJson,allocation:{prefix:`grid-${natural}`,replica:"901",counter:"1",lamport:"100"}}});assert.equal(a.view().undoDepth,1);assert.equal(b.view().undoDepth,1);gridPastes+=2;
    ar=createSharedDocumentEditor(restoreSharedDocumentEditor(sp,"room",a.checkpointJson(),natural?"typing-v1":"explicit"));br=natural?lp.restoreDocumentTypingEditor(b.checkpointJson()):lp.restoreDocumentEditor(b.checkpointJson());assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(b.checkpointJson(),br.checkpointJson());restores+=2;
    for(const command of ["undo","redo","undo","redo"]){a[command]();ar[command]();b.execute({kind:command});br.execute({kind:command});assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(b.checkpointJson(),br.checkpointJson());future+=2;if(command==="undo"){assert.equal(a.documentJson(),beforeDoc);assert.equal(b.documentJson(),beforeDoc);}else{assert.ok(a.documentJson().includes("Grid 2:3"));assert.ok(b.documentJson().includes("Grid 2:3"));}}
   }finally{a.dispose();b.dispose();ar?.dispose();br?.dispose();}
  }
  // Shared import is authored only after preparation. Unobserved offline roots and their peer history survive.
  for(const natural of [false,true]){
   const a=createSharedDocumentEditor(sp.create(source,"101")),peer=createSharedDocumentEditor(sp.join_frame("room","202",a.updateFrame()));let ar,pr;
   try{
    if(natural){a.enableTypingHistory();peer.enableTypingHistory();}
    const clip=ok(createRichInterchange(a,options).importHtml(fixture("excel.html")),"offline");
    peer.dispatch({commands:[{kind:"insert_blocks",data:{parent:null,before:null,nodes:[paragraph("peer-root","OFFLINE")]}},{kind:"insert_text",data:{block:"q1",offset:0,text:"PEER"}}]});
    a.selectDocument();a.pasteDocumentClipboard(clip.structuredJson,`offline-${natural}`);await a.receiveFrame(peer.updateFrame());await peer.receiveFrame(a.updateFrame());
    assert.equal(a.documentJson(),peer.documentJson());assert.ok(a.documentJson().includes("OFFLINE"));peerComparisons++;
    ar=createSharedDocumentEditor(restoreSharedDocumentEditor(sp,"room",a.checkpointJson(),natural?"typing-v1":"explicit"));pr=createSharedDocumentEditor(restoreSharedDocumentEditor(sp,"room",peer.checkpointJson(),natural?"typing-v1":"explicit"));
    assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(peer.checkpointJson(),pr.checkpointJson());restores+=2;
    for(const [fromPeer,command]of [[false,"undo"],[false,"redo"],[true,"undo"],[true,"redo"]]){
     const sender=fromPeer?peer:a,shadow=fromPeer?pr:ar,receiver=fromPeer?a:peer,recovered=fromPeer?ar:pr;
     sender[command]();shadow[command]();const frame=sender.updateFrame();await receiver.receiveFrame(frame);await recovered.receiveFrame(frame);
     assert.equal(a.checkpointJson(),ar.checkpointJson());assert.equal(peer.checkpointJson(),pr.checkpointJson());future+=2;
     assert.equal(a.documentJson(),peer.documentJson());if(!fromPeer||command==="redo")assert.ok(a.documentJson().includes("OFFLINE"));if(!fromPeer&&command==="undo")assert.ok(a.documentJson().includes("PEER"));peerComparisons++;
    }
   }finally{a.dispose();peer.dispose();ar?.dispose();pr?.dispose();}
  }
 }finally{lp.dispose();sp.free();}
 assert.equal(trials,20);assert.equal(htmlRounds,40);assert.equal(markdownRounds,40);assert.equal(pureStates,40);assert.equal(restores,48);assert.equal(future,192);assert.equal(partitionRounds,2);assert.equal(peerComparisons,10);assert.equal(gridPastes,4);assert.equal(gridRefusals,4);
 return{format:"breditor/foreign-interchange-functional-probe",formatVersion:1,localWasmSha256:local.sha256,sharedWasmSha256:shared.sha256,trials,pureNativeStates:pureStates,htmlContentRoundTrips:htmlRounds,markdownContentRoundTrips:markdownRounds,exactRestores:restores,exactFutureCheckpoints:future,nonemptyCoveredCellPartitionRoundTrips:partitionRounds,offlinePeerDocumentComparisons:peerComparisons,explicitGridPastes:gridPastes,atomicGridShapeRefusals:gridRefusals,sourceLossReports:lossReports,passed:true,scope:"Pinned inert parsers and compiled opt-in adapter through actual local/shared Wasm admission and atomic document/grid paste: representative Word/Docs/Excel fixtures, nested/tasks/code/images/formatting, exact recovery/future history, preserved merged base-cell partitions and two offline authors. Conversion-owned IDs are excluded only from foreign round-trip comparisons; no checkpoint fields are excluded. No browser-native clipboard, installed-package, IME/accessibility or release qualification."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected paired local/shared Wasm directories");console.log(JSON.stringify(await probeForeignInterchange(...args),null,2));}
