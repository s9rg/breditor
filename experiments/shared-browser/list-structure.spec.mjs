import {test,expect} from "@playwright/test";
// Multi-block list items and legal numbering on two real shared Rust/Wasm writers (docs/LIST_STRUCTURE.md):
// the same keys as the local editor send `join_list_items` (blocks) / `split_list_item_block` /
// list indent commands; each is one writer-local Undo group and peers converge.
async function mount(page,options={}){
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async options=>{
  const fixture=await import("/structural-fixture.mjs");
  const el=(type,block,children)=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block},children});
  const item=(block,...children)=>el("list-item",block,children);
  const children=options.legal
   ?[{...el("ordered-list","outer",[item("a",fixture.paragraph("pa","a")),item("b",fixture.paragraph("pb","b"),{...el("ordered-list","inner",[item("x",fixture.paragraph("px","x")),item("y",fixture.paragraph("py","y"))]),properties:{"breditor/block-id":"inner","breditor/start":1}})]),properties:{"breditor/block-id":"outer","breditor/start":3}}]
   :[el("bullet-list","list",[item("a",fixture.paragraph("pa","one")),item("b",fixture.paragraph("pb","two"),fixture.paragraph("pb2","more")),item("c",fixture.paragraph("pc","three"))])];
  window.listTest=fixture.structuralFixture(window.sharedTools,{children,...(options.legal?{legalListNumbering:true}:{})});
 },options);
}
const state=page=>page.evaluate(async()=>{const t=window.listTest;await t.synchronize();return {a:t.outline(t.a),same:t.a.documentJson()===t.b.documentJson(),errors:t.errors};});

test("Enter then Backspace makes a later item block; Enter in it splits a new item; peers converge",async({page})=>{
 await mount(page);
 const original=await state(page);
 await page.evaluate(()=>{const t=window.listTest;t.da.focus();t.da.select(t.caret("pa",3));});
 await page.keyboard.press("Enter");await page.keyboard.press("Backspace");await page.keyboard.type("new");
 const joined=await state(page);
 expect(joined.a).toMatch(/^document\[bullet-list#list\[list-item#a\[paragraph#pa\['one'\],paragraph#[^[']+\['new'\]\],list-item#b\[paragraph#pb\['two'\],paragraph#pb2\['more'\]\],list-item#c\[paragraph#pc\['three'\]\]\]\]$/);
 expect(joined).toMatchObject({same:true,errors:[]});
 await expect(page.locator('#b li[data-rich-block="a"] > p')).toHaveCount(2);
 // Writer B types in the moved block while writer A splits item b at its later empty paragraph.
 await page.evaluate(()=>{const t=window.listTest;t.da.select(t.caret("pb2",4));});
 await page.keyboard.press("Enter");
 const before=await page.evaluate(()=>window.listTest.a.view().undoDepth);
 await page.keyboard.press("Enter");
 expect(await page.evaluate(()=>window.listTest.a.view().undoDepth)).toBe(before+1);
 const split=await state(page);
 expect(split.a).toMatch(/list-item#b\[paragraph#pb\['two'\],paragraph#pb2\['more'\]\],list-item#[^[]+\[paragraph#[^[']+\],list-item#c/);
 expect(split).toMatchObject({same:true,errors:[]});
 const undone=await page.evaluate(async()=>{const t=window.listTest;t.b.dispatch({commands:[{kind:"insert_text",data:{block:"pb2",offset:0,text:"B"}}]});await t.synchronize();t.a.undo();await t.synchronize();return {a:t.outline(t.b),errors:t.errors};});
 expect(undone.a).toContain("list-item#b[paragraph#pb['two'],paragraph#pb2['Bmore'],paragraph#");
 // Undo everything writer A did; the peer's typing stays.
 const restored=await page.evaluate(async()=>{const t=window.listTest;while(t.a.view().undoDepth>0)t.a.undo();await t.synchronize();return t.outline(t.b);});
 expect(restored).toBe(original.a.replace("paragraph#pb2['more']","paragraph#pb2['Bmore']"));
 expect((await state(page)).errors).toEqual([]);
});

test("Tab and Shift+Tab in a later block move the whole item for both writers",async({page})=>{
 await mount(page);
 await page.evaluate(()=>{const t=window.listTest;t.da.focus();t.da.select(t.caret("pb2",1));});
 await page.keyboard.press("Tab");
 const nested=await state(page);
 expect(nested.a).toMatch(/^document\[bullet-list#list\[list-item#a\[paragraph#pa\['one'\],bullet-list#[^[]+\[list-item#b\[paragraph#pb\['two'\],paragraph#pb2\['more'\]\]\]\],list-item#c/);
 expect(nested).toMatchObject({same:true,errors:[]});
 await page.keyboard.press("Shift+Tab");
 const back=await state(page);
 expect(back.a).toMatch(/^document\[bullet-list#list\[list-item#a\[paragraph#pa\['one'\]\],list-item#b\[paragraph#pb\['two'\],paragraph#pb2\['more'\]\],list-item#c/);
 expect(back).toMatchObject({same:true,errors:[]});
});

test("legal numbering is presentation on each writer and follows remote structure",async({page})=>{
 await mount(page,{legal:true});
 const markers=side=>page.locator(`#${side} li[data-rich-legal-marker]`).evaluateAll(items=>items.map(item=>`${item.dataset.richBlock}=${item.dataset.richLegalMarker}`));
 expect(await markers("a")).toEqual(["a=3.","b=4.","x=4.1.","y=4.2."]);
 expect(await markers("b")).toEqual(["a=3.","b=4.","x=4.1.","y=4.2."]);
 // Writer B indents y under x; writer A's markers follow after synchronization.
 await page.evaluate(async()=>{const t=window.listTest;t.b.dispatch({commands:[{kind:"indent_list_items",data:{container:"inner",first:"y",last:"y",new_nested:{block:"deep",style:{kind:"ordered",start:1}}}}]});await t.synchronize();});
 await expect(page.locator('#a li[data-rich-block="y"]')).toHaveAttribute("data-rich-legal-marker","4.1.1.");
 expect((await state(page)).errors).toEqual([]);
});
