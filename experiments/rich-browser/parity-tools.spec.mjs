import {test,expect} from "@playwright/test";
// Opt-in parity tools mounted by the rich demo, driven by real input against the real Rust/Wasm owner.
const caretAtEnd=(page,block)=>page.evaluate(block=>{const view=window.demo.editor.view(),root=JSON.parse(view.documentJson).root;let length=0;
 const walk=node=>{if(node.properties?.["breditor/block-id"]===block){length=node.children.reduce((sum,child)=>sum+(child.kind==="text"?child.text.length:0),0);return true;}return node.children?.some(child=>child.kind==="element"&&walk(child));};walk(root);
 const point={block,offset:String(length),affinity:"after"};window.demo.editor.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}});window.demo.editor.focus();},block);
test.beforeEach(async({page})=>{await page.goto("/demo");await expect(page.locator("#ready")).toHaveText("Ready — real Rust/Wasm editor");});

test("a typed slash opens the command menu and runs an existing command as two Undo steps",async({page})=>{
 await caretAtEnd(page,"demo-footer");await page.keyboard.type(" /");
 const listbox=page.locator("[data-breditor-slash] [role=listbox]");await expect(listbox).toBeVisible();
 await page.keyboard.type("hea");await expect(listbox.getByRole("option")).toHaveText(["Heading 1","Heading 2","Heading 3"]);
 await expect(page.locator(".breditor-rich-surface")).toHaveAttribute("aria-expanded","true");
 await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
 const footer=page.locator('[data-rich-block="demo-footer"]');
 await expect(footer).toHaveJSProperty("tagName","H2");await expect(footer).not.toContainText("/hea");await expect(listbox).toBeHidden();
 await page.evaluate(()=>window.demo.editor.execute({kind:"undo"}));await expect(footer).toHaveJSProperty("tagName","P");await expect(footer).not.toContainText("/hea");
 await page.evaluate(()=>window.demo.editor.execute({kind:"undo"}));await expect(footer).toContainText(" /hea");
});

test("table column separators resize through one width command per step",async({page})=>{
 const separator=page.getByRole("separator",{name:"Resize column 1 of 2"});await expect(separator).toHaveAttribute("aria-valuenow","380");
 const undo=()=>page.evaluate(()=>window.demo.editor.view().undoDepth),before=await undo();
 await separator.focus();await page.keyboard.press("ArrowRight");await expect(separator).toHaveAttribute("aria-valuenow","388");
 await page.keyboard.press("Shift+ArrowRight");await expect(separator).toHaveAttribute("aria-valuenow","452");
 expect(await undo()).toBe(before+2);await expect(separator).toBeFocused();
 const box=await separator.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+20);await page.mouse.down();await page.mouse.move(box.x+box.width/2-40,box.y+20,{steps:4});await page.mouse.up();
 const width=Number(await separator.getAttribute("aria-valuenow"));expect(width).toBeLessThan(452);expect(width).toBeGreaterThan(400);expect(await undo()).toBe(before+3);
});

test("selection toolbar and context menu reuse the editor's own controls",async({page})=>{
 const cell=page.locator('[data-rich-block="demo-p2"]');await cell.dblclick({position:{x:12,y:8}});
 const toolbar=page.locator("[data-breditor-context-ui=selection-toolbar]");await expect(toolbar).toBeVisible();
 await toolbar.getByRole("button",{name:"Bold"}).click();await expect(cell.locator("strong")).toHaveCount(1);await expect(page.locator(".breditor-rich-surface")).toBeFocused();
 const menu=page.locator("[data-breditor-context-ui=menu]");await cell.click({button:"right",position:{x:60,y:8}});
 await expect(menu).toBeVisible();await expect(menu.getByRole("menuitem",{name:"Undo"})).toBeFocused();
 await page.keyboard.press("Escape");await expect(menu).toBeHidden();await expect(page.locator(".breditor-rich-surface")).toBeFocused();
 await page.keyboard.press("Shift+F10");await expect(menu).toBeVisible();await page.keyboard.press("Escape");await expect(menu).toBeHidden();
});
