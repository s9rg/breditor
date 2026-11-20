import {test,expect} from "@playwright/test";
// Opt-in shared slash commands over two real Rust/Wasm writers. Browser routing is the local typed-trigger
// session; choosing an item publishes ONE guarded shared batch (trigger removal + toolbar command), so one Undo
// restores the typed `/query`, and a remote publication that edits the trigger ends the session.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const {structuralFixture,paragraph}=await import("/structural-fixture.mjs"),shared=window.sharedTools;
  const t=structuralFixture(shared,{children:[paragraph("intro","Intro"),paragraph("title","Title")]}),cancels=[],executions=[];
  const slash=shared.mountSharedSlashCommands(t.da,{items:shared.createSharedSlashCommands(t.toolbarA,undefined,t.da.uiLocale()),onCancel:reason=>cancels.push(reason),onExecute:execution=>executions.push(execution.request.commands.map(command=>command.kind))});
  window.slashTest={...t,slash,cancels,executions};
 });
});
const menu=page=>page.locator("[data-breditor-slash]");

test("choosing a shared slash item is one guarded batch: one Undo restores /query while the peer edit stays",async({page})=>{
 await page.evaluate(()=>{const t=window.slashTest;t.da.select(t.caret("title",0));});
 await page.keyboard.type("/head");
 await expect(menu(page).getByRole("option")).toHaveText(["Heading 1","Heading 2","Heading 3"]);
 expect(await page.evaluate(()=>{const s=window.slashTest.slash.state();return {open:s.open,query:s.query,trigger:s.trigger};})).toEqual({open:true,query:"head",trigger:{block:"title",start:0}});
 // A concurrent peer edit elsewhere is published to writer A while the menu is open and does not end the session.
 const depth=await page.evaluate(async()=>{const t=window.slashTest;t.b.dispatch({commands:[{kind:"insert_text",data:{block:"intro",offset:5,text:" from Bob"}}]});await t.synchronize();return t.a.view().undoDepth;});
 await expect(menu(page)).toBeVisible();
 await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
 await expect(page.locator('#a h2[data-rich-text="title"]')).toHaveText("Title");
 const chosen=await page.evaluate(async()=>{const t=window.slashTest;await t.synchronize();return {a:t.outline(t.a),same:t.a.documentJson()===t.b.documentJson(),depth:t.a.view().undoDepth,executions:t.executions,open:t.slash.state().open};});
 expect(chosen).toEqual({a:"document[paragraph#intro['Intro from Bob'],heading#title['Title']]",same:true,depth:depth+1,executions:[["delete_text","set_heading"]],open:false});
 await expect(page.locator('#b h2[data-rich-text="title"]')).toHaveText("Title");
 await expect(menu(page)).toBeHidden();
 const undone=await page.evaluate(async()=>{const t=window.slashTest;t.a.undo();await t.synchronize();const once=t.outline(t.b);t.a.redo();await t.synchronize();return {once,redo:t.outline(t.b),errors:t.errors};});
 expect(undone).toEqual({once:"document[paragraph#intro['Intro from Bob'],paragraph#title['/headTitle']]",redo:"document[paragraph#intro['Intro from Bob'],heading#title['Title']]",errors:[]});
});

test("a remote edit to the typed trigger cancels the session and choosing publishes nothing",async({page})=>{
 await page.evaluate(()=>{const t=window.slashTest;t.da.select(t.caret("title",0));});
 await page.keyboard.type("/he");
 await expect(menu(page).getByRole("option").first()).toBeVisible();
 // The peer first receives the typed trigger, then removes the slash; writer A receives that publication.
 const result=await page.evaluate(async()=>{const t=window.slashTest;await t.synchronize();t.b.dispatch({commands:[{kind:"delete_text",data:{block:"title",offset:0,length:1}}]});await t.synchronize();
  const before=t.a.documentJson(),state=t.slash.state();let refused=false;try{t.slash.choose(0);}catch{refused=true;}
  return {open:state.open,lastCancel:state.lastCancel,cancels:t.cancels,refused,unchanged:t.a.documentJson()===before,title:t.textOf(t.a,"title"),executions:t.executions,errors:t.errors};});
 expect(result).toEqual({open:false,lastCancel:"trigger-invalidated",cancels:["trigger-invalidated"],refused:true,unchanged:true,title:"heTitle",executions:[],errors:[]});
 await expect(menu(page)).toBeHidden();
});

test("a trigger after whitespace wraps the block in a list and the peer converges on both Undo and Redo",async({page})=>{
 await page.evaluate(()=>{const t=window.slashTest;t.da.select(t.caret("title",5));});
 await page.keyboard.type(" /bul");
 await expect(menu(page).getByRole("option")).toHaveText(["Bullet list"]);
 await page.keyboard.press("Enter");
 await expect(page.locator('#a ul [data-rich-text="title"]')).toHaveText("Title ");
 const result=await page.evaluate(async()=>{const t=window.slashTest;await t.synchronize();const after=t.outline(t.b);t.a.undo();await t.synchronize();const undone=t.outline(t.b);t.a.redo();await t.synchronize();return {after,undone,redo:t.outline(t.b)===after,executions:t.executions,errors:t.errors};});
 expect(result.after).toMatch(/^document\[paragraph#intro\['Intro'\],bullet-list#[^[]+\[list-item#[^[]+\[paragraph#title\['Title '\]\]\]\]$/);
 expect(result).toMatchObject({undone:"document[paragraph#intro['Intro'],paragraph#title['Title /bul']]",redo:true,executions:[["delete_text","wrap_list"]],errors:[]});
});
