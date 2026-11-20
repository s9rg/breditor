import {test,expect} from "@playwright/test";
// Opt-in `markdown-v1` input rules on two real shared Rust/Wasm writers: typed list shortcuts and code-block
// Enter are exclusive native calls (one writer-local Undo group each); peers converge on the same structure.
async function mount(page,children,inputRules=["markdown-v1"]){
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async({children,inputRules})=>{
  const fixture=await import("/structural-fixture.mjs"),refused=[];
  const nodes=children.map(([kind,block,value])=>fixture[kind](block,value));
  window.ruleTest={...fixture.structuralFixture(window.sharedTools,{children:nodes,...(inputRules?{inputRules}:{})}),refused};
 },{children,inputRules});
}
const state=page=>page.evaluate(async()=>{const t=window.ruleTest;await t.synchronize();return {a:t.outline(t.a),same:t.a.documentJson()===t.b.documentJson(),errors:t.errors};});

test("typing '- ' at a block start wraps it in a bullet list; one Undo restores the literal marker",async({page})=>{
 await mount(page,[["paragraph","intro","Intro"],["paragraph","item","Item"]]);
 await page.evaluate(()=>{const t=window.ruleTest;t.da.select(t.caret("item",0));});
 await page.keyboard.type("- ");
 await expect(page.locator('#a ul [data-rich-text="item"]')).toHaveText("Item");
 const after=await state(page);
 expect(after.a).toMatch(/^document\[paragraph#intro\['Intro'\],bullet-list#[^[]+\[list-item#[^[]+\[paragraph#item\['Item'\]\]\]\]$/);
 expect(after).toMatchObject({same:true,errors:[]});
 await expect(page.locator('#b ul [data-rich-text="item"]')).toHaveText("Item");
 // The peer edits the item text; writer A's Undo removes only the conversion and keeps the peer's text.
 const result=await page.evaluate(async()=>{const t=window.ruleTest;t.b.dispatch({commands:[{kind:"insert_text",data:{block:"item",offset:4,text:"!"}}]});await t.synchronize();t.a.undo();await t.synchronize();const undone=t.outline(t.b);t.a.redo();await t.synchronize();return {undone,redo:t.outline(t.a),errors:t.errors};});
 expect(result.undone).toBe("document[paragraph#intro['Intro'],paragraph#item['- Item!']]");
 expect(result.redo).toMatch(/^document\[paragraph#intro\['Intro'\],bullet-list#[^[]+\[list-item#[^[]+\[paragraph#item\['Item!'\]\]\]\]$/);
 expect(result.errors).toEqual([]);
});

test("typing '1. ' starts a numbered list and Enter in a list item continues the list for the peer",async({page})=>{
 await mount(page,[["paragraph","first",""]]);
 await page.evaluate(()=>{const t=window.ruleTest;t.da.select(t.caret("first",0));});
 await page.keyboard.type("1. One");await page.keyboard.press("Enter");await page.keyboard.type("Two");
 const after=await state(page);
 expect(after.a).toMatch(/^document\[ordered-list#[^[]+\[list-item#[^[]+\[paragraph#first\['One'\]\],list-item#[^[]+\[paragraph#[^[]+\['Two'\]\]\]\]$/);
 expect(after).toMatchObject({same:true,errors:[]});
 await expect(page.locator('#b ol li')).toHaveText(["One","Two"]);
});

test("without the opt-in, '- ' stays literal text",async({page})=>{
 await mount(page,[["paragraph","item","Item"]],null);
 await page.evaluate(()=>{const t=window.ruleTest;t.da.select(t.caret("item",0));});
 await page.keyboard.type("- ");
 expect(await state(page)).toEqual({a:"document[paragraph#item['- Item']]",same:true,errors:[]});
});

test("code-block Enter inserts lines; Enter after a blank last line exits, and one Undo keeps the typed line",async({page})=>{
 await mount(page,[["codeBlock","code","fn x"],["paragraph","after","z"]]);
 await page.evaluate(()=>{const t=window.ruleTest;t.da.select(t.caret("code",4));});
 await page.keyboard.press("Enter");await page.keyboard.press("Enter");
 expect(await state(page)).toEqual({a:"document[code-block#code['fn x\n\n'],paragraph#after['z']]",same:true,errors:[]});
 const depth=await page.evaluate(()=>window.ruleTest.a.view().undoDepth);
 await page.keyboard.press("Enter");
 const exited=await state(page);
 expect(exited.a).toMatch(/^document\[code-block#code\['fn x'\],paragraph#[^[']+,paragraph#after\['z'\]\]$/);
 expect(exited).toMatchObject({same:true,errors:[]});
 await page.keyboard.type("Next");
 const result=await page.evaluate(async({depth})=>{const t=window.ruleTest;await t.synchronize();const typed=t.outline(t.b),caret=t.a.view().selection.focus.offset;
  // Undo "Next" (four plain keystrokes), then the exit: the typed Enter stays as literal code text.
  for(let i=0;i<4;i++)t.a.undo();await t.synchronize();const exit=t.a.view().undoDepth-depth;t.a.undo();await t.synchronize();const undone=t.outline(t.b);t.a.redo();await t.synchronize();return {typed,caret,exit,undone,redo:t.outline(t.b),errors:t.errors};},{depth});
 expect(result.typed).toMatch(/^document\[code-block#code\['fn x'\],paragraph#[^[']+\['Next'\],paragraph#after\['z'\]\]$/);
 expect(result.redo).toMatch(/^document\[code-block#code\['fn x'\],paragraph#[^[']+,paragraph#after\['z'\]\]$/);
 // The exit is the typed key plus the conversion (two groups, as in list_input_rule_contracts.rs).
 expect(result).toMatchObject({caret:"4",exit:2,undone:"document[code-block#code['fn x\n\n\n'],paragraph#after['z']]",errors:[]});
});
