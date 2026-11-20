import {test,expect} from "@playwright/test";
// Opt-in AI rewrite review over two real shared Rust/Wasm writers with a fake in-page provider (no network).
// Accept is one guarded native plain-text range replacement (one writer-local Undo step); the review is bound to
// its target region, so a peer edit elsewhere keeps it valid while a peer edit inside the target stales it.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const {structuralFixture,paragraph}=await import("/structural-fixture.mjs"),shared=window.sharedTools;
  const t=structuralFixture(shared,{children:[paragraph("x","Hello wrold, this is fine."),paragraph("y","Second paragraph.")]});
  const aside=document.createElement("aside");document.body.append(aside);
  const requests=[],gates=[];
  const provider=request=>{requests.push({...request,signal:undefined});return new Promise((resolve,reject)=>{gates.push({resolve,reject});});};
  const tools=shared.mountSharedAiTools(aside,t.da,{provider,timeoutMs:0});
  const texts=core=>({x:t.textOf(core,"x"),y:t.textOf(core,"y")});
  window.aiTest={...t,tools,requests,gates,texts};
 });
});
const panel=page=>page.locator("[data-breditor-ai]");
const answer=(page,value)=>page.evaluate(value=>window.aiTest.gates.at(-1).resolve(value),value);
async function review(page){
 await page.evaluate(()=>{const t=window.aiTest;t.da.select(t.range("x",6,11),false);void t.tools.requestRewrite({scope:"selection",instruction:"Fix the spelling"});});
 const request=await page.evaluate(()=>window.aiTest.requests[0]);
 expect(request).toMatchObject({kind:"rewrite",scope:"selection",instruction:"Fix the spelling",text:"wrold",segments:[{block:"x",start:6,end:11,text:"wrold"}]});
 expect(JSON.stringify(request)).not.toContain("Second");
 await answer(page,{text:"world"});
 await expect(panel(page).getByRole("button",{name:"Accept"})).toBeVisible();
}

test("Accept is one guarded replacement: one Undo restores it and the peer converges on every step",async({page})=>{
 await review(page);
 const before=await page.evaluate(()=>({texts:window.aiTest.texts(window.aiTest.a),depth:window.aiTest.a.view().undoDepth}));
 expect(before.texts).toEqual({x:"Hello wrold, this is fine.",y:"Second paragraph."});
 await panel(page).getByRole("button",{name:"Accept"}).click();
 await expect(panel(page).locator("[data-ai-status]")).toContainText("Applied as one change");
 const result=await page.evaluate(async()=>{const t=window.aiTest;await t.synchronize();const accepted={a:t.texts(t.a),b:t.texts(t.b),depth:t.a.view().undoDepth};t.a.undo();await t.synchronize();const undone=t.texts(t.b);t.a.redo();await t.synchronize();return {accepted,undone,redone:t.texts(t.b),errors:t.errors};});
 expect(result).toEqual({accepted:{a:{x:"Hello world, this is fine.",y:"Second paragraph."},b:{x:"Hello world, this is fine.",y:"Second paragraph."},depth:before.depth+1},undone:{x:"Hello wrold, this is fine.",y:"Second paragraph."},redone:{x:"Hello world, this is fine.",y:"Second paragraph."},errors:[]});
 await expect(page.locator('#b [data-rich-text="x"]')).toHaveText("Hello world, this is fine.");
});

test("a peer edit in another block keeps the review valid and Undo leaves the peer's edit",async({page})=>{
 await review(page);
 await page.evaluate(async()=>{const t=window.aiTest;t.b.dispatch({commands:[{kind:"insert_text",data:{block:"y",offset:0,text:"Bob: "}}]});await t.synchronize();});
 await expect(page.locator('#a [data-rich-text="y"]')).toHaveText("Bob: Second paragraph.");
 await expect(panel(page).getByRole("button",{name:"Accept"})).toBeVisible();
 await panel(page).getByRole("button",{name:"Accept"}).click();
 await expect(panel(page).locator("[data-ai-status]")).toContainText("Applied as one change");
 const result=await page.evaluate(async()=>{const t=window.aiTest;await t.synchronize();const accepted=t.texts(t.b);t.a.undo();await t.synchronize();return {accepted,undone:t.texts(t.b),same:t.a.documentJson()===t.b.documentJson(),errors:t.errors};});
 expect(result).toEqual({accepted:{x:"Hello world, this is fine.",y:"Bob: Second paragraph."},undone:{x:"Hello wrold, this is fine.",y:"Bob: Second paragraph."},same:true,errors:[]});
});

test("a peer edit inside the target stales the review and Accept publishes nothing",async({page})=>{
 await review(page);
 await page.evaluate(async()=>{const t=window.aiTest;t.b.dispatch({commands:[{kind:"insert_text",data:{block:"x",offset:26,text:" Peer."}}]});await t.synchronize();});
 await expect(panel(page).locator("[data-ai-status]")).toHaveText(/The document changed after this suggestion was generated/);
 await expect(panel(page).getByRole("button",{name:"Accept"})).toBeHidden();
 const refused=await page.evaluate(()=>{const t=window.aiTest,before=t.a.documentJson(),depth=t.a.view().undoDepth;let message="applied";try{t.tools.accept();}catch(error){message=String(error.message);}return {message,unchanged:t.a.documentJson()===before,depth:t.a.view().undoDepth===depth,texts:t.texts(t.a),errors:t.errors};});
 expect(refused).toEqual({message:expect.stringContaining("document changed"),unchanged:true,depth:true,texts:{x:"Hello wrold, this is fine. Peer.",y:"Second paragraph."},errors:[]});
});
