import {test,expect} from "@playwright/test";
// Shared V4 block fields over two real Rust/Wasm writers in a V4 room: ordered-list numbering, bookmarks with
// link-preserving rename and internal links, and section open state. Every stock toolbar control publishes one
// native group (one Undo step), both panes render the same V4 DOM, and concurrent edits converge.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{const {v4BlockFieldsFixture}=await import("/v4-fixture-block-fields.mjs");window.v4Fields=v4BlockFieldsFixture(window.sharedTools);});
});
const panel=(page,pane,id)=>page.locator(`#${pane} [data-shared-action="${id}"]`);
async function openPanel(page,pane,id){const button=panel(page,pane,id),details=button.locator("xpath=ancestor::details[1]");if(await details.count()&&!await details.evaluate(d=>d.open))await details.locator("summary").first().click();}

test("V4 nodes render in both shared panes: bookmarks, internal links, list numbering and an open section",async({page})=>{
 for(const pane of ["a","b"]){
  await expect(page.locator(`#${pane} h1#bm-intro[data-rich-bookmark="intro"]`)).toHaveText("Introduction");
  await expect(page.locator(`#${pane} a[data-rich-internal-link="intro"]`).first()).toHaveAttribute("href","#bm-intro");
  await expect(page.locator(`#${pane} ol[start="3"]`)).toHaveCount(1);
  await expect(page.locator(`#${pane} details[data-rich-details="sec"]`)).toHaveAttribute("open","");
 }
 for(const id of ["list-numbering","bookmark","remove-bookmark","link-bookmark","details-open"])await expect(panel(page,"a",id)).toHaveCount(1);
 expect(await page.evaluate(()=>window.v4Fields.errors)).toEqual([]);
});

test("list numbering: toolbar sends one group, concurrent same-field edits converge and each writer undoes only its own",async({page})=>{
 await page.evaluate(()=>{const t=window.v4Fields;t.da.select(t.caret("one-text",1));});
 await openPanel(page,"a","list-numbering");
 await page.locator('#a [data-shared-field="list-numbering-style"]').selectOption("upper-roman");
 await page.locator('#a [data-shared-field="list-numbering-order"]').selectOption("reversed");
 await page.locator('#a [data-shared-field="list-numbering-start"]').fill("7");
 await panel(page,"a","list-numbering").click();
 await expect(page.locator('#a ol[type="I"][reversed][start="7"]')).toHaveCount(1);
 const result=await page.evaluate(async()=>{const t=window.v4Fields;const depth=t.a.view().undoDepth;await t.synchronize();
  // Concurrent: B clears the style while A sets lower-alpha; disjoint B reversal change merges.
  t.a.setListNumbering({list:"list",style:"lower-alpha"});t.b.setListNumbering({list:"list",style:null,reversed:false});await t.synchronize();
  const merged={style:t.prop(t.b,"list","list-style"),reversed:t.prop(t.b,"list","list-reversed"),start:t.prop(t.b,"list","start")};
  t.b.undo();await t.synchronize();const afterB={style:t.prop(t.a,"list","list-style"),reversed:t.prop(t.a,"list","list-reversed")};
  t.a.undo();t.a.undo();await t.synchronize();
  return {depth,merged,afterB,seed:{style:t.prop(t.b,"list","list-style"),reversed:t.prop(t.b,"list","list-reversed"),start:t.prop(t.b,"list","start")},errors:t.errors};});
 expect(result.depth).toBe(1);
 expect([2,null]).toContain(result.merged.style);expect(result.merged).toMatchObject({reversed:null,start:7});
 expect(result.afterB).toEqual({style:2,reversed:true});
 expect(result).toMatchObject({seed:{style:null,reversed:null,start:3},errors:[]});
 await expect(page.locator('#b ol[start="3"]:not([type]):not([reversed])')).toHaveCount(1);
});

test("bookmark rename retargets every link on both peers; a concurrent link to the old name dangles visibly",async({page})=>{
 await page.evaluate(()=>{const t=window.v4Fields;t.da.select(t.caret("intro",2));});
 await openPanel(page,"a","bookmark");
 await expect(page.locator('#a [data-shared-field="bookmark-name"]')).toHaveValue("intro");
 await page.locator('#a [data-shared-field="bookmark-name"]').fill("start");
 await page.evaluate(async()=>{const t=window.v4Fields;t.b.dispatch({commands:[{kind:"set_format",data:{block:"tail",offset:0,length:4,format:{type:"breditor-inline/link",properties:{"breditor-inline/href":"#intro","breditor-inline/new-window":false}},enabled:true}}]});});
 await panel(page,"a","bookmark").click();
 await expect(page.locator("#a h1#bm-start")).toHaveCount(1);
 const result=await page.evaluate(async()=>{const t=window.v4Fields;await t.synchronize();return {see:t.hrefs(t.b,"see"),sum:t.hrefs(t.b,"sum"),tail:t.hrefs(t.b,"tail"),index:t.b.bookmarkIndex(),errors:t.errors};});
 expect(result).toEqual({see:["#start"],sum:["#start"],tail:["#intro"],index:{bookmarks:[{name:"start",block:"intro"}],links:[{block:"see",target:"start"},{block:"sum",target:"start"},{block:"tail",target:"intro"}],brokenLinks:[{block:"tail",target:"intro"}]},errors:[]});
 for(const pane of ["a","b"]){
  await expect(page.locator(`#${pane} [data-rich-text="see"] a[data-rich-internal-link="start"]`)).toHaveAttribute("href","#bm-start");
  await expect(page.locator(`#${pane} [data-rich-text="tail"] a[data-rich-link-broken]`)).toHaveText("Tail");
 }
 // A duplicate is refused before any command; one Undo restores the anchor and both links.
 await page.evaluate(()=>{const t=window.v4Fields;t.da.select(t.caret("tail",6));});
 await openPanel(page,"a","bookmark");
 await page.locator('#a [data-shared-field="bookmark-name"]').fill("start");
 await panel(page,"a","bookmark").click();
 const undone=await page.evaluate(async()=>{const t=window.v4Fields;const refused=t.errors.length;t.errors.length=0;let duplicate="";try{t.a.setBookmark({block:"tail",name:"start"});}catch(error){duplicate=String(error);}
  const before=t.a.view().undoDepth;t.a.undo();t.a.undo();await t.synchronize();return {refused,duplicate,before,see:t.hrefs(t.b,"see"),name:t.prop(t.b,"intro","bookmark")};});
 expect(undone.refused).toBe(1);expect(undone.duplicate).toContain("already used");
 expect(undone).toMatchObject({see:["#intro"],name:"intro"});
 // Link to bookmark applies the internal target to the selected text through the stock control.
 await page.evaluate(()=>{const t=window.v4Fields;t.da.select(t.range("tail",5,9));});
 await openPanel(page,"a","link-bookmark");
 await page.locator('#a [data-shared-field="link-bookmark-target"]').selectOption("intro");
 await panel(page,"a","link-bookmark").click();
 await expect(page.locator('#a [data-rich-text="tail"] a[data-rich-internal-link="intro"]').last()).toHaveText("text");
 expect(await page.evaluate(async()=>{const t=window.v4Fields;await t.synchronize();return {tail:t.hrefs(t.b,"tail"),errors:t.errors};})).toEqual({tail:["#intro","#intro"],errors:[]});
});

test("collapsing a section moves a hidden caret to the summary; summary clicks never toggle natively",async({page})=>{
 await page.evaluate(()=>{const t=window.v4Fields;t.da.select(t.caret("body",4));});
 await panel(page,"a","details-open").click();
 await expect(page.locator('#a details[data-rich-details="sec"]')).not.toHaveAttribute("open","");
 const state=await page.evaluate(async()=>{const t=window.v4Fields;await t.synchronize();return {selection:t.a.view().selection,open:t.prop(t.b,"sec","details-open"),depth:t.a.view().undoDepth};});
 expect(state).toEqual({selection:{kind:"text",anchor:{block:"sum",offset:"8",affinity:"after"},focus:{block:"sum",offset:"8",affinity:"after"}},open:null,depth:1});
 await expect(page.locator('#b details[data-rich-details="sec"]')).not.toHaveAttribute("open","");
 // Clicking the summary while editing only places the caret.
 await page.locator('#b summary[data-rich-text="sum"]').click();
 await expect(page.locator('#b details[data-rich-details="sec"]')).not.toHaveAttribute("open","");
 // Concurrent: B expands while A types in the summary; both converge, and Undo is per writer.
 const result=await page.evaluate(async()=>{const t=window.v4Fields;t.b.setDetailsOpen("sec",true);t.a.dispatch({commands:[{kind:"insert_text",data:{block:"sum",offset:0,text:"See "}}]});await t.synchronize();
  const merged={open:t.prop(t.a,"sec","details-open"),summary:t.node(t.a,"sum").children.map(r=>r.text).join("")};t.b.undo();await t.synchronize();return {merged,undone:t.prop(t.a,"sec","details-open"),errors:t.errors};});
 expect(result).toEqual({merged:{open:true,summary:"See More top"},undone:null,errors:[]});
 await expect(page.locator('#a details[data-rich-details="sec"]')).not.toHaveAttribute("open","");
});
