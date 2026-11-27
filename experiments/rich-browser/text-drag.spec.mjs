import {test,expect} from "@playwright/test";
// Native inline drag-and-drop in the rich demo, driven by a real mouse drag against the real Rust/Wasm owner.
const blockText=(page,block)=>page.evaluate(block=>{const find=node=>node.properties?.["breditor/block-id"]===block?node:(node.children??[]).map(find).find(Boolean);return find(JSON.parse(window.demo.editor.view().documentJson).root).children.map(child=>child.text??"").join("");},block);
const undoDepth=page=>page.evaluate(()=>window.demo.editor.view().undoDepth);
/** Select [start,end) of a block logically and return the viewport centre of the selected text. */
const select=(page,block,start,end)=>page.evaluate(([block,start,end])=>{
 const point=offset=>({block,offset:String(offset),affinity:"after"});
 document.querySelector(`[data-rich-text="${block}"]`).scrollIntoView({block:"center"});
 window.demo.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:point(start),focus:point(end)}});window.demo.editor.focus();
 const box=window.getSelection().getRangeAt(0).getBoundingClientRect();return {x:box.left+box.width/2,y:box.top+box.height/2};
},[block,start,end]);
/** Viewport position just inside the end of a block's text. */
const endOf=(page,block)=>page.evaluate(block=>{
 const element=document.querySelector(`[data-rich-text="${block}"]`),walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let last=null;for(let node=walker.nextNode();node;node=walker.nextNode())last=node;
 const range=document.createRange();range.setStart(last,last.length-1);range.setEnd(last,last.length);const box=range.getBoundingClientRect();return {x:box.right-1,y:box.top+box.height/2};
},block);
async function dragTo(page,from,to,{hold}={}){
 await page.mouse.move(from.x,from.y);await page.mouse.down();
 // Chromium on macOS starts a text-selection drag only after the press is held (its text drag delay).
 await page.waitForTimeout(300);
 await page.mouse.move(from.x+8,from.y,{steps:3});
 if(hold)await page.keyboard.down(hold);
 await page.mouse.move(to.x,to.y,{steps:8});
}
test.beforeEach(async({page})=>{await page.goto("/demo",{waitUntil:"commit"});await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");});

test("dragging selected text moves it as one Undo step and shows an inert drop cursor",async({page})=>{
 const heading=await blockText(page,"demo-heading"),intro=await blockText(page,"demo-intro"),depth=await undoDepth(page);
 expect(intro.startsWith("Type here")).toBe(true);
 const from=await select(page,"demo-intro",0,4),to=await endOf(page,"demo-heading");
 await dragTo(page,from,to);
 const cursor=page.locator(".breditor-text-drop-cursor");
 await expect(cursor).toHaveAttribute("data-state","valid");await expect(cursor).toHaveAttribute("aria-hidden","true");await expect(cursor).toHaveAttribute("inert","");
 await page.mouse.up();
 await expect.poll(()=>blockText(page,"demo-intro")).toBe(intro.slice(4));
 // The pointer sits just inside the last character, so the caret resolves before or after it.
 const moved=await blockText(page,"demo-heading");expect(moved.replace("Type","")).toBe(heading);expect(moved).toContain("Type");
 expect(await undoDepth(page)).toBe(depth+1);await expect(cursor).toBeHidden();
 const selection=await page.evaluate(()=>window.demo.editor.view().selection);expect(selection.anchor.block).toBe("demo-heading");expect(Number(selection.focus.offset)-Number(selection.anchor.offset)).toBe(4);
 await page.evaluate(()=>window.demo.editor.execute({kind:"undo"}));
 await expect.poll(()=>blockText(page,"demo-heading")).toBe(heading);expect(await blockText(page,"demo-intro")).toBe(intro);
});

test("the platform copy modifier duplicates the dragged text",async({page})=>{
 const heading=await blockText(page,"demo-heading"),intro=await blockText(page,"demo-intro"),depth=await undoDepth(page);
 const mac=await page.evaluate(()=>/Mac/.test(navigator.platform));
 const from=await select(page,"demo-intro",0,4),to=await endOf(page,"demo-heading");
 await dragTo(page,from,to,{hold:mac?"Alt":"Control"});await page.mouse.up();await page.keyboard.up(mac?"Alt":"Control");
 await expect.poll(()=>blockText(page,"demo-heading")).not.toBe(heading);
 expect(await blockText(page,"demo-intro")).toBe(intro);expect(await undoDepth(page)).toBe(depth+1);
});

test("a drop inside the dragged range publishes nothing",async({page})=>{
 const intro=await blockText(page,"demo-intro"),from=await select(page,"demo-intro",0,9),depth=await undoDepth(page);
 const inside=await page.evaluate(()=>{const element=document.querySelector('[data-rich-text="demo-intro"]'),walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),node=walker.nextNode(),range=document.createRange();range.setStart(node,6);range.setEnd(node,7);const box=range.getBoundingClientRect();return {x:box.left+1,y:box.top+box.height/2};});
 await dragTo(page,{x:from.x-12,y:from.y},inside);
 await expect(page.locator(".breditor-text-drop-cursor")).toHaveAttribute("data-drop-rejected","inside_source");
 await page.mouse.up();
 expect(await blockText(page,"demo-intro")).toBe(intro);
 expect(await undoDepth(page)).toBe(depth);
});
