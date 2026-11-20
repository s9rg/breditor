import {test,expect} from "@playwright/test";
// A line break typed at the very end of a text block, then more typing, over the real Rust/Wasm owner.
// A lone trailing LF in a `white-space:pre-wrap` block is not a native caret position (no line box
// follows it), so the renderer adds a non-text caret anchor after it (docs/DOM_PROJECTION.md).
const mountLocal=async page=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(()=>{
  const profile=window.rich.compileRichProfile(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/rich-break",version:1},extensions:[]}));
  const binding=profile.descriptor(),canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(window.rich.root)}));
  const p=(block,text)=>({kind:"paragraph",block,text,formatsJson:"[]"});
  core.execute({kind:"insertBlocks",data:{position:{parent:{kind:"document"},before:"table-block"},blocks:[p("intro","abc")]}});
  core.execute({kind:"insertBlocks",data:{position:{parent:{kind:"document"},before:null},blocks:[p("footer","Footer")]}});
  const root=document.createElement("main");document.body.append(root);window.errors=[];
  window.editor=window.rich.mountRichEditor(root,{core,onError:error=>window.errors.push(String(error)),resolveAsset:()=>"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="});
  window.core=core;
 });
};
const mountV4=async page=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js");
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:text?[{kind:"text",text,formats:[]}]:[]});
  const cell=(r,c)=>({kind:"element",type:"breditor/table-cell",entityId:null,properties:{"breditor/block-id":`cell-${r}-${c}`,"breditor/column-id":c,"breditor/header":false},children:[paragraph(`p-${r}-${c}`,`${r}${c}`)]});
  const row=r=>({kind:"element",type:"breditor/table-row",entityId:null,properties:{"breditor/block-id":`row-${r}`,"breditor/row-id":r},children:[cell(r,"a"),cell(r,"b")]});
  const table={kind:"element",type:"breditor/table",entityId:null,properties:{"breditor/block-id":"tbl","breditor/table-id":"t","breditor/columns":[{id:"a",width:160},{id:"b",width:160}],"breditor/merges":[],"breditor/retracted-merges":[]},children:[row("r1"),row("r2"),paragraph("cap","Sales")]};
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("p","Hello"),table,paragraph("q","Second")]};
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/break-v4",version:4},extensions:[]})),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const binding=profile.descriptor(),core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)}));
  const host=document.createElement("main");document.body.append(host);window.errors=[];
  window.editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>window.errors.push(String(error))});window.core=core;
 });
};
// Exact Rust text of one text block (all text runs, in order).
const blockText=(page,block)=>page.evaluate(block=>{
 const find=node=>{if(node.kind!=="element")return null;if(node.properties["breditor/block-id"]===block)return node;for(const child of node.children){const hit=find(child);if(hit)return hit;}return null;};
 const node=find(JSON.parse(window.core.documentJson()).root);return node?node.children.map(child=>child.text??"").join(""):null;
},block);
const caret=(page,block,offset)=>page.evaluate(([block,offset])=>{window.editor.focus();window.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}}});},[block,offset]);
const selection=page=>page.evaluate(()=>{const s=window.core.view().selection;return s?.kind==="text"?{block:s.focus.block,anchor:s.anchor.offset,focus:s.focus.offset}:s;});
// Logical model offset read back from the live native caret (the controller's own DOM mapping).
const nativeOffset=page=>page.evaluate(()=>{const native=document.getSelection(),block=native.focusNode&&(native.focusNode.nodeType===1?native.focusNode:native.focusNode.parentElement).closest("[data-rich-text]");if(!block)return null;const range=document.createRange();range.setStart(block,0);range.setEnd(native.focusNode,native.focusOffset);return {block:block.dataset.richText,offset:range.toString().length};});
const errors=page=>page.evaluate(()=>window.errors);

test("Shift+Enter at the end of a paragraph then typing lands after the break",async({page})=>{
 await mountLocal(page);await caret(page,"intro",3);
 await page.keyboard.press("Shift+Enter");
 expect(await blockText(page,"intro")).toBe("abc\n");expect(await selection(page)).toEqual({block:"intro",anchor:"4",focus:"4"});
 expect(await nativeOffset(page)).toEqual({block:"intro",offset:4});
 await page.keyboard.type("x");
 expect(await blockText(page,"intro")).toBe("abc\nx");expect(await selection(page)).toEqual({block:"intro",anchor:"5",focus:"5"});
 await expect(page.locator('[data-rich-text="intro"]')).toHaveText("abc\nx");
 // The anchor is presentation only: it is gone once text follows the break.
 await expect(page.locator('[data-rich-text="intro"] [data-rich-trailing-break]')).toHaveCount(0);
 expect(await errors(page)).toEqual([]);
});

test("two consecutive trailing breaks keep the caret after the second one",async({page})=>{
 await mountLocal(page);await caret(page,"intro",3);
 await page.keyboard.press("Shift+Enter");await page.keyboard.press("Shift+Enter");
 expect(await blockText(page,"intro")).toBe("abc\n\n");expect(await selection(page)).toEqual({block:"intro",anchor:"5",focus:"5"});
 await page.keyboard.type("yz");
 expect(await blockText(page,"intro")).toBe("abc\n\nyz");expect(await selection(page)).toEqual({block:"intro",anchor:"7",focus:"7"});
 expect(await errors(page)).toEqual([]);
});

test("a trailing break adds a visible empty line with the caret on it",async({page})=>{
 await mountLocal(page);
 const before=await page.locator('[data-rich-text="intro"]').boundingBox();
 await caret(page,"intro",3);await page.keyboard.press("Shift+Enter");
 const after=await page.locator('[data-rich-text="intro"]').boundingBox();
 expect(after.height).toBeGreaterThan(before.height*1.5);
 // One presentation-only anchor, after the text, without text of its own.
 await expect(page.locator('[data-rich-text="intro"] > br[data-rich-trailing-break]:last-child')).toHaveCount(1);
 await expect(page.locator('[data-rich-text="intro"]')).toHaveText("abc\n");
 // The caret is a real position: the browser's own target for the next typed character is after the LF.
 await page.evaluate(()=>{const block=document.querySelector('[data-rich-text="intro"]');document.addEventListener("beforeinput",event=>{const range=event.getTargetRanges()[0],native=document.getSelection(),probe=document.createRange();probe.setStart(block,0);if(range)probe.setEnd(range.startContainer,range.startOffset);else probe.setEnd(native.focusNode,native.focusOffset);window.typedAt=probe.toString().length;},{capture:true,once:true});});
 await page.keyboard.type("x");
 expect(await page.evaluate(()=>window.typedAt)).toBe(4);
 expect(await blockText(page,"intro")).toBe("abc\nx");
 expect(await errors(page)).toEqual([]);
});

test("Shift+Enter at the end of a heading then typing lands after the break",async({page})=>{
 await mountLocal(page);await page.evaluate(()=>window.editor.execute({kind:"setHeading",block:"intro",level:2}));
 await expect(page.locator('h2[data-rich-text="intro"]')).toHaveCount(1);
 await caret(page,"intro",3);await page.keyboard.press("Shift+Enter");await page.keyboard.type("x");
 expect(await blockText(page,"intro")).toBe("abc\nx");expect(await selection(page)).toEqual({block:"intro",anchor:"5",focus:"5"});
 expect(await errors(page)).toEqual([]);
});

test("Enter at the end of an image caption then typing lands after the break",async({page})=>{
 await mountLocal(page);await caret(page,"caption",4);
 await page.keyboard.press("Enter");
 expect(await blockText(page,"caption")).toBe("xy🙂\n");expect(await selection(page)).toEqual({block:"caption",anchor:"5",focus:"5"});
 await page.keyboard.type("x");
 expect(await blockText(page,"caption")).toBe("xy🙂\nx");expect(await selection(page)).toEqual({block:"caption",anchor:"6",focus:"6"});
 expect(await errors(page)).toEqual([]);
});

test("Enter at the end of a V4 table caption then typing lands after the break",async({page})=>{
 await mountV4(page);await caret(page,"cap",5);
 await page.keyboard.press("Enter");
 expect(await blockText(page,"cap")).toBe("Sales\n");expect(await selection(page)).toEqual({block:"cap",anchor:"6",focus:"6"});
 await page.keyboard.type("x");
 expect(await blockText(page,"cap")).toBe("Sales\nx");expect(await selection(page)).toEqual({block:"cap",anchor:"7",focus:"7"});
 expect(await errors(page)).toEqual([]);
});

test("a mid-text break, Backspace over a trailing break and Undo keep exact offsets",async({page})=>{
 await mountLocal(page);await caret(page,"intro",1);
 await page.keyboard.press("Shift+Enter");await page.keyboard.type("x");
 expect(await blockText(page,"intro")).toBe("a\nxbc");expect(await selection(page)).toEqual({block:"intro",anchor:"3",focus:"3"});
 await caret(page,"intro",5);await page.keyboard.press("Shift+Enter");
 expect(await blockText(page,"intro")).toBe("a\nxbc\n");
 await page.keyboard.press("Backspace");
 expect(await blockText(page,"intro")).toBe("a\nxbc");expect(await selection(page)).toEqual({block:"intro",anchor:"5",focus:"5"});
 await page.keyboard.type("!");expect(await blockText(page,"intro")).toBe("a\nxbc!");
 // A trailing break restored by Undo is again a reachable caret position.
 await caret(page,"intro",6);await page.keyboard.press("Shift+Enter");await page.evaluate(()=>window.editor.execute({kind:"undo"}));await page.evaluate(()=>window.editor.execute({kind:"redo"}));
 expect(await blockText(page,"intro")).toBe("a\nxbc!\n");await caret(page,"intro",7);
 expect(await nativeOffset(page)).toEqual({block:"intro",offset:7});
 await page.keyboard.type("y");expect(await blockText(page,"intro")).toBe("a\nxbc!\ny");
 expect(await errors(page)).toEqual([]);
});
