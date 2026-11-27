import {test,expect} from "@playwright/test";
// Decoupled layout (docs/EDITOR_SHELL.md, "External toolbar container") over the real Rust/Wasm V4 owner: the
// editor's own standard toolbar is mounted into a host element outside the editor root. Same widgets and
// Rust-derived state, one native command and one Undo step per activation, Alt+F10 from the text, Escape and
// command completion back to the text, and clean re-mount, disposal and two-editor ownership.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js");
  const text=value=>value?[{kind:"text",text:value,formats:[]}]:[];
  const node=(type,id,children=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":id},children});
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  window.errors=[];
  const open=(name,toolbarContainer)=>{
   const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/external-toolbar",version:4},extensions:[]}));
   const presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson()),binding=profile.descriptor();
   const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":name},children:[node("paragraph","p",text(`Hello ${name}`)),node("paragraph","tail",text("Tail"))]};
   const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)}));
   const host=document.createElement("main");host.id=`host-${name}`;host.style.cssText="max-width:720px;margin:24px";document.body.append(host);
   const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar:api.createRichToolbarV4(core,presentation),...(toolbarContainer?{toolbarContainer}:{}),label:`Editor ${name}`,onError:error=>window.errors.push(String(error))});
   const blocks=()=>JSON.parse(core.view().documentJson).root.children.map(block=>`${block.type.replace("breditor/","")}:${block.children.filter(c=>c.kind==="text").map(c=>c.text+(c.formats.length?`[${c.formats.map(f=>f.type.replace("breditor/","")).join(",")}]`:"")).join("|")}`);
   const select=(start,end=start)=>editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:String(start),affinity:"after"},focus:{block:"p",offset:String(end),affinity:"after"}}},true);

   return {editor,core,blocks,select,depth:()=>core.view().undoDepth};
  };
  const slot=id=>{const element=document.createElement("header");element.id=id;element.style.cssText="position:sticky;top:0;padding:4px;background:#fafafa";document.body.prepend(element);return element;};
  window.ext={api,open,slot,active:()=>{const a=document.activeElement;if(!a||a===document.body)return "body";for(const [name,entry]of Object.entries(window.editors??{}))if(a===entry.editor.surface)return `surface:${name}`;const header=a.closest?.("header");return header?`slot:${header.id}:${a.dataset.richAction??a.textContent}`:a.tagName;}};
  const a=slot("slot-a");window.editors={a:open("a",a)};
 });
});

test("external toolbar: same widgets and state, Alt+F10, Escape, one Undo step per command",async({page})=>{
 const slot=page.locator("#slot-a");
 // The editor's own toolbar is in the host container, not in the editor root, and its scoped styles still apply.
 await expect(slot.locator("[data-breditor-external-toolbar] > [role=toolbar]")).toHaveCount(1);
 await expect(page.locator("#host-a [role=toolbar]")).toHaveCount(0);
 expect(await page.evaluate(()=>{const toolbar=document.querySelector("#slot-a [role=toolbar]");return {same:toolbar===window.editors.a.editor.toolbar,display:getComputedStyle(toolbar).display};})).toEqual({same:true,display:"flex"});
 const bold=slot.locator('[data-rich-action="bold"]');
 await page.evaluate(()=>window.editors.a.select(0,5));
 await expect(bold).toHaveAttribute("aria-pressed","false");
 // Alt+F10 from the text reaches the first enabled control; Escape goes back with the Rust selection restored.
 await page.keyboard.press("Alt+F10");
 expect(await page.evaluate(()=>window.ext.active())).toMatch(/^slot:slot-a:/);
 await page.keyboard.press("Escape");
 expect(await page.evaluate(()=>window.ext.active())).toBe("surface:a");
 // A pointer activation runs one native command, refreshes the Rust-derived pressed state and returns focus.
 const before=await page.evaluate(()=>window.editors.a.depth());
 await bold.click();
 expect(await page.evaluate(()=>({blocks:window.editors.a.blocks(),depth:window.editors.a.depth(),active:window.ext.active(),errors:window.errors}))).toEqual({blocks:["paragraph:Hello[strong]| a","paragraph:Tail"],depth:before+1,active:"surface:a",errors:[]});
 await expect(bold).toHaveAttribute("aria-pressed","true");
 // Keyboard activation from the external toolbar: Alt+F10, then Enter on Italic.
 await page.keyboard.press("Alt+F10");
 const italic=slot.locator('[data-rich-action="italic"]');await italic.focus();
 await expect(italic).toBeFocused();
 await page.keyboard.press("Enter");
 expect(await page.evaluate(()=>({blocks:window.editors.a.blocks(),depth:window.editors.a.depth(),active:window.ext.active()}))).toEqual({blocks:["paragraph:Hello[breditor-inline/italic,strong]| a","paragraph:Tail"],depth:before+2,active:"surface:a"});
 // One Undo step per command, from the editor's own history.
 await page.keyboard.press("ControlOrMeta+z");
 expect(await page.evaluate(()=>({blocks:window.editors.a.blocks(),depth:window.editors.a.depth()}))).toEqual({blocks:["paragraph:Hello[strong]| a","paragraph:Tail"],depth:before+1});
 await expect(italic).not.toHaveAttribute("aria-pressed","true");
 await slot.locator('[data-rich-action="undo"]').click();
 expect(await page.evaluate(()=>({blocks:window.editors.a.blocks(),depth:window.editors.a.depth(),active:window.ext.active()}))).toEqual({blocks:["paragraph:Hello a","paragraph:Tail"],depth:before,active:"surface:a"});
 // Typing still goes to the text after the round trips.
 await page.evaluate(()=>window.editors.a.select(7));await page.keyboard.type("!");
 expect(await page.evaluate(()=>window.editors.a.blocks()[0])).toBe("paragraph:Hello a!");
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});

test("external toolbar: re-mount, disposal and two editors on one page",async({page})=>{
 await page.evaluate(()=>{window.editors.b=window.ext.open("b",window.ext.slot("slot-b"));window.ext.slot("slot-c");});
 // Each toolbar drives only its own editor.
 await page.evaluate(()=>{window.editors.a.select(0,5);window.editors.b.select(0,5);});
 await page.locator('#slot-b [data-rich-action="bold"]').click();
 expect(await page.evaluate(()=>({a:window.editors.a.blocks()[0],b:window.editors.b.blocks()[0],active:window.ext.active()}))).toEqual({a:"paragraph:Hello a",b:"paragraph:Hello[strong]| b",active:"surface:b"});
 await page.keyboard.press("Alt+F10");expect(await page.evaluate(()=>window.ext.active())).toMatch(/^slot:slot-b:/);
 await page.evaluate(()=>window.editors.a.editor.focus());
 await page.keyboard.press("Alt+F10");expect(await page.evaluate(()=>window.ext.active())).toMatch(/^slot:slot-a:/);
 // One external mount per editor; dispose puts A's toolbar back in its root, in front of the text.
 expect(await page.evaluate(()=>{const a=window.editors.a.editor,attempt=target=>{try{a.mountToolbar(target);return "mounted";}catch(error){return error.message;}};
  const busy=attempt(document.getElementById("slot-c"));a.externalToolbar().dispose();
  return {busy,current:a.externalToolbar(),home:a.toolbar.parentElement.id,next:a.toolbar.nextElementSibling===a.surface,slotA:document.getElementById("slot-a").childElementCount};
 })).toEqual({busy:"This editor's toolbar is already mounted in an external container",current:null,home:"host-a",next:true,slotA:0});
 await expect(page.locator('#host-a > [role=toolbar] [data-rich-action="bold"]')).toBeVisible();
 // Cross-editor use is refused: B's container, B's root, B's wrapper; the editor stays usable afterwards.
 expect(await page.evaluate(()=>{const a=window.editors.a.editor,attempt=target=>{try{a.mountToolbar(target);return "mounted";}catch(error){return error.message;}};
  return [attempt(document.getElementById("slot-b")),attempt(document.getElementById("host-b")),attempt(window.editors.b.editor.externalToolbar().element),attempt(window.editors.b.editor.surface)];
 })).toEqual(["The toolbar container already holds another editor's toolbar","The toolbar container must not be inside another editor","The toolbar container must not be inside another editor","The toolbar container must not be inside editable content"]);
 // Re-mount A into a different container: same widgets, still one command per activation and Alt+F10.
 await page.evaluate(()=>{window.editors.a.editor.mountToolbar(document.getElementById("slot-c"));window.editors.a.select(6,7);});
 await expect(page.locator("#host-a [role=toolbar]")).toHaveCount(0);
 await page.locator('#slot-c [data-rich-action="italic"]').click();
 expect(await page.evaluate(()=>({a:window.editors.a.blocks()[0],b:window.editors.b.blocks()[0],active:window.ext.active()}))).toEqual({a:"paragraph:Hello |a[breditor-inline/italic]",b:"paragraph:Hello[strong]| b",active:"surface:a"});
 await page.keyboard.press("Alt+F10");expect(await page.evaluate(()=>window.ext.active())).toMatch(/^slot:slot-c:/);
 await page.keyboard.press("Escape");expect(await page.evaluate(()=>window.ext.active())).toBe("surface:a");
 // Disposing an editor removes its external toolbar and leaves the other editor's in place.
 expect(await page.evaluate(()=>{window.editors.a.editor.dispose();return {c:document.getElementById("slot-c").childElementCount,b:document.querySelector("#slot-b [role=toolbar]")===window.editors.b.editor.toolbar};})).toEqual({c:0,b:true});
 await page.locator('#slot-b [data-rich-action="undo"]').click();
 expect(await page.evaluate(()=>({b:window.editors.b.blocks()[0],errors:window.errors}))).toEqual({b:"paragraph:Hello b",errors:[]});
});
