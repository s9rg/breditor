import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToString} from "react-dom/server";
import {BreditorEditor} from "@breditor/editor/react";
import {BreditorSharedEditor} from "@breditor/editor/collaboration/react";
import {initializeLocalRuntime,createLocalProfile,emptyDocumentJson} from "@breditor/editor";
import {initializeSharedRuntime,createSharedProfile,SharedRichEditor} from "@breditor/editor/collaboration";
import * as applicationWasm from "@breditor/collaboration/wasm";
const require=createRequire(import.meta.url);
assert.deepEqual(Object.keys(applicationWasm).sort(),["SharedEditorOwner","SharedObservation","SharedRichProfile","default","initSync"].sort());
assert.equal(applicationWasm.SharedEditorOwner.prototype.undo,undefined);assert.equal(applicationWasm.SharedEditorOwner.prototype.apply,undefined);
assert.match(renderToString(createElement(BreditorEditor)),/data-breditor-phase="starting"/);
assert.match(renderToString(createElement(BreditorSharedEditor,{initialOptions:{database:"ssr",room:"room",writer:"101"},onCloseError:()=>{}})),/data-breditor-phase="starting"/);
await initializeLocalRuntime(readFileSync(require.resolve("@breditor/experimental-rich-content/wasm-binary")));
await initializeSharedRuntime(readFileSync(require.resolve("@breditor/collaboration/wasm-binary")));
const local=await createLocalProfile(),shared=await createSharedProfile();try{
 assert.equal(local.inlineCatalogJson(),shared.inline_catalog_json());
 const a=new SharedRichEditor(shared.create(emptyDocumentJson(local.descriptor(),"sdk-room","p"),"101")),b=new SharedRichEditor(shared.join_frame("sdk-room","202",a.updateFrame()));
 try{a.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Packaged "}}]});b.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"shared"}}]});await a.receiveFrame(b.updateFrame());await b.receiveFrame(a.updateFrame());assert.equal(a.documentJson(),b.documentJson());const after=a.documentJson();a.undo();assert.ok(a.documentJson().includes("shared"));a.redo();assert.equal(a.documentJson(),after);const saved=a.checkpointJson();a.dispose();const restored=new SharedRichEditor(shared.restore("sdk-room",saved));try{restored.undo();restored.redo();assert.equal(restored.documentJson(),after);}finally{restored.dispose();}}
 finally{a.dispose();b.dispose();}
}finally{local.dispose();shared.free();}
console.log("SDK server rendering and packaged native local/shared catalogs, merge and future history passed");
