import {test,expect} from "@playwright/test";
// Opt-in standard-toolbar layout (docs/TOOLBAR_LAYOUT.md) over the real Rust/Wasm V4 owner: dropdown groups,
// separators and "group when full" overflow. Every item is the admitted control itself: one native command,
// one Undo step, focus back to the text, and the WAI-ARIA toolbar keeps a single roving tab stop.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const api=await import("/rich.js");
  const text=value=>value?[{kind:"text",text:value,formats:[]}]:[];
  const node=(type,id,children=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":id},children});
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[node("paragraph","p",text("Hello layout")),node("paragraph","tail",text("Tail"))]};
  const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
  const profile=api.compileStandardRichProfileV4(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:9,schema:{name:"example/toolbar-layout",version:4},extensions:[]}));
  const presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson()),binding=profile.descriptor();
  const host=document.createElement("main");host.style.cssText="width:1000px;margin:40px";document.body.append(host);window.errors=[];
  const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)}));
  const toolbar=api.createRichToolbarV4(core,presentation),ids=toolbar.map(control=>control.id);
  const inline=["bold","italic","underline","strike","code"].filter(id=>ids.includes(id)),lists=["bullet","numbered"].filter(id=>ids.includes(id));
  const toolbarLayout={groupWhenFull:true,items:["undo","redo","|",{kind:"group",id:"text",label:"Text style",items:inline},"|",...lists,"|","link"]};
  window.editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,toolbar,toolbarLayout,onError:error=>window.errors.push(String(error))});window.core=core;
  const blocks=()=>JSON.parse(core.view().documentJson).root.children.map(block=>`${block.type.replace("breditor/","")}:${block.children.filter(c=>c.kind==="text").map(c=>c.text+(c.formats.length?`[${c.formats.map(f=>f.type.replace(/^breditor(-inline)?\//u,"")).join(",")}]`:"")).join("|")}`);
  const select=(block,start,end=start)=>window.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}},true);
  const more=()=>window.editor.toolbar.querySelector("[data-breditor-toolbar-more]");
  const active=()=>{const a=document.activeElement;if(a===window.editor.surface)return "surface";if(!a||!window.editor.toolbar.contains(a))return a?.tagName??"none";const where=a.closest(".breditor-toolbar-popup")?"popup":"bar";return `${where}:${a.dataset.richAction??a.dataset.breditorToolbarGroupButton??(a.hasAttribute("data-breditor-toolbar-more")?"more":a.tagName)}`;};
  window.layout={host,blocks,select,more,active,inline,lists,state:()=>window.editor.toolbarLayoutState(),depth:()=>core.view().undoDepth,
   tabStops:()=>[...window.editor.toolbar.querySelectorAll("button,summary,input,select")].filter(n=>n.tabIndex===0&&!n.disabled&&n.getClientRects().length).length};
 });
});

test("group when full: narrow widths move trailing items into Show more items and widening restores them",async({page})=>{
 const toolbar=page.getByRole("toolbar",{name:"Rich text formatting"});
 await expect(toolbar).toBeVisible();
 const total=await page.evaluate(()=>window.editor.contextControlIds().length);
 // Unlisted admitted controls follow the listed items, so even 1000px overflows a little.
 await expect.poll(()=>page.evaluate(()=>window.layout.state().overflow.length)).toBeGreaterThan(0);
 const wide=await page.evaluate(()=>window.layout.state().overflow);
 await page.evaluate(()=>{window.layout.host.style.width="360px";});
 await expect.poll(()=>page.evaluate(()=>window.layout.state().overflow.length)).toBeGreaterThan(wide.length);
 const narrow=await page.evaluate(()=>{
  const row=window.editor.toolbar.querySelector(".breditor-toolbar-row"),box=row.getBoundingClientRect();
  return {state:window.layout.state(),fits:[...row.children].filter(c=>!c.hidden).every(c=>c.getBoundingClientRect().right<=box.right+0.5),rows:window.editor.toolbar.querySelectorAll(".breditor-toolbar-row").length};
 });
 expect(narrow.fits).toBe(true);expect(narrow.rows).toBe(1);expect(narrow.state.overflow).toContain("link");expect(narrow.state.overflow.length).toBeLessThan(total);
 // Every admitted control is either in the row or in the menu, exactly once.
 expect(await page.evaluate(()=>[...window.editor.toolbar.querySelectorAll("[data-rich-control]")].length)).toBe(total);
 const more=toolbar.getByRole("button",{name:"Show more items"});await expect(more).toBeVisible();await expect(more).toHaveAttribute("aria-expanded","false");
 // The coordinator caps its root at 1100px, so widening back restores exactly the wide arrangement.
 await page.evaluate(()=>{window.layout.host.style.width="1000px";});
 await expect.poll(()=>page.evaluate(()=>window.layout.state().overflow)).toEqual(wide);
 // Restored in declared order: the listed items lead the row.
 expect(await page.evaluate(()=>[...window.editor.toolbar.querySelector(".breditor-toolbar-row").children].slice(0,4).map(c=>c.dataset.richControl??c.dataset.breditorToolbarGroup??c.getAttribute("role")))).toEqual(["undo","redo","separator","text"]);
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});

test("keyboard: one roving tab stop, a dropdown group and the overflow menu run admitted commands with one Undo step",async({page})=>{
 await page.evaluate(()=>{window.layout.host.style.width="420px";window.layout.select("p",0,5);});
 await expect.poll(()=>page.evaluate(()=>window.layout.state().overflow.includes("bullet"))).toBe(true);
 expect(await page.evaluate(()=>window.layout.state().overflow.includes("text"))).toBe(false);
 expect(await page.evaluate(()=>window.layout.tabStops())).toBe(1);
 // The single tab stop is the first enabled item: Undo and Redo have no history yet, so the text group.
 await page.evaluate(()=>window.editor.toolbar.querySelector("[tabindex='0']").focus());
 expect(await page.evaluate(()=>window.layout.active())).toBe("bar:text");
 await page.keyboard.press("ArrowRight");expect(await page.evaluate(()=>window.layout.active())).not.toBe("bar:text");
 await page.keyboard.press("ArrowLeft");expect(await page.evaluate(()=>window.layout.active())).toBe("bar:text");
 const group=page.getByRole("button",{name:"Text style"});await expect(group).toHaveAttribute("aria-expanded","false");
 await expect(group).toHaveAttribute("data-breditor-group-state","inactive");
 await page.keyboard.press("ArrowDown");await expect(group).toHaveAttribute("aria-expanded","true");
 await expect(page.getByRole("group",{name:"Text style"})).toBeVisible();
 expect(await page.evaluate(()=>window.layout.active())).toBe("popup:bold");
 await page.keyboard.press("ArrowDown");expect(await page.evaluate(()=>window.layout.active())).toBe("popup:italic");
 await page.keyboard.press("Escape");expect(await page.evaluate(()=>window.layout.active())).toBe("bar:text");await expect(group).toHaveAttribute("aria-expanded","false");
 const before=await page.evaluate(()=>window.layout.depth());
 await page.keyboard.press("Enter");expect(await page.evaluate(()=>window.layout.active())).toBe("popup:bold");
 await page.keyboard.press("Enter");
 expect(await page.evaluate(()=>window.layout.active())).toBe("surface");
 expect(await page.evaluate(()=>window.layout.blocks()[0])).toBe("paragraph:Hello[strong]| layout");
 expect(await page.evaluate(()=>window.layout.depth())).toBe(before+1);
 await expect(group).toHaveAttribute("data-breditor-group-state","active");await expect(group).toHaveAttribute("aria-expanded","false");
 // The overflow menu: End reaches "Show more items", ArrowDown opens onto its first enabled item.
 await page.evaluate(()=>window.editor.toolbar.querySelector("[tabindex='0']").focus());
 await page.keyboard.press("End");expect(await page.evaluate(()=>window.layout.active())).toBe("bar:more");
 await page.keyboard.press("ArrowDown");
 const more=page.getByRole("button",{name:"Show more items"});await expect(more).toHaveAttribute("aria-expanded","true");
 expect(await page.evaluate(()=>window.layout.active())).toMatch(/^popup:/);
 for(let step=0;step<40&&await page.evaluate(()=>window.layout.active())!=="popup:bullet";step+=1)await page.keyboard.press("ArrowDown");
 expect(await page.evaluate(()=>window.layout.active())).toBe("popup:bullet");
 await page.keyboard.press("Escape");expect(await page.evaluate(()=>window.layout.active())).toBe("bar:more");await expect(more).toHaveAttribute("aria-expanded","false");
 await page.keyboard.press("Escape");expect(await page.evaluate(()=>window.layout.active())).toBe("surface");
 await page.evaluate(()=>window.editor.toolbar.querySelector("[tabindex='0']").focus());expect(await page.evaluate(()=>window.layout.active())).toBe("bar:more");
 await page.keyboard.press("ArrowDown");
 for(let step=0;step<40&&await page.evaluate(()=>window.layout.active())!=="popup:bullet";step+=1)await page.keyboard.press("ArrowDown");
 await page.keyboard.press("Enter");
 expect(await page.evaluate(()=>window.layout.active())).toBe("surface");await expect(more).toHaveAttribute("aria-expanded","false");
 expect(await page.evaluate(()=>window.layout.blocks()[0])).toMatch(/^bullet|list/u);
 expect(await page.evaluate(()=>window.layout.depth())).toBe(before+2);
 // Undo from the editor reverses exactly one step per toolbar command.
 const modifier=process.platform==="darwin"?"Meta":"Control";
 await page.keyboard.press(`${modifier}+z`);expect(await page.evaluate(()=>window.layout.blocks()[0])).toBe("paragraph:Hello[strong]| layout");
 await page.keyboard.press(`${modifier}+z`);expect(await page.evaluate(()=>window.layout.blocks()[0])).toBe("paragraph:Hello layout");
 await expect(page.getByRole("button",{name:"Text style"})).toHaveAttribute("data-breditor-group-state","inactive");
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});

test("pointer: opening a group keeps the editor selection and a click outside closes it",async({page})=>{
 await page.evaluate(()=>{window.layout.select("p",6,12);window.editor.focus();});
 const group=page.getByRole("button",{name:"Text style"});
 await group.click();await expect(group).toHaveAttribute("aria-expanded","true");
 expect(await page.evaluate(()=>window.layout.active())).toBe("surface");
 await page.getByRole("group",{name:"Text style"}).getByRole("button",{name:"Italic"}).click();
 expect(await page.evaluate(()=>window.layout.blocks()[0])).toBe("paragraph:Hello |layout[italic]");
 await expect(group).toHaveAttribute("aria-expanded","false");
 await group.click();await expect(group).toHaveAttribute("aria-expanded","true");
 await page.mouse.click(5,5);await expect(group).toHaveAttribute("aria-expanded","false");
 expect(await page.evaluate(()=>window.errors)).toEqual([]);
});
