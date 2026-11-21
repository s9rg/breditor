import {test,expect} from "@playwright/test";
// Shared rich language V4 structure commands over two real Rust/Wasm writers in one V4 room: collapsible
// sections (wrap/unwrap), page breaks (toolbar, slash item, node deletion) and table captions (add, type,
// Backspace removal). Every command is one guarded batch and one Undo step; both shared DOMs render it.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const {structureFixtureV4,paragraph,section,table}=await import("/v4-fixture-structure.mjs"),shared=window.sharedTools;
  const t=structureFixtureV4(shared,{children:[paragraph("intro","Intro"),paragraph("one","One"),section("sec","More",[paragraph("inside","Inside")]),table("tbl"),paragraph("tail","Tail")]});
  const slash=shared.mountSharedSlashCommands(t.da,{items:shared.createSharedSlashCommands(t.toolbarA,undefined,t.da.uiLocale())});
  window.v4={...t,slash};
 });
});
const action=(page,writer,id)=>page.locator(`#${writer} [data-shared-action="${id}"]`);

test("a section wrap racing a peer edit inside converges, renders in both panes and unwraps in one step",async({page})=>{
 expect(await page.evaluate(()=>window.v4.a.supportsSharedStructureV4())).toBe(true);
 await expect(page.locator('#a details[data-rich-details] > summary[data-rich-text="sec-sum"]')).toHaveText("More");
 await page.evaluate(()=>{const t=window.v4;t.da.select(t.caret("one",1));});
 await action(page,"a","details").click();
 // Writer B types in the wrapped paragraph before it receives the wrap.
 const merged=await page.evaluate(async()=>{const t=window.v4;t.b.dispatch({commands:[{kind:"insert_text",data:{block:"one",offset:3,text:" by Bob"}}]});await t.synchronize();return {a:t.outline(t.a),same:t.a.documentJson()===t.b.documentJson(),errors:t.errors};});
 expect(merged.same).toBe(true);expect(merged.errors).toEqual([]);
 expect(merged.a).toMatch(/^document\[paragraph#intro\['Intro'\],details#([^[]+)\[details-summary#[^,\]]+,paragraph#one\['One by Bob'\]\],details#sec/);
 for(const writer of ["a","b"])await expect(page.locator(`#${writer} details[data-rich-details][open] > p[data-rich-text="one"]`)).toHaveText("One by Bob");
 // Typing in the new (empty) summary.
 const summary=await page.evaluate(()=>{const t=window.v4,root=JSON.parse(t.a.documentJson()).root;const s=root.children[1].children[0].properties["breditor/block-id"];t.da.select(t.caret(s,0));return s;});
 await page.keyboard.type("Notes");
 await expect(page.locator(`#a summary[data-rich-text="${summary}"]`)).toHaveText("Notes");
 // Remove collapsible section with the caret in its summary: the summary becomes a paragraph (same id).
 const depth=await page.evaluate(()=>window.v4.a.view().undoDepth);
 await action(page,"a","undetails").click();
 const lifted=await page.evaluate(async({summary,depth})=>{const t=window.v4;await t.synchronize();return {b:t.outline(t.b),depth:t.a.view().undoDepth-depth,selection:t.a.view().selection?.focus?.block===summary};},{summary,depth});
 expect(lifted).toEqual({b:`document[paragraph#intro['Intro'],paragraph#${summary}['Notes'],paragraph#one['One by Bob'],details#sec[details-summary#sec-sum['More'],paragraph#inside['Inside']],table#tbl[table-row#tbl-r1[table-cell#tbl-r1-c1[paragraph#tbl-r1-c1-p['r1c1']],table-cell#tbl-r1-c2[paragraph#tbl-r1-c2-p['r1c2']]],table-row#tbl-r2[table-cell#tbl-r2-c1[paragraph#tbl-r2-c1-p['r2c1']],table-cell#tbl-r2-c2[paragraph#tbl-r2-c2-p['r2c2']]]],paragraph#tail['Tail']]`,depth:1,selection:true});
 await expect(page.locator(`#b p[data-rich-text="${summary}"]`)).toHaveText("Notes");
 // Backspace at a summary start unwraps the seeded section too; Undo restores it on both writers.
 await page.evaluate(()=>{const t=window.v4;t.da.select(t.caret("sec-sum",0));});
 await page.keyboard.press("Backspace");
 await expect(page.locator('#a p[data-rich-text="sec-sum"]')).toHaveText("More");
 const undone=await page.evaluate(async()=>{const t=window.v4;t.a.undo();await t.synchronize();return t.outline(t.b).includes("details#sec[details-summary#sec-sum['More'],paragraph#inside['Inside']]");});
 expect(undone).toBe(true);
 await expect(page.locator('#b details[data-rich-details] > summary[data-rich-text="sec-sum"]')).toHaveText("More");
 expect(await page.evaluate(()=>window.v4.errors)).toEqual([]);
});

test("page breaks insert at the root from the toolbar and the slash menu in one step and delete as atoms",async({page})=>{
 // Toolbar: a caret inside the section inserts the break after the whole root section.
 await page.evaluate(()=>{const t=window.v4;t.da.select(t.caret("inside",2));});
 await action(page,"a","page-break").click();
 const first=await page.evaluate(async()=>{const t=window.v4;await t.synchronize();const root=JSON.parse(t.b.documentJson()).root;return root.children.map(node=>node.type.replace("breditor/",""));});
 expect(first).toEqual(["paragraph","paragraph","details","page-break","table","paragraph"]);
 for(const writer of ["a","b"])await expect(page.locator(`#${writer} [data-rich-page-break][role=separator]`)).toHaveCount(1);
 // Slash item "Page break": trigger removal and insertion are one Undo step.
 await page.evaluate(()=>{const t=window.v4;t.da.select(t.caret("intro",5));});
 await page.keyboard.type(" /page");
 await expect(page.locator("[data-breditor-slash]").getByRole("option")).toHaveText(["Page break"]);
 const depth=await page.evaluate(()=>window.v4.a.view().undoDepth);
 await page.keyboard.press("Enter");
 const slashed=await page.evaluate(async(depth)=>{const t=window.v4;await t.synchronize();const root=JSON.parse(t.b.documentJson()).root;return {kinds:root.children.map(node=>node.type.replace("breditor/","")),intro:root.children[0].children[0].text,depth:t.a.view().undoDepth-depth};},depth);
 expect(slashed).toEqual({kinds:["paragraph","page-break","paragraph","details","page-break","table","paragraph"],intro:"Intro ",depth:1});
 await expect(page.locator("#b [data-rich-page-break]")).toHaveCount(2);
 const reverted=await page.evaluate(async()=>{const t=window.v4;t.a.undo();await t.synchronize();const once=JSON.parse(t.b.documentJson()).root;t.a.redo();await t.synchronize();return {intro:once.children[0].children[0].text,breaks:once.children.filter(node=>node.type==="breditor/page-break").length};});
 expect(reverted).toEqual({intro:"Intro /page",breaks:1});
 // Clicking a break selects it as a node; Backspace deletes it (one step) on both writers.
 await page.locator("#a [data-rich-page-break]").first().click();
 expect(await page.evaluate(()=>window.v4.a.view().selection?.kind)).toBe("node");
 await page.keyboard.press("Backspace");
 await expect(page.locator("#a [data-rich-page-break]")).toHaveCount(1);
 await page.evaluate(()=>window.v4.synchronize());
 await expect(page.locator("#b [data-rich-page-break]")).toHaveCount(1);
 expect(await page.evaluate(()=>window.v4.errors)).toEqual([]);
});

test("table captions add with a caret, type, converge with a concurrent add and Backspace removes an empty one",async({page})=>{
 await page.evaluate(()=>{const t=window.v4;t.da.select(t.caret("tbl-r1-c1-p",1));});
 await expect(action(page,"a","table-caption")).toHaveAttribute("aria-pressed","false");
 await action(page,"a","table-caption").click();
 await expect(action(page,"a","table-caption")).toHaveAttribute("aria-pressed","true");
 await page.keyboard.type("Totals");
 const caption=await page.evaluate(()=>{const t=window.v4,s=t.a.view().selection;return s.focus.block;});
 await expect(page.locator(`#a caption[data-rich-table-caption] > p[data-rich-text="${caption}"]`)).toHaveText("Totals");
 // Writer B concurrently adds its own caption: after the merge exactly one caption is shown everywhere.
 const merged=await page.evaluate(async()=>{const t=window.v4;t.b.addTableCaption("tbl","cap-b");t.b.dispatch({commands:[{kind:"insert_text",data:{block:"cap-b",offset:0,text:"Bob"}}]});await t.synchronize();
  const table=JSON.parse(t.a.documentJson()).root.children.find(node=>node.type==="breditor/table");return {kinds:table.children.map(node=>node.type.replace("breditor/","")),same:t.a.documentJson()===t.b.documentJson()};});
 expect(merged).toEqual({kinds:["table-row","table-row","paragraph"],same:true});
 for(const writer of ["a","b"])await expect(page.locator(`#${writer} caption[data-rich-table-caption]`)).toHaveCount(1);
 // Removing the caption removes it (and the hidden concurrent candidate); Undo restores the shown one.
 const removed=await page.evaluate(async()=>{const t=window.v4;const shown=JSON.parse(t.a.documentJson()).root.children.find(node=>node.type==="breditor/table").children[2].properties["breditor/block-id"];
  t.da.select(t.caret("tbl-r2-c2-p",0));t.a.removeTableCaption("tbl");await t.synchronize();const none=JSON.parse(t.b.documentJson()).root.children.find(node=>node.type==="breditor/table").children.length===2;t.a.undo();await t.synchronize();
  const back=JSON.parse(t.b.documentJson()).root.children.find(node=>node.type==="breditor/table").children[2]?.properties["breditor/block-id"];return {none,restored:back===shown};});
 expect(removed).toEqual({none:true,restored:true});
 // Backspace in an emptied caption removes it as locally (one step) and selects the table.
 await page.evaluate(async()=>{const t=window.v4;t.b.removeTableCaption("tbl");await t.synchronize();const s=t.caret("tbl-r1-c1-p",0);t.da.select(s);});
 await action(page,"a","table-caption").click();
 const fresh=await page.evaluate(()=>window.v4.a.view().selection.focus.block);
 await expect(page.locator(`#a caption[data-rich-table-caption] > p[data-rich-text="${fresh}"]`)).toHaveCount(1);
 await page.keyboard.press("Backspace");
 await expect(page.locator("#a caption[data-rich-table-caption]")).toHaveCount(0);
 expect(await page.evaluate(async()=>{const t=window.v4;await t.synchronize();return {selection:t.a.view().selection,b:JSON.parse(t.b.documentJson()).root.children.find(node=>node.type==="breditor/table").children.length,errors:t.errors};})).toEqual({selection:{kind:"node",block:"tbl"},b:2,errors:[]});
});

test("Enter at a collapsed summary expands the section and enters its body in one guarded step, like enterDetailsBody",async({page})=>{
 // Collapse the seeded section through the shared open-state command, then press Enter mid-summary.
 const seeded=await page.evaluate(async()=>{const t=window.v4;t.a.setDetailsOpen("sec",false);await t.synchronize();t.da.select(t.caret("sec-sum",2));return {depth:t.a.view().undoDepth,b:t.outline(t.b)};});
 expect(seeded.b).toContain("details#sec[details-summary#sec-sum['More'],paragraph#inside['Inside']]");
 await expect(page.locator('#b details[data-rich-details]:not([open]) > summary[data-rich-text="sec-sum"]')).toHaveText("More");
 await page.keyboard.press("Enter");
 const entered=await page.evaluate(async depth=>{const t=window.v4;await t.synchronize();const sec=JSON.parse(t.b.documentJson()).root.children[2],fresh=sec.children[1].properties["breditor/block-id"];
  return {open:sec.properties["breditor/details-open"]??null,summary:sec.children[0].children.map(r=>r.text).join(""),body:sec.children.slice(1).map(n=>n.children.map(r=>r.text).join("")),
   caret:t.a.view().selection?.focus?.block===fresh,fresh,steps:t.a.view().undoDepth-depth,same:t.a.documentJson()===t.b.documentJson(),errors:t.errors};},seeded.depth);
 expect(entered).toMatchObject({open:true,summary:"More",body:["","Inside"],caret:true,steps:1,same:true,errors:[]});
 // The caret is in the fresh first body paragraph: typing lands there and renders in both panes.
 await page.keyboard.type("Body");
 await expect(page.locator(`#a details[data-rich-details][open] > p[data-rich-text="${entered.fresh}"]`)).toHaveText("Body");
 await page.evaluate(()=>window.v4.synchronize());
 await expect(page.locator(`#b details[data-rich-details][open] > p[data-rich-text="${entered.fresh}"]`)).toHaveText("Body");
 // Undo back to the seeded depth: the section is collapsed again on both writers with its original body.
 const undone=await page.evaluate(async depth=>{const t=window.v4;while(t.a.view().undoDepth>depth)t.a.undo();await t.synchronize();return {b:t.outline(t.b),open:JSON.parse(t.b.documentJson()).root.children[2].properties["breditor/details-open"]??null,errors:t.errors};},seeded.depth);
 expect(undone).toEqual({b:seeded.b,open:null,errors:[]});
 await expect(page.locator('#a details[data-rich-details]:not([open]) > summary[data-rich-text="sec-sum"]')).toHaveText("More");
});
