import {test,expect} from "@playwright/test";
// Opt-in local block drag handle mounted by the rich demo, driven by real input against the real Rust/Wasm owner.
const top=page=>page.evaluate(()=>JSON.parse(window.demo.editor.view().documentJson).root.children.map(node=>node.properties["breditor/block-id"]));
const undoDepth=page=>page.evaluate(()=>window.demo.editor.view().undoDepth);
const caretIn=(page,block)=>page.evaluate(block=>{const point={block,offset:"0",affinity:"after"};window.demo.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}});window.demo.editor.focus();},block);
test.beforeEach(async({page})=>{await page.goto("/demo",{waitUntil:"commit"});await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");});

test("Alt+Shift+ArrowUp moves the caret's block as one retained-ID Undo step",async({page})=>{
 const initial=await top(page),depth=await undoDepth(page);expect(initial.slice(0,2)).toEqual(["demo-heading","demo-intro"]);
 await caretIn(page,"demo-intro");await page.keyboard.press("Alt+Shift+ArrowUp");
 await expect.poll(()=>top(page)).toEqual(["demo-intro","demo-heading",...initial.slice(2)]);
 expect(await undoDepth(page)).toBe(depth+1);
 await expect(page.locator('[data-rich-block="demo-intro"]')).toContainText("Type here");
 await page.evaluate(()=>window.demo.editor.execute({kind:"undo"}));
 await expect.poll(()=>top(page)).toEqual(initial);
 const selection=await page.evaluate(()=>window.demo.editor.view().selection);expect(selection.focus.block).toBe("demo-intro");
});

test("dragging the handle drops one moveBlock before the hovered block",async({page})=>{
 const initial=await top(page),depth=await undoDepth(page);
 const intro=page.locator('[data-rich-block="demo-intro"]'),heading=page.locator('[data-rich-block="demo-heading"]');
 await intro.hover();const handle=page.locator(".breditor-block-drag-handle");await expect(handle).toBeVisible();
 const from=await handle.boundingBox(),to=await heading.boundingBox();
 await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
 await page.mouse.move(to.x+to.width/2,to.y+4,{steps:6});
 await expect(page.locator(".breditor-block-drop-indicator")).toHaveAttribute("data-state","valid");
 await page.mouse.up();
 await expect.poll(()=>top(page)).toEqual(["demo-intro","demo-heading",...initial.slice(2)]);
 expect(await undoDepth(page)).toBe(depth+1);
 await page.evaluate(()=>window.demo.editor.execute({kind:"undo"}));await expect.poll(()=>top(page)).toEqual(initial);
});

test("planner and native admission both refuse invalid moves without publication",async({page})=>{
 const before=await page.evaluate(()=>window.demo.editor.view().revision);
 // A table-cell paragraph cannot be reordered outside its cell under the default sibling policy.
 expect(await page.evaluate(()=>window.demo.blockDrag.move("demo-p2",{anchor:"demo-heading",side:"before"}))).toBe(false);
 // Rust refuses a cyclic destination, a foreign anchor and a caption source with no partial change.
 for(const data of [{block:"table-block",parent:"demo-cell2",before:null},{block:"demo-intro",parent:null,before:"demo-p2"},{block:"demo-caption",parent:null,before:null}]){
  const code=await page.evaluate(data=>{try{window.demo.editor.execute({kind:"moveBlock",data});return "accepted";}catch(error){return error.code??error.message;}},data);
  expect(code).not.toBe("accepted");
 }
 expect(await page.evaluate(()=>window.demo.editor.view().revision)).toBe(before);
});
