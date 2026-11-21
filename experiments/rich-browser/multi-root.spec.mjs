import {test,expect} from "@playwright/test";

// Real Rust/Wasm roots under one native history owner (docs/MULTIPLE_ROOTS.md).
async function mount(page){
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const {createRichRootSet,mountRichMultiRootEditor,defaultToolbar}=await import("/rich.js");
  const profile=window.rich.compileRichProfile(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/rich-roots",version:1},extensions:[]}));
  const descriptor=profile.descriptor();
  const document=(name,text)=>JSON.stringify({format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,
   root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":name},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":`${name}-p`},children:[{kind:"text",text,formats:[]}]}]}});
  const host=window.document.createElement("div");host.id="multi";window.document.body.append(host);
  const set=createRichRootSet(window.rich.wasm);
  const roots=[["header","Header","Title"],["content","Content","Body"],["sidebar","Sidebar","Aside"]].map(([id,label,text])=>({id,label,core:profile.createEditor(document(id,text)),attributes:{order:id}}));
  const editor=mountRichMultiRootEditor(host,{set,roots,toolbar:()=>defaultToolbar});
  window.multi={editor,set,profile,text:id=>JSON.parse(editor.getData(id)).root.children[0].children[0]?.text??""};
 });
}
const surface=(page,label)=>page.getByRole("textbox",{name:label,exact:true});
const visibleToolbars=page=>page.locator(".breditor-rich-multi-root-toolbar > .breditor-rich-toolbar:not([hidden])");
async function typeAtEnd(page,label,text){
 await surface(page,label).click();await page.keyboard.press("End");await page.keyboard.type(text);
}

test("typing in two roots, then Undo twice undoes the second root before the first",async({page})=>{
 await mount(page);
 await expect(page.locator("[data-breditor-root]")).toHaveCount(3);
 await expect(visibleToolbars(page)).toHaveCount(1);
 await typeAtEnd(page,"Header","A");
 await expect.poll(()=>page.evaluate(()=>window.multi.text("header"))).toBe("TitleA");
 await typeAtEnd(page,"Content","B");
 await expect.poll(()=>page.evaluate(()=>window.multi.text("content"))).toBe("BodyB");
 expect(await page.evaluate(()=>{const s=window.multi.editor.state();return [s.active,s.undoDepth,s.undoTarget];})).toEqual(["content",2,"content"]);
 const undo=visibleToolbars(page).getByRole("button",{name:"Undo",exact:true});
 await undo.click();
 await expect.poll(()=>page.evaluate(()=>window.multi.text("content"))).toBe("Body");
 expect(await page.evaluate(()=>window.multi.text("header"))).toBe("TitleA");
 await undo.click();
 await expect.poll(()=>page.evaluate(()=>window.multi.text("header"))).toBe("Title");
 // The undone root takes focus, and the shared toolbar follows it.
 await expect.poll(()=>page.evaluate(()=>window.multi.editor.activeRoot())).toBe("header");
 await expect(surface(page,"Header")).toBeFocused();
 expect(await page.evaluate(()=>window.multi.editor.state().undoDepth)).toBe(0);
 await visibleToolbars(page).getByRole("button",{name:"Redo",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.multi.text("header"))).toBe("TitleA");
 await visibleToolbars(page).getByRole("button",{name:"Redo",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.multi.text("content"))).toBe("BodyB");
 expect(await page.evaluate(()=>window.multi.text("sidebar"))).toBe("Aside");
});

test("the shared toolbar follows focus and reflects the active root's state",async({page})=>{
 await mount(page);
 const shown=()=>page.evaluate(()=>{const bars=[...window.document.querySelectorAll(".breditor-rich-multi-root-toolbar > .breditor-rich-toolbar")];return bars.findIndex(bar=>!bar.hidden);});
 expect(await shown()).toBe(0);
 await surface(page,"Sidebar").click();
 await expect.poll(shown).toBe(2);
 expect(await page.evaluate(()=>window.multi.editor.activeRoot())).toBe("sidebar");
 // Global Undo is enabled in every root's toolbar once any root has an edit.
 await expect(visibleToolbars(page).getByRole("button",{name:"Undo",exact:true})).toBeDisabled();
 await typeAtEnd(page,"Header","!");
 await expect.poll(shown).toBe(0);
 await surface(page,"Sidebar").click();
 await expect.poll(shown).toBe(2);
 await expect(visibleToolbars(page).getByRole("button",{name:"Undo",exact:true})).toBeEnabled();
 // Bold applies to the active (sidebar) root only.
 await page.keyboard.press("Shift+Home");
 await visibleToolbars(page).getByRole("button",{name:"Bold",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(window.multi.editor.getData("sidebar")).root.children[0].children[0].formats.length)).toBe(1);
 expect(await page.evaluate(()=>JSON.parse(window.multi.editor.getData("header")).root.children[0].children[0].formats.length)).toBe(0);
});

test("the root set checkpoint restores every root and the global Undo order",async({page})=>{
 await mount(page);
 await typeAtEnd(page,"Header","1");
 await typeAtEnd(page,"Sidebar","2");
 await expect.poll(()=>page.evaluate(()=>window.multi.text("sidebar"))).toBe("Aside2");
 const result=await page.evaluate(async()=>{
  const {createRichRootSet,restoreRichRootSet,mountRichMultiRootEditor,defaultToolbar}=await import("/rich.js");
  const envelope=window.multi.editor.checkpointJson(),profile=window.multi.profile;
  window.multi.editor.dispose();
  const set=createRichRootSet(window.rich.wasm),roots=restoreRichRootSet(set,profile,envelope);
  const host=window.document.getElementById("multi");
  const editor=mountRichMultiRootEditor(host,{set,roots,restored:true,toolbar:()=>defaultToolbar});
  const text=id=>JSON.parse(editor.getData(id)).root.children[0].children[0].text;
  const state=editor.state();
  editor.undo();const afterOne=[text("header"),text("sidebar")];
  editor.undo();const afterTwo=[text("header"),text("sidebar")];
  const tampered=JSON.parse(envelope);tampered.journal=["header","header"];tampered.cursor=2;
  let rejected="";try{restoreRichRootSet(createRichRootSet(window.rich.wasm),profile,JSON.stringify(tampered));}catch(error){rejected=error.code;}
  return {ids:state.roots.map(root=>root.id),attributes:state.roots[1].attributes,undoTarget:state.undoTarget,afterOne,afterTwo,rejected};
 });
 expect(result).toEqual({ids:["header","content","sidebar"],attributes:{order:"content"},undoTarget:"sidebar",afterOne:["Title1","Aside"],afterTwo:["Title","Aside"],rejected:"breditor_rich.root_history_mismatch"});
});
