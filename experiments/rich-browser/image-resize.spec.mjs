import {test,expect} from "@playwright/test";
// Opt-in image resize handles mounted by the rich demo, driven by real pointer drags and keys against the real Rust/Wasm owner.
const imageSize=page=>page.evaluate(()=>{const root=JSON.parse(window.demo.editor.view().documentJson).root;let found=null;
 const walk=node=>{if(node.type==="breditor/image")found=[node.properties["breditor/width"]??null,node.properties["breditor/height"]??null];for(const child of node.children??[])if(child.kind==="element")walk(child);};walk(root);return found;});
const undoDepth=page=>page.evaluate(()=>window.demo.editor.view().undoDepth);
/** The demo mounts image resize right after the column resize extra. */
const preview=page=>page.evaluate(()=>window.demo.extras[4].preview());
test.beforeEach(async({page})=>{await page.goto("/demo");await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");});
const slider=page=>page.getByRole("slider",{name:"Resize image 1 of 1"});
/** Hover the image so its handles show, then return the corner slider's centre. */
async function corner(page){
 const image=page.locator('figure[data-rich-image="image"] img');await image.scrollIntoViewIfNeeded();const box=await image.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await expect(page.locator("[data-image-resize-group]")).toHaveAttribute("data-hover","");
 const handle=await slider(page).boundingBox();return {x:handle.x+handle.width/2,y:handle.y+handle.height/2,image:box};
}

test("the corner slider steps the image size through one resize command per key",async({page})=>{
 const control=slider(page);await expect(control).toHaveAttribute("aria-valuenow","340");await expect(control).toHaveAttribute("aria-valuetext","340 by 150 pixels");
 const before=await undoDepth(page),document=await page.locator(".breditor-rich-surface").innerHTML();
 await control.focus();await page.keyboard.press("ArrowRight");
 await expect(control).toHaveAttribute("aria-valuenow","348");expect(await imageSize(page)).toEqual([348,154]);
 await page.keyboard.press("Shift+ArrowRight");
 await expect(control).toHaveAttribute("aria-valuenow","412");expect(await imageSize(page)).toEqual([412,182]);
 await page.keyboard.press("ArrowDown");await expect(control).toHaveAttribute("aria-valuenow","404");
 expect(await undoDepth(page)).toBe(before+3);await expect(control).toBeFocused();
 await page.keyboard.press("Home");await expect(control).toHaveAttribute("aria-valuenow",/^\d$/);
 await page.evaluate(()=>{window.demo.editor.execute({kind:"undo"});window.demo.editor.execute({kind:"undo"});window.demo.editor.execute({kind:"undo"});window.demo.editor.execute({kind:"undo"});});
 expect(await imageSize(page)).toEqual([340,150]);expect(await page.locator(".breditor-rich-surface").innerHTML()).toBe(document);
});

test("a corner drag previews in the overlay and commits one aspect-preserving resize on release",async({page})=>{
 const before=await undoDepth(page),{x,y}=await corner(page);
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-30,y-4,{steps:3});await page.mouse.move(x-60,y-5,{steps:3});
 const outline=page.locator("[data-image-resize-outline]"),badge=page.locator("[data-image-resize-badge]");
 await expect(outline).toBeVisible();await expect(badge).toBeVisible();
 const live=await preview(page);expect(live.handle).toBe("corner");expect(live.size.width).toBeLessThan(340);
 await expect(badge).toHaveText(`${live.size.width} × ${live.size.height}`);
 expect(await imageSize(page)).toEqual([340,150]);expect(await undoDepth(page)).toBe(before);
 await page.mouse.up();
 await expect(outline).toBeHidden();expect(await preview(page)).toBeNull();
 const [width,height]=await imageSize(page);
 expect(width).toBe(live.size.width);expect(width).toBeLessThan(300);expect(width).toBeGreaterThan(250);
 expect(Math.abs(height-Math.round(width*150/340))).toBeLessThanOrEqual(1);
 expect(await undoDepth(page)).toBe(before+1);
 await page.evaluate(()=>window.demo.editor.execute({kind:"undo"}));expect(await imageSize(page)).toEqual([340,150]);
});

test("Shift frees the corner and the edges change one axis",async({page})=>{
 let {x,y}=await corner(page);
 await page.mouse.move(x,y);await page.mouse.down();await page.keyboard.down("Shift");await page.mouse.move(x-40,y+40,{steps:4});await page.mouse.up();await page.keyboard.up("Shift");
 const [width,height]=await imageSize(page);expect(width).toBeLessThan(340);expect(height).toBeGreaterThan(150);
 const image=await page.locator('figure[data-rich-image="image"] img').boundingBox();
 await page.mouse.move(image.x+image.width/2,image.y+image.height/2);
 const edge=page.locator("[data-image-resize-handle=block-end]"),box=await edge.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+30,{steps:4});await page.mouse.up();
 expect(await imageSize(page)).toEqual([width,height+30]);
});

test("Escape and a remote change to the image cancel a drag without publishing",async({page})=>{
 const before=await undoDepth(page);let {x,y}=await corner(page);
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-50,y,{steps:3});
 expect(await preview(page)).not.toBeNull();await page.keyboard.press("Escape");expect(await preview(page)).toBeNull();
 await page.mouse.move(x-70,y);await page.mouse.up();
 expect(await imageSize(page)).toEqual([340,150]);expect(await undoDepth(page)).toBe(before);
 ({x,y}=await corner(page));
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-50,y,{steps:3});
 // Another writer resizes the same image mid-drag: the drag is cancelled and only that change remains.
 await page.evaluate(()=>window.demo.editor.execute({kind:"resizeImage",data:{image:"image",size:{width:200,height:100}}},false));
 expect(await preview(page)).toBeNull();await page.mouse.move(x-80,y);await page.mouse.up();
 expect(await imageSize(page)).toEqual([200,100]);expect(await undoDepth(page)).toBe(before+1);
});

test("read-only removes the handles; right-to-left content moves the corner to the left",async({page})=>{
 await page.evaluate(()=>window.demo.editor.setReadOnly(true));await expect(page.getByRole("slider")).toHaveCount(0);
 await page.evaluate(()=>window.demo.editor.setReadOnly(false));await expect(slider(page)).toHaveCount(1);
 // Host page direction only (no document change): the image now flows right to left.
 await page.evaluate(()=>{document.getElementById("editor").dir="rtl";window.demo.extras[4].refresh();});
 const image=await page.locator('figure[data-rich-image="image"] img').boundingBox(),handle=await slider(page).boundingBox();
 expect(Math.abs(handle.x+handle.width/2-image.x)).toBeLessThan(2);
 await slider(page).focus();await page.keyboard.press("ArrowLeft");expect(await imageSize(page)).toEqual([348,154]);
 await page.keyboard.press("ArrowRight");expect(await imageSize(page)).toEqual([340,150]);
});
