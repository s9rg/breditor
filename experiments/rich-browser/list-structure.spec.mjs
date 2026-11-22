import {test,expect} from "@playwright/test";
// Advanced list structure over the actual Rust/Wasm V4 owner (docs/LIST_STRUCTURE.md): multi-block
// items through real keys (Enter, Backspace, Tab, Shift+Tab) with exact Undo, and the opt-in legal
// multi-level numbering presentation. No grammar change: the V4 fingerprint is untouched.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js");
  const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/list-structure",version:4},extensions:[]});
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const element=(type,id,children=[],extra={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":id,...extra},children});
  const paragraph=(id,text)=>element("paragraph",id,text?[{kind:"text",text,formats:[]}]:[]);
  const item=(id,...children)=>element("list-item",id,children);
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,bootstrap),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const open=(children)=>{const binding=profile.descriptor(),root=element("document","unused",children);root.properties={"breditor/document-id":"doc"};return profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)}));};
  const mount=(children,options={})=>{
   window.t?.editor?.dispose();document.querySelector("main#list-structure")?.remove();
   const core=open(children),host=document.createElement("main"),errors=[];host.id="list-structure";document.body.append(host);
   const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),onError:error=>errors.push(String(error)),...options});
   window.t={...window.t,core,editor,host,errors};editor.focus();return true;
  };
  const caret=(block,offset)=>window.t.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(offset),affinity:"after"},focus:{block,offset:String(offset),affinity:"after"}}});
  const shape=()=>{const walk=n=>n.type==="breditor/paragraph"?`${n.properties["breditor/block-id"]}:${n.children.map(c=>c.text??"").join("")}`:{[n.properties["breditor/block-id"]]:n.children.map(walk)};return JSON.parse(window.t.core.documentJson()).root.children.map(walk);};
  window.t={api,profile,element,paragraph,item,mount,caret,shape};
  mount([element("bullet-list","list",[item("a",paragraph("pa","one")),item("b",paragraph("pb","two")),item("c",paragraph("pc","three"))])]);
 });
});
const shape=page=>page.evaluate(()=>window.t.shape());
const depth=page=>page.evaluate(()=>window.t.core.view().undoDepth);

test("Enter then Backspace adds a block to an item; Enter in that empty block splits it out again",async({page})=>{
 const original=await shape(page);
 await page.evaluate(()=>window.t.caret("pa",3));
 await page.keyboard.press("Enter");
 await expect(page.locator('[data-rich-block="list"] > li')).toHaveCount(4);
 const afterEnter=await depth(page);
 // Backspace in the new empty item removes its marker: the empty paragraph becomes item a's later block.
 await page.keyboard.press("Backspace");
 await expect(page.locator('[data-rich-block="list"] > li')).toHaveCount(3);
 await expect(page.locator('li[data-rich-block="a"] > p')).toHaveCount(2);
 expect(await depth(page)).toBe(afterEnter+1);
 await page.keyboard.type("more");
 let value=await shape(page);
 expect(value[0].list[0].a.map(String)).toEqual(["pa:one",expect.stringMatching(/:more$/)]);
 // Enter at the end of a nonempty later paragraph adds another paragraph inside the same item.
 await page.keyboard.press("Enter");
 await expect(page.locator('li[data-rich-block="a"] > p')).toHaveCount(3);
 // Enter in that empty later paragraph moves it into a fresh sibling item (one Undo step).
 const beforeSplit=await page.evaluate(()=>({json:window.t.core.documentJson(),depth:window.t.core.view().undoDepth}));
 await page.keyboard.press("Enter");
 await expect(page.locator('[data-rich-block="list"] > li')).toHaveCount(4);
 await expect(page.locator('li[data-rich-block="a"] > p')).toHaveCount(2);
 expect(await depth(page)).toBe(beforeSplit.depth+1);
 await page.keyboard.type("lifted");
 value=await shape(page);
 expect(Object.values(value[0].list[1])[0].map(String)).toEqual([expect.stringMatching(/:lifted$/)]);
 // Undo walks back one action at a time to the split point, then to the original document.
 // Typing is undone first (one step per keystroke in explicit history), then the split in one step.
 while(await depth(page)>beforeSplit.depth+1)await page.keyboard.press("ControlOrMeta+z");
 await expect(page.locator('[data-rich-block="list"] > li')).toHaveCount(4);
 await page.keyboard.press("ControlOrMeta+z");
 expect(await page.evaluate(()=>window.t.core.documentJson())).toBe(beforeSplit.json);
 while(await depth(page)>0)await page.evaluate(()=>window.t.editor.execute({kind:"undo"}));
 expect(await shape(page)).toEqual(original);
 expect(await page.evaluate(()=>window.t.errors)).toEqual([]);
});

test("Tab and Shift+Tab in a later block move the whole multi-block item",async({page})=>{
 await page.evaluate(()=>{const t=window.t;t.mount([t.element("bullet-list","list",[t.item("a",t.paragraph("pa","one")),t.item("b",t.paragraph("pb","two"),t.paragraph("pb2","more")),t.item("c",t.paragraph("pc","three"))])]);t.caret("pb2",2);});
 const before=await page.evaluate(()=>window.t.core.documentJson());
 await page.keyboard.press("Tab");
 await expect(page.locator('li[data-rich-block="a"] li[data-rich-block="b"] > p')).toHaveCount(2);
 expect(await page.evaluate(()=>window.t.core.view().selection.focus)).toMatchObject({block:"pb2",offset:"2"});
 await page.keyboard.press("Shift+Tab");
 await expect(page.locator('[data-rich-block="list"] > li[data-rich-block="b"] > p')).toHaveCount(2);
 expect(await page.evaluate(()=>window.t.core.documentJson())).toBe(before);
 // At the first item Tab does nothing to the document and focus navigation stays available;
 // a top-level Shift+Tab is not captured either.
 await page.evaluate(()=>window.t.caret("pa",0));
 const depthBefore=await depth(page);
 await page.keyboard.press("Tab");
 expect(await depth(page)).toBe(depthBefore);
 expect(await page.evaluate(()=>window.t.core.documentJson())).toBe(before);
 expect(await page.evaluate(()=>window.t.errors)).toEqual([]);
});

test("legal multi-level numbering is derived presentation and never changes the document",async({page})=>{
 const setup=()=>{const t=window.t,ol=(id,start,items,extra={})=>t.element("ordered-list",id,items,{"breditor/start":start,...extra});
  return [ol("outer",3,[t.item("a",t.paragraph("pa","a")),t.item("b",t.paragraph("pb","b"),ol("inner",1,[t.item("x",t.paragraph("px","x")),t.item("y",t.paragraph("py","y"),ol("deep",5,[t.item("d1",t.paragraph("pd1","d1")),t.item("d2",t.paragraph("pd2","d2"))],{"breditor/list-reversed":true}))]),t.paragraph("pb2","later"))])];};
 const plain=await page.evaluate(setup=>{const children=eval(`(${setup})`)();window.t.mount(children);return {json:window.t.core.documentJson(),text:window.t.editor.surface.textContent,legal:window.t.host.querySelectorAll("[data-rich-legal-marker]").length};},setup.toString());
 expect(plain.legal).toBe(0);
 const legal=await page.evaluate(setup=>{const children=eval(`(${setup})`)();window.t.mount(children,{legalListNumbering:true});
  const li=id=>window.t.host.querySelector(`li[data-rich-block="${id}"]`);
  const marker=id=>li(id).getAttribute("data-rich-legal-marker");
  const content=id=>getComputedStyle(li(id),"::before").content;
  return {json:window.t.core.documentJson(),text:window.t.editor.surface.textContent,markers:["a","b","x","y","d1","d2"].map(marker),
   listStyle:getComputedStyle(window.t.host.querySelector('ol[data-rich-block="outer"]')).listStyleType,before:content("x"),
   position:getComputedStyle(li("x"),"::before").position};
 },setup.toString());
 expect(legal.json).toBe(plain.json);expect(legal.text).toBe(plain.text);
 expect(legal.markers).toEqual(["3.","4.","4.1.","4.2.","4.2.5.","4.2.4."]);
 expect(legal.listStyle).toBe("none");expect(legal.position).toBe("absolute");
 expect(["\"4.1.\"","attr(data-rich-legal-marker)"]).toContain(legal.before);
 // Markers follow structural edits and Undo: Tab in x's paragraph is refused (first item), Tab in y nests it under x (the new nested list keeps y's ordinal 2, as Indent always does).
 await page.evaluate(()=>window.t.caret("py",1));
 await page.keyboard.press("Tab");
 await expect(page.locator('li[data-rich-block="y"]')).toHaveAttribute("data-rich-legal-marker","4.1.2.");
 await expect(page.locator('li[data-rich-block="d1"]')).toHaveAttribute("data-rich-legal-marker","4.1.2.5.");
 // Typing never enters a marker into the text and the caret stays in place.
 await page.keyboard.type("Z");
 await expect(page.locator('[data-rich-text="py"]')).toHaveText("yZ");
 await page.keyboard.press("ControlOrMeta+z");await page.keyboard.press("ControlOrMeta+z");
 await expect(page.locator('li[data-rich-block="y"]')).toHaveAttribute("data-rich-legal-marker","4.2.");
 expect(await page.evaluate(()=>window.t.core.documentJson())).toBe(plain.json);
 expect(await page.evaluate(()=>window.t.errors)).toEqual([]);
});
