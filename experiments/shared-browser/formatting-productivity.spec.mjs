import {test,expect} from "@playwright/test";
// Shared formatting-productivity controls over two real Rust/Wasm writers in one V4 room: native case change
// (toolbar and Shift+F3) and the format painter. Each edit is one guarded command and one Undo step, and both
// writers converge.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const {productivityFixtureV4}=await import("/v4-fixture-productivity.mjs");
  window.fp=productivityFixtureV4(window.sharedTools);
 });
});
const action=(page,writer,id)=>page.locator(`#${writer} [data-shared-action="${id}"]`);
const strong={type:"breditor/strong",properties:{}};
const run=(text,formats=[])=>({kind:"text",text,formats});

test("case change is one shared Undo step, converges with a concurrent peer edit and cycles with Shift+F3",async({page})=>{
 expect(await page.evaluate(()=>window.fp.a.supportsCaseChange())).toBe(true);
 await page.evaluate(()=>{const t=window.fp;t.da.select(t.range("p",2,"q",3));});
 const depth=await page.evaluate(()=>window.fp.a.view().undoDepth);
 await action(page,"a","case-upper").click();
 // Writer B types inside q before it receives A's change.
 const merged=await page.evaluate(async()=>{const t=window.fp;t.b.dispatch({commands:[{kind:"insert_text",data:{block:"q",offset:4,text:"best "}}]});await t.synchronize();return {p:t.runs(t.b,"p"),q:t.runs(t.b,"q"),depth:t.a.view().undoDepth,errors:t.errors};});
 expect(merged).toEqual({p:[run("BoLD",[strong]),run(" STRASSE AND ")],q:[run("THE best lord of the rings")],depth:depth+1,errors:[]});
 await expect(page.locator('#b [data-rich-text="p"] strong')).toHaveText("BoLD");
 // A's Undo removes only A's change; B's text survives.
 const undone=await page.evaluate(async()=>{const t=window.fp;t.a.undo();await t.synchronize();return t.runs(t.b,"q")[0].text;});
 // Restored characters are fresh insertions: B's text survives, possibly on the other side of "lord".
 expect(undone.replace("best ","")).toBe("the lord of the rings");
 // Shift+F3 in writer B's surface cycles UPPER → lower → Title.
 await page.evaluate(()=>{const t=window.fp;t.db.select(t.range("q",0,"q",26));t.db.focus();});
 const minor=new Set(["of","the"]),words=undone.split(" ");
 const title=words.map((w,i)=>w&&(i===0||i===words.length-1||!minor.has(w))?w[0].toUpperCase()+w.slice(1):w).join(" ");
 const seen=[];
 for(let i=0;i<3;i++){
  const previous=await page.evaluate(()=>window.fp.runs(window.fp.b,"q")[0].text);
  await page.keyboard.press("Shift+F3");
  await expect.poll(()=>page.evaluate(()=>window.fp.runs(window.fp.b,"q")[0].text)).not.toBe(previous);
  seen.push(await page.evaluate(()=>window.fp.runs(window.fp.b,"q")[0].text));
 }
 expect(seen).toEqual([title,undone.toUpperCase(),undone]);
 const final=await page.evaluate(async()=>{const t=window.fp;await t.synchronize();return t.runs(t.a,"q")[0].text;});
 expect(final).toBe(undone);
 expect(await page.evaluate(()=>window.fp.errors)).toEqual([]);
});

test("the shared format painter copies and applies once as one Undo step; Escape cancels",async({page})=>{
 const painter=action(page,"a","format-painter");
 await page.evaluate(()=>{const t=window.fp;t.da.select(t.range("p",2));});
 await painter.click();
 await expect(painter).toHaveAttribute("aria-pressed","true");
 const depth=await page.evaluate(()=>window.fp.a.view().undoDepth);
 await page.evaluate(()=>{const t=window.fp;t.da.select(t.range("q",4,"q",8));t.da.surface.dispatchEvent(new PointerEvent("pointerup",{bubbles:true}));});
 await expect.poll(()=>page.evaluate(()=>window.fp.runs(window.fp.a,"q"))).toEqual([run("the "),run("lord",[strong]),run(" of the rings")]);
 await expect(painter).toHaveAttribute("aria-pressed","false");
 const synced=await page.evaluate(async(depth)=>{const t=window.fp;await t.synchronize();return {q:t.runs(t.b,"q"),depth:t.a.view().undoDepth-depth};},depth);
 expect(synced).toEqual({q:[run("the "),run("lord",[strong]),run(" of the rings")],depth:1});
 await expect(page.locator('#b [data-rich-text="q"] strong')).toHaveText("lord");
 // Arm again and cancel from the surface with Escape: nothing is published.
 await page.evaluate(()=>{const t=window.fp;t.da.select(t.range("p",1));t.da.focus();});
 await painter.click();
 await expect(painter).toHaveAttribute("aria-pressed","true");
 await page.evaluate(()=>window.fp.da.focus());
 await page.keyboard.press("Escape");
 await expect(painter).toHaveAttribute("aria-pressed","false");
 await page.evaluate(()=>window.fp.a.undo());
 expect(await page.evaluate(()=>window.fp.runs(window.fp.a,"q"))).toEqual([run("the lord of the rings")]);
 expect(await page.evaluate(()=>window.fp.errors)).toEqual([]);
});
