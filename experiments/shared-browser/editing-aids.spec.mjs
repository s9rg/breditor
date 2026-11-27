import {test,expect} from "@playwright/test";
// Opt-in editing aids (docs/EDITING_AIDS.md) on one writer of a real two-writer shared rich V4 room. The aids are
// presentation only: they never produce a frame, a publication or an Undo step, the peer's view is unaffected, and
// the aided writer's overlay repaints as peer edits arrive.
test.beforeEach(async({page})=>{
 await page.setViewportSize({width:1200,height:1600});
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const {structureFixtureV4,paragraph,section,table}=await import("/v4-fixture-structure.mjs"),rich=await import("/rich.js");
  const t=structureFixtureV4(window.sharedTools,{children:[paragraph("intro","Shared intro"),paragraph("one","one two three"),section("sec","More",[paragraph("inside","Inside text")]),table("tbl"),paragraph("tail","Tail")]});
  const aids=rich.mountRichEditingAids(t.da,{focus:true}),controls=rich.mountRichEditingAidsControls(t.da.toolbar,aids);
  const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  window.v4={...t,aids,controls,frame};
 });
});
const settle=page=>page.evaluate(()=>window.v4.frame());
const snapshot=page=>page.evaluate(()=>{const t=window.v4;return {a:t.a.documentJson(),b:t.b.documentJson(),revisionA:t.a.view().revision,revisionB:t.b.view().revision,undoA:t.a.view().undoDepth,undoB:t.b.view().undoDepth,htmlB:document.querySelector("#b .breditor-shared-surface").innerHTML};});

test("toggling the aids on one writer is not a shared edit and leaves the peer's view unchanged",async({page})=>{
 await page.evaluate(()=>window.v4.synchronize());
 const before=await snapshot(page);
 await page.locator('#a [data-aid-toggle="show-blocks"]').click();
 await page.locator('#a [data-aid-toggle="invisibles"]').click();
 await settle(page);
 await expect(page.locator('#a [data-aid-toggle="show-blocks"]')).toHaveAttribute("aria-pressed","true");
 const painted=await page.evaluate(()=>{
  const overlay=window.v4.aids.overlay,a=document.querySelector("#a .breditor-shared-surface").getBoundingClientRect();
  const labels=Object.fromEntries([...overlay.querySelectorAll(".breditor-aid-label")].map(label=>[label.dataset.aidLabel,label.textContent]));
  const inside=[...overlay.querySelectorAll(".breditor-aid-block,.breditor-aid-char")].every(node=>{const r=node.getBoundingClientRect();return r.left>=a.left-1&&r.right<=a.right+1&&r.top>=a.top-1&&r.bottom<=a.bottom+1;});
  const kinds={};for(const mark of overlay.querySelectorAll(".breditor-aid-char"))kinds[mark.dataset.aidKind]=(kinds[mark.dataset.aidKind]??0)+1;
  return {labels,inside,kinds,overlays:document.querySelectorAll("[data-breditor-editing-aids]").length};
 });
 expect(painted.labels).toMatchObject({intro:"Paragraph",one:"Paragraph",sec:"Collapsible section","sec-sum":"Section summary",inside:"Paragraph",tbl:"Table",tail:"Paragraph"});
 expect(painted.inside).toBe(true);expect(painted.overlays).toBe(1);
 expect(painted.kinds).toMatchObject({nbsp:1,blockEnd:9});
 // No frame was produced and neither replica, history nor the peer's DOM changed.
 const exchanged=await page.evaluate(async()=>{const t=window.v4;await t.synchronize();return t.errors;});
 expect(exchanged).toEqual([]);
 expect(await snapshot(page)).toEqual(before);
 await expect(page.locator("#b [data-breditor-focused]")).toHaveCount(0);
});

test("typing with the aids on converges exactly and the aided overlay follows peer edits",async({page})=>{
 await page.evaluate(()=>{const t=window.v4;t.aids.setShowBlocks(true);t.aids.setInvisibles(true);});
 await page.locator('#a p[data-rich-text="intro"]').click();
 await page.keyboard.press("End");await page.keyboard.type(" by Alice");
 await expect(page.locator("#a [data-breditor-focused]")).toHaveAttribute("data-rich-block","intro");
 const spaces=()=>page.evaluate(()=>window.v4.aids.overlay.querySelectorAll('.breditor-aid-char[data-aid-kind="space"]').length);
 await settle(page);const mine=await spaces();
 // The peer types three more spaces into another paragraph; A's overlay repaints when the frame arrives.
 const merged=await page.evaluate(async()=>{const t=window.v4;t.b.dispatch({commands:[{kind:"insert_text",data:{block:"tail",offset:4,text:" a b c"}}]});await t.synchronize();await t.frame();
  return {same:t.a.documentJson()===t.b.documentJson(),intro:JSON.parse(t.b.documentJson()).root.children[0].children[0].text,errors:t.errors,undoA:t.a.view().undoDepth};});
 expect(merged).toMatchObject({same:true,intro:"Shared intro by Alice",errors:[]});
 expect(await spaces()).toBe(mine+3);
 await expect(page.locator("#b p[data-rich-text=\"tail\"]")).toHaveText("Tail a b c");
 // A keyboard shortcut in the shared surface toggles presentation only; Undo still removes A's typing.
 await page.locator('#a p[data-rich-text="intro"]').click();
 await page.keyboard.press("Control+Alt+Shift+KeyB");
 expect(await page.evaluate(()=>window.v4.aids.state().showBlocks)).toBe(false);
 expect(await page.evaluate(()=>window.v4.a.view().undoDepth)).toBe(merged.undoA);
 const undone=await page.evaluate(async()=>{const t=window.v4;t.a.undo();await t.synchronize();return JSON.parse(t.b.documentJson()).root.children[0].children[0].text;});
 // The fixture room keeps explicit (per-input) history: Undo removes the last typed character, never a toggle.
 expect(undone).toBe("Shared intro by Alic");
 // Disposing the aids leaves both shared DOMs free of decoration.
 await page.evaluate(()=>{window.v4.controls.dispose();window.v4.aids.dispose();});
 await expect(page.locator("[data-breditor-editing-aids], [data-breditor-focused], [data-breditor-editing-aids-controls]")).toHaveCount(0);
});

test("a minimap on one writer is per viewer, scrolls only that page and follows peer edits",async({page})=>{
 await page.setViewportSize({width:1200,height:300});
 await page.evaluate(async()=>{
  const rich=await import("/rich.js"),t=window.v4;t.controls.dispose();t.aids.dispose();
  const aside=document.createElement("aside");aside.style.cssText="position:fixed;top:0;right:0;width:100px;height:100vh";document.body.append(aside);
  t.aids=rich.mountRichEditingAids(t.da,{minimap:{container:aside}});await t.synchronize();
 });
 const boxes=()=>page.locator("[data-breditor-minimap] .breditor-minimap-block").count();
 await expect.poll(boxes).toBeGreaterThan(5);
 const before=await snapshot(page);
 // Toggling and using the minimap is not a shared edit.
 await page.evaluate(()=>{window.v4.aids.toggleMinimap();window.v4.aids.toggleMinimap();window.scrollTo(0,0);});
 await expect.poll(boxes).toBeGreaterThan(5);
 const map=await page.locator(".breditor-minimap-content").boundingBox();
 await page.mouse.click(map.x+map.width/2,map.y+map.height-2);await settle(page);
 expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(0);
 expect(await page.evaluate(async()=>{await window.v4.synchronize();return window.v4.errors;})).toEqual([]);
 expect(await snapshot(page)).toEqual(before);
 expect(await page.locator("#a [data-breditor-minimap], #b [data-breditor-minimap]").count()).toBe(0);
 expect(await page.locator("[data-breditor-minimap]").getAttribute("aria-hidden")).toBe("true");
 // A peer split adds a block on A when the frame arrives, and A's overview rebuilds.
 const count=await boxes();
 await page.evaluate(async()=>{const t=window.v4;t.b.dispatch({commands:[{kind:"split_text_block",data:{block:"tail",offset:2,right:"tail-right",right_heading:null}}]});await t.synchronize();await t.frame();});
 await expect(page.locator('#a [data-rich-block="tail-right"]')).toHaveCount(1);
 await expect.poll(boxes).toBe(count+1);
 await page.evaluate(()=>window.v4.aids.dispose());
 await expect(page.locator("[data-breditor-minimap]")).toHaveCount(0);
});
