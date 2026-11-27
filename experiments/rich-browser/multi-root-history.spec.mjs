import {test,expect} from "@playwright/test";

// Undoable add/remove/move/attribute steps in the ONE global history of real Rust/Wasm
// roots, surface mount/unmount on Undo/Redo, focus/toolbar follow and a real page
// reload through the version 2 root-set checkpoint (docs/MULTIPLE_ROOTS.md).
const bootstrap=JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/rich-roots",version:1},extensions:[]});
async function ready(page){await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");}
async function mount(page){
 await ready(page);
 await page.evaluate(async bootstrap=>{
  const {createRichRootSet,mountRichMultiRootEditor,defaultToolbar}=await import("/rich.js");
  const profile=window.rich.compileRichProfile(window.rich.wasm,bootstrap),descriptor=profile.descriptor();
  const document=(name,text)=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,
   root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":name},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":`${name}-p`},children:[{kind:"text",text,formats:[]}]}]}});
  const host=window.document.createElement("div");host.id="multi";window.document.body.append(host);
  const roots=[["header","Header","Title"],["content","Content","Body"],["sidebar","Sidebar","Aside"]].map(([id,label,text])=>({id,label,core:profile.createEditor(document(id,text))}));
  const editor=mountRichMultiRootEditor(host,{set:createRichRootSet(window.rich.wasm),roots,toolbar:()=>defaultToolbar});
  window.multi={editor,profile,document,text:id=>JSON.parse(window.multi.editor.getData(id)).root.children[0].children[0]?.text??""};
 },bootstrap);
}
const surface=(page,label)=>page.getByRole("textbox",{name:label,exact:true});
const sections=page=>page.locator("[data-breditor-root]").evaluateAll(nodes=>nodes.map(node=>node.dataset.breditorRoot));
const visibleToolbars=page=>page.locator(".breditor-rich-multi-root-toolbar > .breditor-rich-toolbar:not([hidden])");
const button=(page,name)=>visibleToolbars(page).getByRole("button",{name,exact:true});
const state=page=>page.evaluate(()=>{const s=window.multi.editor.state();return {active:s.active,detached:s.detached,undoStep:s.undoStep,redoStep:s.redoStep};});

test("removing a root is one Undo step that restores the same root, position and focus",async({page})=>{
 await mount(page);
 await surface(page,"Content").click();await page.keyboard.press("End");await page.keyboard.type("B");
 await expect.poll(()=>page.evaluate(()=>window.multi.text("content"))).toBe("BodyB");
 const removed=await page.evaluate(()=>JSON.parse(window.multi.editor.removeRoot("content").documentJson).root.children[0].children[0].text);
 expect(removed).toBe("BodyB");
 expect(await sections(page)).toEqual(["header","sidebar"]);
 // The removed root had focus: focus and the shared toolbar follow its neighbour.
 await expect(surface(page,"Sidebar")).toBeFocused();
 await expect(visibleToolbars(page)).toHaveCount(1);
 await expect(page.locator(".breditor-rich-multi-root-toolbar > .breditor-rich-toolbar")).toHaveCount(2);
 expect(await state(page)).toEqual({active:"sidebar",detached:["content"],undoStep:"remove",redoStep:null});

 await button(page,"Undo").click();
 await expect.poll(()=>sections(page)).toEqual(["header","content","sidebar"]);
 await expect(surface(page,"Content")).toBeFocused();
 expect(await page.evaluate(()=>window.multi.text("content"))).toBe("BodyB");
 expect(await state(page)).toEqual({active:"content",detached:[],undoStep:"root",redoStep:"remove"});
 // The restored root keeps its own history: the next Undo removes the typed text.
 await button(page,"Undo").click();
 await expect.poll(()=>page.evaluate(()=>window.multi.text("content"))).toBe("Body");
 await button(page,"Redo").click();
 await expect.poll(()=>page.evaluate(()=>window.multi.text("content"))).toBe("BodyB");
 // Keyboard Redo in the restored root applies the removal again.
 await surface(page,"Content").click();
 await page.keyboard.press("ControlOrMeta+Shift+Z");
 await expect.poll(()=>sections(page)).toEqual(["header","sidebar"]);
 await expect(surface(page,"Sidebar")).toBeFocused();
});

test("adding, moving and attribute steps undo and redo in global order with content edits",async({page})=>{
 await mount(page);
 await page.evaluate(()=>{const {editor,profile,document}=window.multi;editor.addRoot({id:"notes",label:"Notes",core:profile.createEditor(document("notes","Memo"))},1);});
 expect(await sections(page)).toEqual(["header","notes","content","sidebar"]);
 await surface(page,"Notes").click();await page.keyboard.press("End");await page.keyboard.type("!");
 await expect.poll(()=>page.evaluate(()=>window.multi.text("notes"))).toBe("Memo!");
 await page.evaluate(()=>{window.multi.editor.moveRoot("sidebar",0);window.multi.editor.setAttribute("header","order","1");});
 expect(await sections(page)).toEqual(["sidebar","header","notes","content"]);
 const stale=await page.evaluate(()=>{try{window.multi.editor.removeRoot("notes",{revision:"0"});return "";}catch(error){return error.code;}});
 expect(stale).toBe("breditor_rich.root_set_stale");
 const steps=[];
 for(let index=0;index<4;index++){steps.push((await state(page)).undoStep);await page.evaluate(()=>window.multi.editor.undo());}
 expect(steps).toEqual(["attributes","move","root","add"]);
 expect(await sections(page)).toEqual(["header","content","sidebar"]);
 expect(await page.evaluate(()=>window.multi.editor.state().roots[0].attributes)).toEqual({});
 expect(await page.evaluate(()=>window.multi.editor.undo())).toBe("unchanged");
 await page.evaluate(()=>window.multi.editor.redo());
 expect(await sections(page)).toEqual(["header","notes","content","sidebar"]);
 await expect(surface(page,"Notes")).toBeFocused();
 expect(await page.evaluate(()=>window.multi.text("notes"))).toBe("Memo");
 // A new edit clears the redo branch; the root set still holds exactly the attached roots.
 await page.keyboard.type("?");
 await expect.poll(()=>page.evaluate(()=>window.multi.editor.state().redoDepth)).toBe(0);
 const last=await page.evaluate(()=>{try{["header","content","sidebar"].forEach(id=>window.multi.editor.removeRoot(id));window.multi.editor.removeRoot("notes");return "";}catch(error){return error.code;}});
 expect(last).toBe("breditor_rich.root_last");
});

test("a removed root and the structure history survive a page reload",async({page})=>{
 await mount(page);
 await surface(page,"Content").click();await page.keyboard.press("End");await page.keyboard.type("B");
 await expect.poll(()=>page.evaluate(()=>window.multi.text("content"))).toBe("BodyB");
 const envelope=await page.evaluate(()=>{window.multi.editor.setAttribute("sidebar","order","3");window.multi.editor.removeRoot("content");return window.multi.editor.checkpointJson();});
 expect(JSON.parse(envelope)).toMatchObject({formatVersion:2,detached:[{id:"content"}]});
 await page.reload();
 await ready(page);
 const restored=await page.evaluate(async({bootstrap,envelope})=>{
  const {createRichRootSet,restoreRichRootSet,mountRichMultiRootEditor,defaultToolbar}=await import("/rich.js");
  const profile=window.rich.compileRichProfile(window.rich.wasm,bootstrap),set=createRichRootSet(window.rich.wasm);
  const roots=restoreRichRootSet(set,profile,envelope);
  const host=window.document.createElement("div");host.id="multi";window.document.body.append(host);
  const editor=mountRichMultiRootEditor(host,{set,roots,restored:true,toolbar:()=>defaultToolbar});
  window.multi={editor,text:id=>JSON.parse(window.multi.editor.getData(id)).root.children[0].children[0]?.text??""};
  return {roots:roots.map(root=>[root.id,root.detached??false]),checkpoint:editor.checkpointJson()===envelope};
 },{bootstrap,envelope});
 expect(restored).toEqual({roots:[["header",false],["sidebar",false],["content",true]],checkpoint:true});
 expect(await sections(page)).toEqual(["header","sidebar"]);
 await surface(page,"Sidebar").click();
 await button(page,"Undo").click();
 await expect.poll(()=>sections(page)).toEqual(["header","content","sidebar"]);
 await expect(surface(page,"Content")).toBeFocused();
 expect(await page.evaluate(()=>window.multi.text("content"))).toBe("BodyB");
 await button(page,"Undo").click();
 await expect.poll(()=>page.evaluate(()=>window.multi.editor.state().roots[2].attributes)).toEqual({});
 await button(page,"Undo").click();
 await expect.poll(()=>page.evaluate(()=>window.multi.text("content"))).toBe("Body");
 await expect(button(page,"Undo")).toBeDisabled();
});
