import {test, expect} from "@playwright/test";
import {createRelay} from "./relay-fixture.mjs";

let relay;
test.beforeEach(async({page})=>{
  await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
  const v=await page.evaluate(()=>({configuration:window.sharedTools.vector.shared_writer.configuration,input:window.sharedTools.vector.shared_writer.input,origin:location.origin}));
  relay=await createRelay(v);
  await page.addScriptTag({type:"module",url:"/socket-fixture.mjs"});
  await page.waitForFunction(()=>window.relaySocketFixture);
});
test.afterEach(async()=>{await relay?.dispose();relay=undefined;});

async function provision(page, relay) {
  return page.evaluate(async({url,tokens})=>{
    const t=window.sharedTools,connect=window.relaySocketFixture.connect;
    const owner=await connect(url,"owner",tokens.owner);
    if(owner.authenticated.kind!=="authenticated")throw Error("Owner authentication failed");
    for(const [principal,role] of[["alice","editor"],["bob","editor"],["reader","reader"]]){
      if((await owner.request({kind:"grant",principal,role})).kind!=="granted")throw Error("Role grant failed");
    }
    const a=await connect(url,"alice",tokens.alice),b=await connect(url,"bob",tokens.bob);
    const ar=(await a.request({kind:"register"})).registration,br=(await b.request({kind:"register"})).registration;
    const p=t.wasm.SharedRichProfile.from_configuration_json(t.vector.shared_writer.configuration);
    const aa=new t.SharedRichEditor(p.join_frame("room",ar.lease.writer,a.authenticated.frame));
    const bb=new t.SharedRichEditor(p.join_frame("room",br.lease.writer,b.authenticated.frame));p.free();
    t.network={owner,a,b,ar,br,aa,bb};return {a:ar.lease.writer,b:br.lease.writer};
  },{url:relay.url,tokens:relay.tokens});
}

test("real Rust WebSocket relay durably merges offline table image edits and restores selective history after server and page restart",async({page})=>{
  const ids=await provision(page,relay);expect(ids).toEqual({a:"2",b:"3"});
  const first=await page.evaluate(async()=>{
    const t=window.sharedTools,n=t.network;
    n.aa.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Network 🙂 "}},{kind:"resize_column",data:{block:"table-block",column:"c",width:360}},{kind:"set_header",data:{cells:["cell"],header:true}}]});
    n.bb.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Remote caption "}},{kind:"set_image_alt",data:{block:"image-block",text:"Network image",decorative:false}},{kind:"resize_image",data:{block:"image-block",size:[320,180]}}]});
    const ga=n.aa.writerGroups("0").groups[0],gb=n.bb.writerGroups("0").groups[0];
    const a=await n.a.request({kind:"submit",group:ga}),b=await n.b.request({kind:"submit",group:gb});
    if(a.kind!=="durable"||b.kind!=="durable")throw Error("Expected server-durable rich groups");
    const frame=(await n.a.request({kind:"sync"})).frame;await n.aa.receiveFrame(frame);await n.bb.receiveFrame(frame);
    localStorage.setItem("relay-separate-credentials",JSON.stringify({ar:n.ar,br:n.br}));
    localStorage.setItem("relay-editor-journals",JSON.stringify({a:n.aa.checkpointJson(),b:n.bb.checkpointJson()}));
    localStorage.setItem("relay-accepted-groups",JSON.stringify({ga,gb,a,b}));
    return{same:n.aa.documentJson()===n.bb.documentJson(),document:n.aa.documentJson(),history:[n.aa.view().undoDepth,n.bb.view().undoDepth],ackA:a,ackB:b,broadcasts:[n.a.events.filter(e=>e.kind==="catchup").length,n.b.events.filter(e=>e.kind==="catchup").length]};
  });
  expect(first.same).toBe(true);expect(first.history).toEqual([1,1]);expect(first.ackA.duplicate).toBe(false);expect(first.ackB.duplicate).toBe(false);
  await expect.poll(()=>page.evaluate(()=>{const n=window.sharedTools.network;return[n.a,n.b].every(s=>s.events.some(e=>e.kind==="catchup"));})).toBe(true);
  const url=await relay.restart();await page.reload();await expect(page.locator("#status")).toHaveText("Ready");await page.addScriptTag({type:"module",url:"/socket-fixture.mjs"});await page.waitForFunction(()=>window.relaySocketFixture);
  const restored=await page.evaluate(async({url,tokens})=>{
    const t=window.sharedTools,p=t.wasm.SharedRichProfile.from_configuration_json(t.vector.shared_writer.configuration),saved=JSON.parse(localStorage.getItem("relay-editor-journals")),credentials=JSON.parse(localStorage.getItem("relay-separate-credentials")),accepted=JSON.parse(localStorage.getItem("relay-accepted-groups"));
    const aa=new t.SharedRichEditor(p.restore("room",saved.a)),bb=new t.SharedRichEditor(p.restore("room",saved.b));p.free();
    const exact=aa.checkpointJson()===saved.a&&bb.checkpointJson()===saved.b;
    const a=await window.relaySocketFixture.connect(url,"alice",tokens.alice),b=await window.relaySocketFixture.connect(url,"bob",tokens.bob);
    const ar=await a.request({kind:"resume",writer:credentials.ar.lease.writer,credential:credentials.ar.credential}),br=await b.request({kind:"resume",writer:credentials.br.lease.writer,credential:credentials.br.credential});
    if(ar.kind!=="resumed"||br.kind!=="resumed")throw Error("Resume failed");
    const retry=await a.request({kind:"submit",group:accepted.ga});
    await aa.receiveFrame(a.authenticated.frame);await bb.receiveFrame(b.authenticated.frame);
    aa.undo();const undone=aa.documentJson();const ug=aa.writerGroups(accepted.a.receipt.through).groups;
    const undoReceipt=await a.request({kind:"submit",group:ug[0]});aa.redo();const rg=aa.writerGroups(undoReceipt.receipt.through).groups;const redoReceipt=await a.request({kind:"submit",group:rg[0]});
    const frame=(await b.request({kind:"sync"})).frame;await aa.receiveFrame(frame);await bb.receiveFrame(frame);
    t.networkRestored={a,b,aa,bb};t.mountSharedEditor(document.querySelector("#a"),{core:aa});t.mountSharedEditor(document.querySelector("#b"),{core:bb});
    return{exact,retry,original:accepted.a,undoReceipt,redoReceipt,undone,document:aa.documentJson(),same:aa.documentJson()===bb.documentJson(),history:[aa.view().undoDepth,bb.view().undoDepth]};
  },{url,tokens:relay.tokens});
  expect(restored.exact).toBe(true);expect(restored.retry).toEqual({...restored.original,duplicate:true});expect(restored.undoReceipt.kind).toBe("durable");expect(restored.redoReceipt.kind).toBe("durable");expect(restored.undone).toContain("Remote caption ");expect(restored.undone).not.toContain("Network 🙂 ");expect(restored.document).toBe(first.document);expect(restored.same).toBe(true);expect(restored.history).toEqual([1,1]);
  for(const pane of["#a","#b"]){await expect(page.locator(`${pane} [data-rich-text="p"]`)).toHaveText("Network 🙂 a🙂b");await expect(page.locator(`${pane} img`)).toHaveAttribute("alt","Network image");}
});

test("network accounts roles and writer leases reject forged authors fence old sockets and retain rejected offline work",async({page,context})=>{
  await provision(page,relay);
  const r=await page.evaluate(async({url,tokens})=>{
    const t=window.sharedTools,n=t.network,connect=window.relaySocketFixture.connect;
    const bad=await connect(url,"alice",tokens.bob),ungranted=await connect(url,"ungranted",tokens.ungranted),reader=await connect(url,"reader",tokens.reader);
    const readRegister=await reader.request({kind:"register"});
    const readerGrant=await reader.request({kind:"grant",principal:"alice",role:"editor"});
    n.aa.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Preserved offline "}}]});
    n.bb.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Foreign author "}}]});
    const ga=n.aa.writerGroups("0").groups[0],gb=n.bb.writerGroups("0").groups[0],saved=n.aa.checkpointJson();
    const replacement=await connect(url,"alice",tokens.alice);const resumed=await replacement.request({kind:"resume",writer:n.ar.lease.writer,credential:n.ar.credential});
    await n.a.closed;const old=n.a.events.find(e=>e.kind==="error"&&e.code==="lease_rejected");await n.a.close();
    const forged=await replacement.request({kind:"submit",group:gb});
    const valid=await replacement.request({kind:"submit",group:ga});
    n.aa.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Unsynced permission loss "}}]});
    const retained=n.aa.checkpointJson();
    await n.owner.request({kind:"grant",principal:"alice",role:null});await replacement.closed;
    const noJournalLoss=n.aa.checkpointJson()===retained;
    const forbidden=await connect(url,"alice",tokens.alice);
    await n.owner.request({kind:"grant",principal:"alice",role:"editor"});
    const again=await connect(url,"alice",tokens.alice);await again.request({kind:"resume",writer:n.ar.lease.writer,credential:n.ar.credential});
    const missing=n.aa.writerGroups(valid.receipt.through).groups;const accepted=await again.request({kind:"submit",group:missing[0]});const frame=(await again.request({kind:"sync"})).frame;await n.aa.receiveFrame(frame);
    return{bad:bad.authenticated,ungranted:ungranted.authenticated,reader:reader.authenticated.kind,readRegister,readerGrant,resumed:resumed.kind,old,forged,valid,forbidden:forbidden.authenticated,accepted,noJournalLoss,retained:retained.includes("Unsynced permission loss "),saved:saved.includes("Preserved offline "),document:n.aa.documentJson()};
  },{url:relay.url,tokens:relay.tokens});
  expect(r.bad.code).toBe("permission_denied");expect(r.ungranted.code).toBe("permission_denied");expect(r.reader).toBe("authenticated");expect(r.readRegister.code).toBe("permission_denied");expect(r.readerGrant.code).toBe("permission_denied");expect(r.resumed).toBe("resumed");expect(r.old.code).toBe("lease_rejected");expect(r.forged.code).toBe("group_rejected");expect(r.valid.kind).toBe("durable");expect(r.forbidden.code).toBe("permission_denied");expect(r.accepted.kind).toBe("durable");expect(r.noJournalLoss).toBe(true);expect(r.retained&&r.saved).toBe(true);expect(r.document).toContain("Unsynced permission loss Preserved offline ");
  const foreign=await context.newPage();try{const opened=await foreign.evaluate(url=>new Promise(resolve=>{const s=new WebSocket(url);s.addEventListener("open",()=>{s.close();resolve(true);});s.addEventListener("error",()=>resolve(false));}),relay.url);expect(opened).toBe(false);}finally{await foreign.close();}
});

test("network pending gaps stay outside accepted history and exact duplicate submissions retain the original durable sequence",async({page})=>{
  await provision(page,relay);
  const r=await page.evaluate(async()=>{
    const t=window.sharedTools,n=t.network;
    n.aa.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"First "}}]});
    await n.bb.receiveFrame(n.aa.updateFrame());n.bb.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Dependent "}}]});
    n.aa.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Second "}}]});
    const a=n.aa.writerGroups("0").groups,b=n.bb.writerGroups("0").groups[0];
    const gap=await n.a.request({kind:"submit",group:a[1]}),pending=await n.b.request({kind:"submit",group:b});
    const clock=await n.a.request({kind:"clock",writer:n.ar.lease.writer});
    const first=await n.a.request({kind:"submit",group:a[0]}),second=await n.b.request({kind:"submit",group:b}),last=await n.a.request({kind:"submit",group:a[1]}),duplicate=await n.a.request({kind:"submit",group:a[0]});
    const frame=(await n.b.request({kind:"sync"})).frame;await n.aa.receiveFrame(frame);await n.bb.receiveFrame(frame);
    return{gap,pending,clock,first,second,last,duplicate,same:n.aa.documentJson()===n.bb.documentJson(),document:n.aa.documentJson()};
  });
  expect(r.gap.kind).toBe("pending");expect(r.pending.kind).toBe("pending");expect(r.clock.clock.through).toBe("0");for(const ack of[r.first,r.second,r.last])expect(ack.kind).toBe("durable");expect(r.duplicate).toEqual({...r.first,duplicate:true});expect(r.same).toBe(true);expect(r.document).toContain("Second First ");expect(r.document).toContain("Dependent ");
});

test("writer takeover fences the old socket before another session's own-author catchup can enter its local history",async({page})=>{
  await provision(page,relay);
  const r=await page.evaluate(async({url,tokens})=>{
    const t=window.sharedTools,n=t.network;
    n.beforeTakeover=n.aa.checkpointJson();n.a.events.length=0;
    const next=await window.relaySocketFixture.connect(url,"alice",tokens.alice);
    const resumed=await next.request({kind:"resume",writer:n.ar.lease.writer,credential:n.ar.credential});
    const p=t.wasm.SharedRichProfile.from_configuration_json(t.vector.shared_writer.configuration),writer=new t.SharedRichEditor(p.restore("room",n.beforeTakeover));p.free();
    writer.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Replacement session "}}]});
    const receipt=await next.request({kind:"submit",group:writer.writerGroups("0").groups[0]});
    n.takeover={next,writer};return{resumed:resumed.kind,receipt:receipt.kind};
  },{url:relay.url,tokens:relay.tokens});
  expect(r).toEqual({resumed:"resumed",receipt:"durable"});
  await expect.poll(()=>page.evaluate(()=>window.sharedTools.network.a.socket.readyState)).toBe(3);
  const fenced=await page.evaluate(()=>{const t=window.sharedTools,n=t.network,p=t.wasm.SharedRichProfile.from_configuration_json(t.vector.shared_writer.configuration);let advancedFrames=0;try{for(const event of n.a.events.filter(e=>e.kind==="catchup")){const reader=new t.SharedRichEditor(p.join_frame("room","999",event.frame));try{if(reader.writerClock(n.ar.lease.writer).through!=="0")advancedFrames++;}finally{reader.dispose();}}return{errors:n.a.events.filter(e=>e.kind==="error").map(e=>e.code),advancedFrames,unchanged:n.aa.checkpointJson()===n.beforeTakeover};}finally{p.free();}});
  expect(fenced).toEqual({errors:["lease_rejected"],advancedFrames:0,unchanged:true});
});
