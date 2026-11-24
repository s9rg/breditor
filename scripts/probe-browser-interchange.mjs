/** Compiled SDK/React + real paired Wasm; synthetic DOM, clipboard stores, IDB and locks only. */
import assert from "node:assert/strict";
import {readFileSync,realpathSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {JSDOM} from "jsdom";
import {IDBFactory} from "fake-indexeddb";
import {createElement,createRef,act,StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {initializeLocalRuntime,createLayoutLocalProfileV3,openLocalEditor,openLocalDocumentEditor} from "../packages/breditor-editor/dist/index.js";
import {initializeSharedRuntime,createLayoutSharedProfileV3,openSharedEditor,openSharedDocumentEditor} from "../packages/breditor-editor/dist/collaboration.js";
import {BreditorEditor,BreditorDocumentEditor} from "../packages/breditor-editor/dist/react.js";
import {BreditorSharedEditor,BreditorSharedDocumentEditor} from "../packages/breditor-editor/dist/shared_react.js";
import {coverageSeed,range,grid} from "./fixtures/editor-consumer/coverage-seed.mjs";
const mime="application/x-breditor-rich+json",hash=b=>createHash("sha256").update(b).digest("hex");
function clipboard(window,surface,kind,initial={},drop,files=[]){const values=new Map(Object.entries(initial)),event=new window.Event(kind,{bubbles:true,cancelable:true});Object.defineProperty(event,"clipboardData",{value:{files,get types(){return [...values.keys()];},getData:k=>values.get(k)??"",setData:(k,v)=>{if(k!==drop)values.set(k,v);}}});surface.dispatchEvent(event);assert.equal(event.defaultPrevented,true);return values;}
function lockFixture(){const held=new Set();return{held,request(name,options,callback){assert.deepEqual(options,{mode:"exclusive",ifAvailable:true});const occupied=held.has(name);if(!occupied)held.add(name);return Promise.resolve().then(()=>callback(occupied?null:{name,mode:"exclusive"})).finally(()=>{if(!occupied)held.delete(name);});}};}
async function ready(ref){for(let i=0;i<500;i++){if(ref.current?.getEditor())return ref.current.getEditor();await act(async()=>{await new Promise(setImmediate);});}throw Error("React interchange owner did not become ready");}
export async function probeBrowserInterchange(localDirectory,sharedDirectory){
 // Node 22's require(ESM) bridge in jsdom must finish loading parse5 before the adapter's ESM graph.
 const {createRichInterchange}=await import("../packages/breditor-interchange/dist/index.js");
 const {documentXmlContractV1,exportDocumentXml,exportXml,xmlContractV1}=await import("../packages/breditor-interchange/dist/xml.js");
 const localBytes=readFileSync(resolve(localDirectory,"breditor_wasm_bg.wasm")),sharedBytes=readFileSync(resolve(sharedDirectory,"breditor_shared_bg.wasm"));
 assert.equal(hash(localBytes),hash(readFileSync(new URL("../packages/breditor-experimental-rich-content/dist/breditor_wasm_bg.wasm",import.meta.url))));assert.equal(hash(sharedBytes),hash(readFileSync(new URL("../packages/breditor-collaboration/dist/runtime/breditor_shared_bg.wasm",import.meta.url))));
 const realm=new JSDOM("<!doctype html><body></body>",{pretendToBeVisual:true}),{window}=realm,saved=new Map(),locks=lockFixture(),globals={window,document:window.document,indexedDB:new IDBFactory(),navigator:{locks},IS_REACT_ACT_ENVIRONMENT:true};
 for(const name of ["HTMLElement","HTMLInputElement","HTMLSelectElement","Node","Element","AbortController"])globals[name]=window[name];for(const [name,value]of Object.entries(globals)){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});}
 let serial=0,pastes=0,restores=0,future=0,retentionRefusals=0,priorityCases=0,staleRefusals=0,cutCases=0,readOnlyCases=0,reactOwners=0,queuedReports=0,failedConversions=0,durableResumes=0,assetCases=0,xmlExports=0,documentXmlExports=0;
 const host=()=>{const h=window.document.createElement("div");window.document.body.append(h);return h;},close=async editor=>{if(editor?.core)await editor.close();else editor?.dispose();},opener=(shared,document)=>shared?(document?openSharedDocumentEditor:openSharedEditor):(document?openLocalDocumentEditor:openLocalEditor);
 const select=(editor,selection)=>{window.document.getSelection().removeAllRanges();if(selection.kind==="document")editor.selectDocument();else if(editor.core)editor.select(selection,false);else editor.execute({kind:"setSelection",selection},false);};
 const history=(editor,kind)=>editor.core?editor.core[kind]():editor.execute({kind});
 const assetOptions={resolveImage:({src})=>src==="https://example.test/image.png"?{asset:"owned-asset",generation:"owned-generation"}:undefined,exportImage:({asset})=>asset==="owned-asset"?"https://example.test/image.png":undefined};
 let lp,sp;
 try{
  await initializeLocalRuntime(localBytes);await initializeSharedRuntime(sharedBytes);lp=await createLayoutLocalProfileV3();sp=await createLayoutSharedProfileV3();
  for(const shared of [false,true])for(const document of [false,true])for(const natural of [false,true]){
   const source=coverageSeed(shared?JSON.parse(sp.descriptor_json()):lp.descriptor()),settings={richLanguage:3,history:natural?"typing-v1":"explicit",rangeEditing:"general-v1",...(document?{selectionEditing:"document-v1"}:{}),...(shared?{room:"room",writer:"101"}:{})};
   const cases=[{name:"inline",selection:range("q1",1),values:{"text/html":"<b>Foreign 🙂</b>","text/markdown":"ignored", "text/plain":"ignored"},expected:"Foreign 🙂"},
    {name:"general",selection:range("q1",1,"head",2),values:{"text/markdown":"## Heading\n\n- Item one\n- Item two"},expected:"Heading"},
    {name:"caption",selection:range("caption",1,"caption",2),values:{"text/html":"<ul data-foreign='discard'><li>Caption paste</li></ul>"},expected:"Caption paste",projection:"caption"},
    {name:"code",selection:range("code",1,"code",4),values:{"text/html":"<table><tr><td><b>Code paste</b></td></tr></table>"},expected:"Code paste",projection:"code"},
    {name:"grid",selection:grid("r2","c2"),values:{"text/html":"<table><tr><td><b>Cell 🙂</b></td></tr></table>"},expected:"Cell 🙂"},
    ...(document?[{name:"document",selection:{kind:"document"},values:{"text/html":readFileSync(new URL("../packages/breditor-interchange/tests/fixtures/word.html",import.meta.url),"utf8")}}]:[])];
   for(const item of cases){const root=host(),recoveryHost=host(),reports=[],losses=[],errors=[],options={...settings,host:root,database:`interchange-${serial++}`,clipboardInterchange:core=>createRichInterchange(core,assetOptions),onInterchange:r=>reports.push(r),onPasteLoss:r=>losses.push(r),onError:e=>errors.push(e)};let editor,recovered;
    try{editor=await opener(shared,document)({...options,initial:{kind:"document",documentJson:source}});select(editor,item.selection);const before=editor.view().documentJson,revision=editor.view().revision;clipboard(window,editor.surface,"paste",item.values);assert.deepEqual(errors,[],`${shared}/${document}/${natural}/${item.name}: ${errors}`);assert.equal(reports.length,1);assert.equal(reports[0].operation,"paste");assert.equal(reports[0].sourceRevision,revision);assert.equal(reports[0].formats[0].kind,item.values["text/html"]?"html":"markdown");assert.equal(editor.view().undoDepth,1);assert.notEqual(editor.view().documentJson,before);if(item.expected)assert.ok(editor.view().documentJson.includes(item.expected));if(item.projection){assert.equal(losses.length,1);assert.equal(reports[0].destination.target,item.projection);assert.ok(reports[0].destination.losses.includes("block-structure"));assert.ok(editor.status.textContent.includes(`text into ${item.projection}`));if(item.name==="caption")assert.ok(editor.status.textContent.includes("unsupported-attribute"));}else assert.equal(losses.length,0);
     const exact=editor.checkpointJson(),recoveryInitial={kind:document?(natural?"documentTypingCheckpoint":"documentCheckpoint"):(shared?natural?"generalTypingCheckpoint":"generalCheckpoint":natural?"typingCheckpoint":"checkpoint"),checkpointJson:exact};
     const expected=[];for(const command of ["undo","redo","undo","redo"]){history(editor,command);expected.push(editor.checkpointJson());if(command==="undo")assert.equal(editor.view().documentJson,before);}const durable=editor.checkpointJson();
     // Never clone a live causal writer into a second managed session, even in another database.
     if(shared){await close(editor);editor=undefined;}
     recovered=await opener(shared,document)({...options,host:recoveryHost,database:`interchange-${serial++}`,onInterchange:()=>{},onPasteLoss:()=>{},initial:recoveryInitial});assert.equal(recovered.checkpointJson(),exact);restores++;
     for(const [i,command]of ["undo","redo","undo","redo"].entries()){history(recovered,command);assert.equal(recovered.checkpointJson(),expected[i]);future++;}
     if(shared){await close(recovered);recovered=undefined;editor=await opener(shared,document)({...options,initial:{kind:"resume"}});assert.equal(editor.recovered,true);assert.equal(editor.checkpointJson(),durable);durableResumes++;}pastes++;
    }finally{await close(recovered);await close(editor);root.remove();recoveryHost.remove();}
   }
   const root=host(),reports=[],errors=[],options={...settings,host:root,database:`interchange-${serial++}`,clipboardInterchange:core=>createRichInterchange(core,assetOptions),onInterchange:r=>reports.push(r),onError:e=>errors.push(e)};let editor;
   try{editor=await opener(shared,document)({...options,initial:{kind:"document",documentJson:source}});const initialDocument=editor.view().documentJson;select(editor,range("q1",0,"q1",5));const exact=editor.checkpointJson(),values=clipboard(window,editor.surface,"copy");assert.equal(editor.checkpointJson(),exact);assert.equal(reports.pop().operation,"copy");for(const type of ["text/plain",mime,"text/html","text/markdown"])assert.ok(values.has(type));assert.equal(values.get("text/plain"),"Quote");
    for(const drop of ["text/plain",mime,"text/html","text/markdown"]){clipboard(window,editor.surface,"cut",{},drop);assert.equal(editor.checkpointJson(),exact);assert.equal(reports.length,0);assert.equal(errors.length,1);assert.match(String(errors.pop()),/nothing was cut/);retentionRefusals++;}
    clipboard(window,editor.surface,"cut");assert.equal(editor.view().undoDepth,1);assert.equal(reports.pop().operation,"cut");history(editor,"undo");assert.equal(editor.view().documentJson,initialDocument);cutCases++;
    select(editor,range("q1",0));clipboard(window,editor.surface,"paste",{[mime]:values.get(mime),"text/html":"<p>must never parse</p>"});assert.equal(reports.length,0);assert.ok(!editor.view().documentJson.includes("must never parse"));history(editor,"undo");priorityCases++;
    for(const incoming of [{[mime]:"invalid", "text/html":"<p>fallback forbidden</p>","text/plain":"fallback forbidden"},{"text/html":"", "text/plain":"fallback forbidden"}]){const before=editor.checkpointJson();clipboard(window,editor.surface,"paste",incoming);assert.equal(editor.checkpointJson(),before);assert.equal(reports.length,0);assert.equal(errors.length,1);errors.pop();failedConversions++;}
    select(editor,range("q1",0));clipboard(window,editor.surface,"paste",{"text/plain":"**literal**"});assert.equal(reports.length,0);assert.ok(editor.view().documentJson.includes("**literal**"));history(editor,"undo");priorityCases++;
    // Advertised foreign structure wins over an accompanying file; bytes require an explicit registry.
    clipboard(window,editor.surface,"paste",{"text/html":"<figure><img src='https://example.test/image.png' alt='Owned image'><figcaption>Owned caption</figcaption></figure>"},undefined,[new window.File(["fixture"],"companion.png")]);assert.equal(errors.length,0);assert.equal(reports.pop().operation,"paste");assert.ok(editor.view().documentJson.includes("owned-asset"));assert.ok(editor.view().documentJson.includes("Owned caption"));history(editor,"undo");assetCases++;priorityCases++;
    editor.setReadOnly(true);select(editor,range("q1",0,"q1",5));const readOnlyExact=editor.checkpointJson();clipboard(window,editor.surface,"cut");assert.equal(reports.pop().operation,"copy");clipboard(window,editor.surface,"paste",{"text/html":"<p>forbidden</p>"});assert.equal(editor.checkpointJson(),readOnlyExact);assert.equal(reports.length,0);editor.setReadOnly(false);readOnlyCases++;
   }finally{await close(editor);root.remove();}
   // Host conversion callbacks cannot retarget a paste to a newer selection/publication.
   {const root=host(),errors=[],reports=[];let editor;try{editor=await opener(shared,document)({...settings,host:root,database:`interchange-${serial++}`,initial:{kind:"document",documentJson:source},onError:e=>errors.push(e),onInterchange:r=>reports.push(r),clipboardInterchange:core=>{const adapter=createRichInterchange(core);return{...adapter,importHtml:(...args)=>{const value=adapter.importHtml(...args);select(editor,range("q2",0));return value;}};}});const before=editor.view().documentJson;select(editor,range("q1",0));clipboard(window,editor.surface,"paste",{"text/html":"<b>stale insertion</b>"});assert.equal(editor.view().documentJson,before);assert.equal(reports.length,0);assert.equal(errors.length,1);assert.match(String(errors[0]),/stale|older/i);staleRefusals++;}finally{await close(editor);root.remove();}}
   // Local queued publication acknowledgement is not an eager success callback.
   if(!shared){for(const stale of [false,true]){const root=host(),errors=[],reports=[];let editor,armed=false,queued=false;try{editor=await opener(false,document)({...settings,host:root,initial:{kind:"document",documentJson:source},clipboardInterchange:createRichInterchange,onInterchange:r=>reports.push(r),onError:e=>errors.push(e),onChange:()=>{if(!armed)return;armed=false;if(stale)editor.execute({kind:"setSelection",selection:range("q2",0)},false);clipboard(window,editor.surface,"paste",{"text/html":"<b>Queued paste</b>"});assert.equal(reports.length,0);queued=true;}});select(editor,range("q1",0));armed=true;editor.execute({kind:"insertPlainText",text:"First"});assert.equal(queued,true);assert.equal(reports.length,stale?0:1);assert.equal(errors.length,stale?1:0);assert.equal(editor.view().documentJson.includes("Queued paste"),!stale);queuedReports++;}finally{await close(editor);root.remove();}}}
  }
  for(const shared of [false,true]){
   const container=host(),recoveryHost=host(),errors=[];
   const source=coverageSeed(shared?JSON.parse(sp.descriptor_json()):lp.descriptor());
   let owner,editor,recovered;
   const options={richLanguage:3,rangeEditing:"general-v1",history:"explicit",selectionEditing:"document-v1",
    ...(shared?{room:"room",writer:"101",database:`interchange-xml-${serial++}`}:{}),
    clipboardInterchange:core=>{owner=core;return createRichInterchange(core,assetOptions);},onError:error=>errors.push(error)};
   try{
    editor=await opener(shared,true)({...options,host:container,initial:{kind:"document",documentJson:source}});
    select(editor,{kind:"document"});
    clipboard(window,editor.surface,"paste",{"text/html":
     '<p><strong>日本 &amp; &lt; &gt; "quoted" 🙂</strong></p><ol><li>First<ul><li>Child</li></ul></li></ol>'+
     '<table><tr><th>Head</th><td>Cell</td></tr></table><img src="https://example.test/image.png" alt="Owned raster">'});
    assert.deepEqual(errors,[]);
    const checkpoint=editor.checkpointJson();
    await close(editor);editor=undefined;
    recovered=await opener(shared,true)({...options,host:recoveryHost,initial:{kind:"documentCheckpoint",checkpointJson:checkpoint}});
    assert.equal(recovered.checkpointJson(),checkpoint);
    const snapshot=exportDocumentXml(owner);
    assert.equal(snapshot.ok,true);assert.deepEqual(snapshot.losses,[]);
    assert.deepEqual(exportDocumentXml(owner),snapshot);
    assert.equal(recovered.checkpointJson(),checkpoint);
    select(recovered,{kind:"document"});
    const clipboardJson=clipboard(window,recovered.surface,"copy").get(mime);
    const before=recovered.checkpointJson(),output=exportXml(owner,clipboardJson);
    assert.equal(output.ok,true);assert.deepEqual(output.losses,[]);
    assert.deepEqual(exportXml(owner,clipboardJson),output);
    assert.equal(recovered.checkpointJson(),before);
    const xml=new window.DOMParser().parseFromString(output.value,"application/xml");
    const ns=xmlContractV1.namespace,root=xml.documentElement;
    assert.equal(ns,"urn:breditor:interchange:xml:1");
    assert.equal(root.namespaceURI,"urn:breditor:interchange:xml:1");assert.equal(root.localName,"document");
    assert.equal(root.getAttribute("version"),"1");assert.equal(root.getAttribute("kind"),"flow");
    const nodes=[...root.getElementsByTagNameNS(ns,"element")];
    const type=(element,name)=>element.getAttribute("type")===`breditor/${name}`;
    const values=[...root.getElementsByTagNameNS(ns,"value")].map(value=>value.textContent);
    assert.deepEqual(values,['日本 & < > "quoted" 🙂',"First","Child","Head","Cell"]);
    const format=root.getElementsByTagNameNS(ns,"format")[0];
    assert.equal(format.getAttribute("type"),"breditor/strong");
    const list=nodes.find(node=>type(node,"ordered-list"));
    assert.ok([...list.getElementsByTagNameNS(ns,"element")].some(child=>type(child,"bullet-list")));
    const table=nodes.find(node=>type(node,"table"));
    assert.equal([...table.getElementsByTagNameNS(ns,"element")].filter(child=>type(child,"table-cell")).length,2);
    const image=nodes.find(node=>type(node,"image"));
    const property=name=>JSON.parse([...image.children].find(child=>child.getAttribute("name")===`breditor/${name}`).textContent);
    const findImage=node=>node.type==="breditor/image"?node:node.children?.map(findImage).find(Boolean);
    const clipboardImage=findImage(JSON.parse(owner.validateClipboard(clipboardJson).structuredJson).document.root);
    assert.equal(property("asset-id"),"owned-asset");
    assert.equal(property("asset-generation"),clipboardImage.properties["breditor/asset-generation"]);
    assert.equal(property("alt-text"),"Owned raster");
    const xmlProperty=(node,name)=>JSON.parse([...node.children].find(child=>child.getAttribute("name")===`breditor/${name}`).textContent);
    assert.equal(xmlProperty(nodes[0],"document-id"),"breditor-clipboard");
    const original=JSON.parse(source),docNamespace="urn:breditor:interchange:document-xml:1";
    assert.equal(documentXmlContractV1.namespace,docNamespace);
    const savedXml=new window.DOMParser().parseFromString(snapshot.value,"application/xml").documentElement;
    assert.equal(savedXml.localName,"document");assert.equal(savedXml.namespaceURI,docNamespace);
    assert.equal(savedXml.getAttribute("version"),"1");assert.equal(savedXml.getAttribute("document-format-version"),"2");
    assert.equal(savedXml.getAttribute("schema-name"),original.schema.name);
    assert.equal(savedXml.getAttribute("schema-version"),String(original.schema.version));
    assert.equal(savedXml.getAttribute("schema-fingerprint"),original.schemaFingerprint);
    const saved=[...savedXml.getElementsByTagNameNS(docNamespace,"element")];
    assert.equal(xmlProperty(saved[0],"document-id"),original.root.properties["breditor/document-id"]);
    const savedImage=saved.find(node=>type(node,"image"));
    const nativeImage=findImage(JSON.parse(owner.documentJson()).root);
    assert.equal(xmlProperty(savedImage,"asset-id"),"owned-asset");
    assert.equal(xmlProperty(savedImage,"asset-generation"),nativeImage.properties["breditor/asset-generation"]);
    assert.equal(xmlProperty(savedImage,"alt-text"),"Owned raster");
    assert.deepEqual([...savedXml.getElementsByTagNameNS(docNamespace,"value")].map(value=>value.textContent),values);
    assert.deepEqual(errors,[]);xmlExports++;documentXmlExports++;
   }finally{await close(recovered);await close(editor);container.remove();recoveryHost.remove();}
  }
  for(const shared of [false,true])for(const document of [false,true])for(const natural of [false,true]){
   const container=host(),root=createRoot(container),ref=createRef(),reports=[],errors=[];let built=0;
   const Component=shared?(document?BreditorSharedDocumentEditor:BreditorSharedEditor):(document?BreditorDocumentEditor:BreditorEditor),initialOptions={richLanguage:3,rangeEditing:"general-v1",history:natural?"typing-v1":"explicit",...(document?{selectionEditing:"document-v1"}:{}),...(shared?{database:`interchange-react-${serial++}`,room:"room",writer:"101"}:{}),clipboardInterchange:core=>{built++;return createRichInterchange(core);}};
   const props={ref,initialOptions,onInterchange:r=>reports.push(["first",r]),onError:e=>errors.push(e),...(shared?{onCloseError:e=>errors.push(e)}:{})};
   try{await act(async()=>root.render(createElement(StrictMode,null,createElement(Component,props))));const editor=await ready(ref),count=built;assert.ok(count>=1);clipboard(window,editor.surface,"paste",{"text/markdown":"## React heading"});assert.equal(reports.length,1);assert.equal(reports[0][0],"first");assert.equal(editor.view().undoDepth,1);
    await act(async()=>root.render(createElement(StrictMode,null,createElement(Component,{...props,onInterchange:r=>reports.push(["latest",r])}))));assert.equal(ref.current.getEditor(),editor);assert.equal(built,count);if(document)editor.selectDocument();else{const tree=JSON.parse(editor.view().documentJson);const find=n=>n.children?.some(c=>c.kind==="text"&&c.text.length)?n.properties["breditor/block-id"]:n.children?.map(find).find(Boolean);const block=tree.root.children.map(find).find(Boolean);assert.ok(block);select(editor,range(block,0,block,1));}clipboard(window,editor.surface,"copy");assert.equal(reports.at(-1)[0],"latest");assert.equal(editor.view().undoDepth,1);assert.deepEqual(errors,[]);reactOwners++;
   }finally{await act(async()=>root.unmount());for(let i=0;i<500&&locks.held.size;i++)await act(async()=>{await new Promise(setImmediate);});assert.equal(locks.held.size,0);container.remove();}
  }
 }finally{lp?.dispose();sp?.free();window.close();for(const [name,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
 assert.equal(pastes,44);assert.equal(restores,44);assert.equal(future,176);assert.equal(retentionRefusals,32);assert.equal(priorityCases,24);assert.equal(cutCases,8);assert.equal(readOnlyCases,8);assert.equal(staleRefusals,8);assert.equal(queuedReports,8);assert.equal(failedConversions,16);assert.equal(reactOwners,8);assert.equal(durableResumes,22);assert.equal(assetCases,8);assert.equal(locks.held.size,0);
 return{format:"breditor/browser-interchange-functional-probe",formatVersion:1,localWasmSha256:hash(localBytes),sharedWasmSha256:hash(sharedBytes),passed:true,pastes,exactRestores:restores,exactFutureCheckpoints:future,durableSharedResumes:durableResumes,retentionRefusals,priorityCases,cutCases,readOnlyCases,staleRefusals,queuedReportCases:queuedReports,failedConversions,hostOwnedImageCases:assetCases,xmlExports,documentXmlExports,actualReactOwners:reactOwners,scope:"Compiled managed local/shared original/document SDKs and all four React wrappers; real paired release Wasm and opt-in converter; synthetic clipboard, jsdom, IndexedDB and locks. Not OS clipboard, captured Office applications, installed-consumer, cross-browser, IME, accessibility or release qualification."};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const args=process.argv.slice(2);if(args.length!==2)throw Error("Expected paired local/shared release Wasm directories");try{console.log(JSON.stringify(await probeBrowserInterchange(...args),null,2));}catch(error){console.error(error.stack?.split("\n").filter(line=>line.startsWith("    at ")).join("\n"));console.error(error instanceof assert.AssertionError?`${error.operator}: ${typeof error.actual==="string"?error.actual.slice(0,100):JSON.stringify(error.actual)} !== ${typeof error.expected==="string"?error.expected.slice(0,100):JSON.stringify(error.expected)}`:error.message);process.exitCode=1;}}
