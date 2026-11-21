import {test,expect} from "@playwright/test";
// Agent tool contract over the actual Rust/Wasm owner (layout V3 profile) with a fake in-page model loop.
// No network and no model: the "model" is a scripted list of tool calls. Staged edits are applied by the native
// `commandGroup` as ONE publication and ONE Undo step.
async function mount(page,{mode="review"}={}){
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async({mode})=>{
  const api=await import("/rich.js");
  const profile=api.compileStandardLayoutRichProfileV3(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:8,schema:{name:"example/agent-tools",version:3},extensions:[]}));
  const binding=profile.descriptor(),presentation=api.createStandardRichInlinePresentationV1(profile.inlineCatalogJson());
  const paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:[{kind:"text",text,formats:[]}]});
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"room"},children:[paragraph("a","Hello world, this is fine."),paragraph("b","Second paragraph."),paragraph("c","Third paragraph.")]};
  const core=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root}));
  core.enableTypingHistory();
  const host=document.createElement("main"),aside=document.createElement("aside"),errors=[];document.body.append(host,aside);
  const editor=api.mountRichEditor(host,{core,inlinePresentation:presentation,onError:error=>errors.push(String(error))});
  const tools=api.createRichAgentTools(api.richAgentToolsHost(editor),{mode});
  const panel=api.mountRichAgentReview(aside,tools);
  // A scripted fake model: each turn returns tool calls computed from the previous results.
  const chat=async script=>{const results=[];for(const step of script){const calls=step(results.at(-1));if(!calls)break;const turn=[];for(const [name,args] of calls)turn.push(await tools.call(name,JSON.stringify(args)));results.push(turn);}return results;};
  const select=(block,start,end=start)=>editor.execute({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}},true);
  const blocks=()=>JSON.parse(core.documentJson()).root.children.map(n=>({id:n.properties["breditor/block-id"],type:n.type.slice(9),text:n.children.map(c=>c.text??"").join(""),bold:n.children.filter(c=>c.formats?.some(f=>f.type==="breditor/strong")).map(c=>c.text)}));
  window.agent={api,core,editor,tools,panel,chat,select,blocks,errors,undoDepth:()=>core.view().undoDepth,supportsGroup:()=>editor.supportsCommandGroup()};
 },{mode});
}
const panel=page=>page.locator("[data-breditor-agent-review]");

test("review mode: an agent's edits are staged, shown as a diff and accepted as ONE native Undo step",async({page})=>{
 await mount(page);
 expect(await page.evaluate(()=>window.agent.supportsGroup())).toBe(true);
 // Ordinary typing first, so Undo must remove only the accepted agent change.
 await page.evaluate(()=>window.agent.select("c",16));await page.keyboard.type(" Typed");
 const before=await page.evaluate(()=>({blocks:window.agent.blocks(),undo:window.agent.undoDepth()}));
 const results=await page.evaluate(()=>window.agent.chat([
  ()=>[["find_text",{query:"world"}]],
  ([found])=>{const {revision,matches:[m]}=found.result;return [
   ["replace_range",{revision,block:m.block,start:m.start,end:m.end,text:"everyone",expectedText:"world"}],
   ["set_format",{revision,block:"a",start:0,end:5,format:"bold",enabled:true}],
   ["set_block_type",{revision,block:"b",type:"heading",level:2}],
   ["insert_blocks",{revision,after:"b",blocks:[{type:"paragraph",text:"Inserted by the agent."}]}],
   ["delete_blocks",{revision,blocks:["c"]}],
   // Untrusted input: an unknown block and a line break are refused without changing anything.
   ["replace_range",{revision,block:"nope",start:0,end:0,text:"x"}],
   ["replace_range",{revision,block:"a",start:0,end:0,text:"a\nb"}]];},
 ]));
 expect(results[1].map(r=>r.ok?r.result.status:r.error.code)).toEqual(["staged","staged","staged","staged","staged","unknown_block","invalid_text"]);
 expect(await page.evaluate(()=>window.agent.blocks())).toEqual(before.blocks);
 const review=panel(page);
 await expect(review.locator("li")).toHaveCount(5);
 await expect(review.locator("li").first().locator("del")).toHaveText("world");await expect(review.locator("li").first().locator("ins")).toHaveText("everyone");
 await expect(review.locator("[data-agent-status]")).toContainText("5 staged edits");
 await review.getByRole("button",{name:"Accept all"}).click();
 await expect(review.locator("[data-agent-status]")).toContainText("Applied as one change");
 const after=await page.evaluate(()=>window.agent.blocks());
 expect(after.map(b=>[b.type,b.text])).toEqual([["paragraph","Hello everyone, this is fine."],["heading","Second paragraph."],["paragraph","Inserted by the agent."]]);
 expect(after[0].bold).toEqual(["Hello"]);
 expect(await page.evaluate(()=>window.agent.undoDepth())).toBe(before.undo+1);
 await page.evaluate(()=>window.agent.editor.focus());await page.keyboard.press("ControlOrMeta+z");
 expect(await page.evaluate(()=>window.agent.blocks())).toEqual(before.blocks);
 await page.keyboard.press("ControlOrMeta+Shift+z");
 expect((await page.evaluate(()=>window.agent.blocks())).map(b=>b.text)).toEqual(after.map(b=>b.text));
 expect(await page.evaluate(()=>window.agent.errors)).toEqual([]);
});

test("stale protection: user typing in a target stales the review; typing elsewhere re-bases",async({page})=>{
 await mount(page);const review=panel(page);
 await page.evaluate(async()=>{const {result:{revision}}=await window.agent.tools.call("get_document",{});window.revision=revision;
  await window.agent.tools.call("replace_range",{revision,block:"a",start:0,end:5,text:"Howdy"});});
 // Typing in another block: the staged edit's target is unchanged, so it stays valid.
 await page.evaluate(()=>window.agent.select("c",16));await page.keyboard.type("!");
 await expect(review.getByRole("button",{name:"Accept all"})).toBeEnabled();
 // A new edit against the old revision is re-based because its target block `b` is unchanged.
 expect(await page.evaluate(async()=>(await window.agent.tools.call("replace_range",{revision:window.revision,block:"b",start:0,end:6,text:"2nd"})).ok)).toBe(true);
 // ...but not when its target changed after that read.
 expect(await page.evaluate(async()=>(await window.agent.tools.call("replace_range",{revision:window.revision,block:"c",start:0,end:5,text:"x"})).error.code)).toBe("stale_target");
 await review.getByRole("button",{name:"Accept all"}).click();
 expect((await page.evaluate(()=>window.agent.blocks())).map(b=>b.text)).toEqual(["Howdy world, this is fine.","2nd paragraph.","Third paragraph.!"]);
 // Typing inside the target while a review is open withdraws Accept; nothing is applied.
 await page.evaluate(async()=>{const {result:{revision}}=await window.agent.tools.call("get_selection");await window.agent.tools.call("replace_range",{revision,block:"a",start:0,end:5,text:"Hi"});});
 await page.evaluate(()=>window.agent.select("a",3));await page.keyboard.type("X");
 await expect(review.getByRole("button",{name:"Accept all"})).toBeDisabled();
 await expect(review.locator("[data-agent-status]")).toContainText("changed where these edits apply");
 expect(await page.evaluate(()=>{try{window.agent.tools.accept();return "applied";}catch(error){return error.code;}})).toBe("stale_target");
 expect((await page.evaluate(()=>window.agent.blocks()))[0].text).toBe("HowXdy world, this is fine.");
 await review.getByRole("button",{name:"Reject all"}).click();
 await expect(review.locator("li")).toHaveCount(0);
});

test("direct mode (opt-in): each call is one native publication; refusals publish nothing",async({page})=>{
 await mount(page,{mode:"direct"});
 const out=await page.evaluate(async()=>{
  const t=window.agent.tools,undo0=window.agent.undoDepth();
  const {result:{revision}}=await t.call("get_document",{});
  const a=await t.call("insert_blocks",{revision,after:null,blocks:[{type:"heading",level:1,text:"Title"},{type:"paragraph",text:"Intro"}]});
  const b=await t.call("set_format",{revision,block:"b",start:0,end:6,format:"bold",enabled:true});
  // Deleting every block would leave an empty document: the native owner refuses, nothing is published.
  const ids=window.agent.blocks().map(x=>x.id),checkpoint=window.agent.core.checkpointJson();
  const c=await t.call("delete_blocks",{revision:a.result.revision===undefined?revision:window.agent.core.view().revision,blocks:ids});
  return {a,b,c,unchanged:window.agent.core.checkpointJson()===checkpoint,undo:window.agent.undoDepth()-undo0,blocks:window.agent.blocks()};
 });
 expect(out.a).toMatchObject({ok:true,result:{status:"applied"}});expect(out.b).toMatchObject({ok:true,result:{status:"applied"}});
 expect(out.c.ok).toBe(false);expect(out.unchanged).toBe(true);
 expect(out.undo).toBe(2);
 expect(out.blocks.map(b=>[b.type,b.text])).toEqual([["heading","Title"],["paragraph","Intro"],["paragraph","Hello world, this is fine."],["paragraph","Second paragraph."],["paragraph","Third paragraph."]]);
 expect(out.blocks[3].bold).toEqual(["Second"]);
 // propose_changes stays reviewable even in direct mode.
 const staged=await page.evaluate(async()=>(await window.agent.tools.call("propose_changes",{revision:window.agent.core.view().revision,title:"Tidy",edits:[{tool:"delete_blocks",blocks:["c"]}]})).result.status);
 expect(staged).toBe("staged");await expect(panel(page).locator("li")).toHaveCount(1);
});
