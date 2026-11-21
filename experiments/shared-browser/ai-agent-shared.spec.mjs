import {test,expect} from "@playwright/test";
// Agent tool contract over two real shared Rust/Wasm writers (standard structural V2 room) with a scripted fake
// model (no network). Writer A's staged agent change is reviewable; Accept is ONE guarded shared dispatch (one
// writer-local Undo step) that converges on writer B. Peer edits elsewhere keep the review valid; a peer edit in a
// target stales it and Accept publishes nothing.
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.evaluate(async()=>{
  const {structuralFixture,paragraph}=await import("/structural-fixture.mjs"),shared=window.sharedTools;
  const t=structuralFixture(shared,{children:[paragraph("x","Hello world, this is fine."),paragraph("y","Second paragraph."),paragraph("z","Third paragraph.")]});
  const tools=shared.createSharedAgentTools(t.da);
  const blocks=core=>JSON.parse(core.documentJson()).root.children.map(n=>({id:n.properties["breditor/block-id"],type:n.type.slice(9),text:n.children.filter(c=>c.kind==="text").map(c=>c.text).join(""),bold:n.children.filter(c=>c.formats?.some(f=>f.type==="breditor/strong")).map(c=>c.text)}));
  window.agentTest={...t,tools,blocks};
 });
});

test("an agent change on writer A is reviewable, applies as one Undo step and converges on writer B",async({page})=>{
 const result=await page.evaluate(async()=>{
  const t=window.agentTest,calls=[];
  const call=async(name,args)=>{const r=await t.tools.call(name,JSON.stringify(args));calls.push(r.ok?r.result.status??"read":r.error.code);return r;};
  const {result:{revision,matches:[m]}}=await call("find_text",{query:"world"});
  await call("replace_range",{revision,block:m.block,start:m.start,end:m.end,text:"everyone"});
  await call("set_format",{revision,block:"x",start:0,end:5,format:"bold",enabled:true});
  await call("insert_blocks",{revision,after:"x",blocks:[{type:"paragraph",text:"Inserted by the agent."}]});
  await call("delete_blocks",{revision,blocks:["y"]});
  // Nothing is published while the change is staged, on either writer.
  const staged={a:t.blocks(t.a),depth:t.a.view().undoDepth,review:t.tools.review().items.length};
  // Writer B edits another block meanwhile: the staged review stays valid.
  t.b.dispatch({commands:[{kind:"insert_text",data:{block:"z",offset:0,text:"Bob: "}}]});await t.synchronize();
  const stale=t.tools.review().stale,outcome=t.tools.accept();await t.synchronize();
  const accepted={a:t.blocks(t.a),b:t.blocks(t.b),depth:t.a.view().undoDepth,same:t.a.documentJson()===t.b.documentJson()};
  t.a.undo();await t.synchronize();const undone={b:t.blocks(t.b),same:t.a.documentJson()===t.b.documentJson()};
  t.a.redo();await t.synchronize();
  return {calls,staged,stale,outcome,accepted,undone,redone:t.blocks(t.b),errors:t.errors};
 });
 expect(result.calls).toEqual(["read","staged","staged","staged","staged"]);
 expect(result.staged.a.map(b=>b.text)).toEqual(["Hello world, this is fine.","Second paragraph.","Third paragraph."]);expect(result.staged.review).toBe(4);
 expect(result.stale).toBe(false);expect(result.outcome).toBe("content");
 const after=[["paragraph","Hello everyone, this is fine."],["paragraph","Inserted by the agent."],["paragraph","Bob: Third paragraph."]];
 expect(result.accepted.a.map(b=>[b.type,b.text])).toEqual(after);expect(result.accepted.b.map(b=>[b.type,b.text])).toEqual(after);
 expect(result.accepted.b[0].bold).toEqual(["Hello"]);expect(result.accepted.same).toBe(true);
 expect(result.accepted.depth).toBe(result.staged.depth+1);
 // One Undo on writer A removes the whole agent change and keeps writer B's concurrent edit.
 expect(result.undone.b.map(b=>b.text)).toEqual(["Hello world, this is fine.","Second paragraph.","Bob: Third paragraph."]);expect(result.undone.same).toBe(true);
 expect(result.redone.map(b=>b.text)).toEqual(after.map(([,text])=>text));
 expect(result.errors).toEqual([]);
 await expect(page.locator('#b [data-rich-text="x"]')).toHaveText("Hello everyone, this is fine.");
});

test("a peer edit inside a staged target stales the review and Accept publishes nothing",async({page})=>{
 const result=await page.evaluate(async()=>{
  const t=window.agentTest;
  const {result:{revision}}=await t.tools.call("get_document",{});
  await t.tools.call("replace_range",{revision,block:"y",start:0,end:6,text:"2nd"});
  t.b.dispatch({commands:[{kind:"insert_text",data:{block:"y",offset:17,text:" Peer."}}]});await t.synchronize();
  const before=t.a.documentJson(),depth=t.a.view().undoDepth;let code="applied";
  try{t.tools.accept();}catch(error){code=error.code;}
  // A re-read sees the peer's text; an edit based on the old read of `y` is refused as stale.
  const old=await t.tools.call("replace_range",{revision,block:"y",start:0,end:6,text:"x"});
  return {stale:t.tools.review().stale,code,unchanged:t.a.documentJson()===before,depth:t.a.view().undoDepth===depth,old:old.ok?"ok":old.error.code,y:t.textOf(t.b,"y"),errors:t.errors};
 });
 expect(result).toEqual({stale:true,code:"stale_target",unchanged:true,depth:true,old:"stale_target",y:"Second paragraph. Peer.",errors:[]});
});

test("direct mode (opt-in): each agent call is one shared dispatch that converges",async({page})=>{
 const result=await page.evaluate(async()=>{
  const t=window.agentTest,tools=window.sharedTools.createSharedAgentTools(t.da,{mode:"direct"});
  const depth=t.a.view().undoDepth,{result:{revision}}=await tools.call("get_document",{});
  const applied=await tools.call("replace_range",{revision,block:"z",start:0,end:5,text:"Last"});
  // Re-based from the same older read: `x` is unchanged since then.
  const rebased=await tools.call("replace_range",{revision,block:"x",start:0,end:5,text:"Howdy"});
  const stale=await tools.call("replace_range",{revision,block:"z",start:0,end:4,text:"x"});
  await t.synchronize();
  return {applied:applied.result.status,rebased:rebased.result.status,stale:stale.error.code,depth:t.a.view().undoDepth-depth,b:t.blocks(t.b).map(b=>b.text),same:t.a.documentJson()===t.b.documentJson(),errors:t.errors};
 });
 expect(result).toEqual({applied:"applied",rebased:"applied",stale:"stale_target",depth:2,b:["Howdy world, this is fine.","Second paragraph.","Last paragraph."],same:true,errors:[]});
});
