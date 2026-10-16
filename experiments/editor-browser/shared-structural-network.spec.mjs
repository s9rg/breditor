import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {createRelay} from "../shared-browser/relay-fixture.mjs";
let relay,bootstrap,other;
const socketSource=readFileSync(new URL("../shared-browser/socket-fixture.mjs",import.meta.url),"utf8");
async function route(page){await page.route("**/relay-bootstrap.json",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(bootstrap)}));}
async function ready(page){await expect(page.locator("#ready")).toHaveText("Ready");await expect.poll(()=>page.evaluate(()=>Object.values(window.sharedV2Network.peers).every(p=>p.sync.state().status==="ready"))).toBe(true);}
async function same(page){await expect.poll(()=>page.evaluate(()=>{const {a,b}=window.sharedV2Network.peers;return a.session.view().documentJson===b.session.view().documentJson;})).toBe(true);}
test.beforeEach(async({page})=>{
 await page.goto("/shared-structural.html");await expect(page.locator("#ready")).toHaveText("Ready");
 const input=await page.evaluate(()=>({configuration:JSON.stringify(window.sharedV2.configuration),input:window.sharedV2.documentJson,origin:location.origin,richLanguage:2,standardInline:true}));relay=await createRelay(input);
 await page.addScriptTag({type:"module",content:socketSource});await page.waitForFunction(()=>window.relaySocketFixture);
 await page.evaluate(async({url,tokens})=>{const admin=await window.relaySocketFixture.connect(url,"owner",tokens.owner);try{for(const principal of ["alice","bob"]){const r=await admin.request({kind:"grant",principal,role:"editor"});if(r.kind!=="granted")throw Error("Provisioning failed");}}finally{await admin.close();}},{url:relay.url,tokens:relay.tokens});
 bootstrap={url:relay.url,tokens:{alice:relay.tokens.alice,bob:relay.tokens.bob}};await route(page);
});
test.afterEach(async({page},testInfo)=>{
 // Preserve replayable fixture journals before teardown if a network/history
 // assertion fails; a trace alone does not retain the native replay input.
 if(testInfo.status!==testInfo.expectedStatus&&!page.isClosed()){
  const state=await page.evaluate(()=>{const t=window.sharedV2Network;if(!t)return null;return {errors:t.errors,peers:Object.fromEntries(Object.entries(t.peers).map(([key,p])=>[key,{checkpoint:p.session.checkpointJson(),view:p.session.view(),frame:p.session.core.updateFrame(),sync:p.sync.state()}]))};}).catch(error=>({diagnosticError:String(error)}));
  if(state)await testInfo.attach("native-network-fixture-state",{body:JSON.stringify(state),contentType:"application/json"});
 }
 await other?.close();other=undefined;await relay?.dispose();relay=undefined;
});

test("V2 network shares offline task nesting code and media through real relay restart and exact client recovery",async({page})=>{
 await page.goto("/shared-structural-network.html");await ready(page);
 await page.evaluate(()=>{const {a,b}=window.sharedV2Network.peers;a.sync.disconnect();a.assets.setOnline(false);a.session.execute({commands:[{kind:"indent_task_items",data:{container:"tasks",first:"task-b",last:"task-b",new_nested:null}},{kind:"set_code_language",data:{block:"code",language:"TypeScript"}}]});b.session.execute({commands:[{kind:"set_task_checked",data:{block:"task-b",checked:true}},{kind:"insert_text",data:{block:"caption",offset:0,text:"Online peer "}},{kind:"resize_column",data:{block:"table-block",column:"c",width:330}}]});});
 await page.evaluate(async()=>{const t=window.sharedV2Network,canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;canvas.getContext("2d").fillRect(0,0,1,1);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));await t.files("a",[new File([blob],"offline.png",{type:"image/png"})]);await t.peers.a.session.flush();});
 await expect(page.locator('#b [data-rich-block="tasks"] > [data-rich-task]')).toHaveCount(2);
 await page.evaluate(async()=>{const t=window.sharedV2Network;t.peers.a.assets.setOnline(true);await t.peers.a.sync.connect();await Promise.all(Object.values(t.peers).map(p=>p.sync.flush()));await t.uploaded("a");});await ready(page);await same(page);await expect.poll(()=>page.locator('#b [data-rich-task="task-a"] figure img').evaluate(i=>i.naturalWidth)).toBe(1);
 const saved=await page.evaluate(async()=>{const t=window.sharedV2Network;await Promise.all(Object.values(t.peers).map(async p=>{await p.sync.flush();await p.session.flush();}));return {document:t.peers.a.session.view().documentJson,history:[t.peers.a.session.view().undoDepth,t.peers.b.session.view().undoDepth]};});expect(saved.history).toEqual([2,1]);
 await relay.offline();await expect.poll(()=>page.evaluate(()=>Object.values(window.sharedV2Network.peers).every(p=>["offline","connecting"].includes(p.sync.state().status)))).toBe(true);expect(await relay.online()).toBe(relay.url);await ready(page);await same(page);
 await page.evaluate(()=>window.sharedV2Network.close());await page.reload();await ready(page);await same(page);expect(await page.evaluate(()=>{const t=window.sharedV2Network;return {document:t.peers.a.session.view().documentJson,history:[t.peers.a.session.view().undoDepth,t.peers.b.session.view().undoDepth],recovered:[t.peers.a.session.recovered,t.peers.b.session.recovered]};})).toEqual({...saved,recovered:[true,true]});
 await page.evaluate(async()=>{const p=window.sharedV2Network.peers.a;p.session.core.undo();await p.sync.flush();});await same(page);await expect(page.locator('#b [data-rich-task="task-a"] figure')).toHaveCount(0);await expect(page.locator('#b [data-rich-text="caption"]')).toHaveText("Online peer xy🙂");await expect(page.locator('#b [data-task-check="task-b"]')).toBeChecked();
 await page.evaluate(async()=>{const p=window.sharedV2Network.peers.a;p.session.core.redo();await p.sync.flush();});await same(page);expect(await page.evaluate(()=>window.sharedV2Network.peers.a.session.view().documentJson)).toBe(saved.document);
 expect(await page.evaluate(()=>window.sharedV2Network.errors.filter(e=>!["connection_lost","connection_timeout"].includes(e)))).toEqual([]);
});

test("V2 network independent contexts exchange task completion code text assets and causal presence",async({page,browser})=>{
 await page.goto("/shared-structural-network.html?peer=alice");await ready(page);other=await browser.newContext();const peer=await other.newPage();await route(peer);await peer.goto("http://127.0.0.1:49784/shared-structural-network.html?peer=bob");await ready(peer);
 await peer.evaluate(()=>{const p=window.sharedV2Network.peers.b;p.session.select(window.sharedV2Network.range("task-b-head",2));});
 await expect.poll(()=>page.evaluate(()=>window.sharedV2Network.peers.a.presence.view().some(p=>p.resolution?.kind==="resolved"&&p.resolution.selection?.kind==="text"&&p.resolution.selection.focus.block==="task-b-head"))).toBe(true);
 await page.evaluate(async()=>{const t=window.sharedV2Network,p=t.peers.a;p.session.execute({commands:[{kind:"set_task_checked",data:{block:"task-b",checked:true}},{kind:"insert_text",data:{block:"code",offset:0,text:"Peer code\n"}}]});await p.sync.flush();const canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;canvas.getContext("2d").fillRect(0,0,1,1);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));await t.files("a",[new File([blob],"cross-context.png",{type:"image/png"})]);await p.sync.flush();await t.uploaded("a");});
 await expect(peer.locator('#b [data-task-check="task-b"]')).toBeChecked();await expect(peer.locator('#b [data-rich-text="code"]')).toHaveText("Peer code\nlet x = 1;\n\t🙂");await expect.poll(()=>peer.locator('#b [data-rich-task="task-a"] figure img').evaluate(i=>i.naturalWidth)).toBe(1);
 expect(await peer.evaluate(()=>window.sharedV2Network.peers.b.cache.list().then(rows=>rows.map(r=>({status:r.status,attempts:r.attempts}))))).toEqual([{status:"uploaded",attempts:0}]);
 await page.evaluate(()=>window.sharedV2Network.close());await peer.evaluate(()=>window.sharedV2Network.close());await page.reload();await peer.reload();await ready(page);await ready(peer);await expect(peer.locator('#b [data-task-check="task-b"]')).toBeChecked();expect(await page.evaluate(()=>window.sharedV2Network.peers.a.session.recovered)).toBe(true);expect(await peer.evaluate(()=>window.sharedV2Network.peers.b.session.recovered)).toBe(true);
});

test("V2 network image ingestion retains its intent while a real peer publication waits in the bounded queue",async({page})=>{
 await page.goto("/shared-structural-network.html");await ready(page);
 await page.evaluate(async()=>{const t=window.sharedV2Network,p=t.peers.a,original=p.cache.ingest.bind(p.cache);t.releaseIngest=undefined;t.ingested=false;p.cache.ingest=async file=>{const value=await original(file);t.ingested=true;await new Promise(resolve=>{t.releaseIngest=resolve;});return value;};const canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;canvas.getContext("2d").fillRect(0,0,1,1);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));t.inserting=t.files("a",[new File([blob],"held-ingestion.png",{type:"image/png"})]);});
 await expect.poll(()=>page.evaluate(()=>window.sharedV2Network.ingested)).toBe(true);
 await page.evaluate(async()=>{const p=window.sharedV2Network.peers.b;p.session.execute({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"During ingestion "}}]});await p.sync.flush();});
 await expect.poll(()=>page.evaluate(()=>window.sharedV2Network.peers.a.session.core.pendingRemote().frames)).toBe(1);
 await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("xy🙂");
 await page.evaluate(async()=>{const t=window.sharedV2Network;t.releaseIngest();await t.inserting;await t.peers.a.sync.flush();await t.uploaded("a");});await same(page);await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("During ingestion xy🙂");await expect.poll(()=>page.locator('#b [data-rich-task="task-a"] figure img').evaluate(i=>i.naturalWidth)).toBe(1);
 await page.evaluate(async()=>{const p=window.sharedV2Network.peers.a;p.session.core.undo();await p.sync.flush();});await same(page);await expect(page.locator('#b [data-rich-task="task-a"] figure')).toHaveCount(0);await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("During ingestion xy🙂");expect(await page.evaluate(()=>window.sharedV2Network.errors)).toEqual([]);
});

test("V2 network read-only receives edits assets presence and reconnect without authoring or losing history",async({page})=>{
 await page.goto("/shared-structural-network.html");await ready(page);
 await page.evaluate(async()=>{const t=window.sharedV2Network,{a}=t.peers;a.session.select(t.range("p",1));a.session.core.type("Q");a.session.core.undo();await a.sync.flush();a.session.setReadOnly(true);});await same(page);
 const history=await page.evaluate(()=>{const v=window.sharedV2Network.peers.a.session.view();return [v.undoDepth,v.redoDepth];});
 await page.evaluate(async()=>{const t=window.sharedV2Network,{a,b}=t.peers;a.sync.disconnect();b.session.execute({commands:[{kind:"set_task_checked",data:{block:"task-b",checked:true}},{kind:"insert_text",data:{block:"caption",offset:0,text:"Remote "}}]});b.session.select(t.range("task-b-head",2));await b.sync.flush();const canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;canvas.getContext("2d").fillRect(0,0,1,1);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));await t.files("b",[new File([blob],"readonly-peer.png",{type:"image/png"})]);await b.sync.flush();await t.uploaded("b");await a.sync.connect();await a.sync.flush();});await ready(page);await same(page);
 await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("Remote xy🙂");await expect(page.locator('#a [data-task-check="task-b"]')).toBeChecked();await expect(page.locator('#a [data-task-check="task-b"]')).toBeDisabled();await expect.poll(()=>page.locator('#a [data-rich-task="task-a"] figure img').evaluate(i=>i.naturalWidth)).toBe(1);
 // Publish fresh causal presence after reconnect; it is not a document mutation.
 await page.evaluate(()=>{const t=window.sharedV2Network;t.peers.b.session.select(t.range("task-b-head",3));});await expect.poll(()=>page.evaluate(()=>window.sharedV2Network.peers.a.presence.view().some(p=>p.resolution?.kind==="resolved"&&p.resolution.selection?.focus?.block==="task-b-head"))).toBe(true);
 expect(await page.evaluate(()=>{const t=window.sharedV2Network,p=t.peers.a,v=p.session.view(),before=p.session.checkpointJson();let code;try{p.session.core.type("No");}catch(error){code=error.code;}return {locked:v.readOnly,history:[v.undoDepth,v.redoDepth],code,unchanged:p.session.checkpointJson()===before,errors:t.errors};})).toEqual({locked:true,history,code:"read_only",unchanged:true,errors:[]});
 await page.evaluate(async()=>{const p=window.sharedV2Network.peers.a;p.session.setReadOnly(false);p.session.core.redo();p.session.core.undo();await p.sync.flush();});await same(page);await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("Remote xy🙂");await expect(page.locator('#a [data-task-check="task-b"]')).toBeChecked();
});

test("V2 network grouped offline typing remains selective through reconnect relay restart assets and exact reload",async({page})=>{
 await page.goto("/shared-structural-network.html?history=typing");await ready(page);await page.evaluate(()=>{const t=window.sharedV2Network,p=t.peers.a;p.sync.disconnect();p.session.select(t.range("caption",1));p.session.focus();});await page.keyboard.type("AB");
 expect(await page.evaluate(()=>window.sharedV2Network.peers.a.session.view().undoDepth)).toBe(1);
 await page.evaluate(async()=>{const t=window.sharedV2Network,p=t.peers.b;p.session.execute({commands:[{kind:"set_task_checked",data:{block:"task-b",checked:true}},{kind:"insert_text",data:{block:"p",offset:0,text:"Foreign "}}]});await p.sync.flush();const canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;canvas.getContext("2d").fillRect(0,0,1,1);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));await t.files("b",[new File([blob],"grouped-peer.png",{type:"image/png"})]);await p.sync.flush();await t.uploaded("b");await t.peers.a.sync.connect();await t.peers.a.sync.flush();});await ready(page);await same(page);await expect.poll(()=>page.locator('#a [data-rich-task="task-a"] figure img').evaluate(i=>i.naturalWidth)).toBe(1);
 const checkpoint=await page.evaluate(async()=>{const p=window.sharedV2Network.peers.a;p.session.closeTypingGroup();await p.session.flush();return p.session.checkpointJson();});await relay.offline();expect(await relay.online()).toBe(relay.url);await ready(page);await same(page);await page.evaluate(()=>window.sharedV2Network.close());await page.reload();await ready(page);await same(page);expect(await page.evaluate(()=>window.sharedV2Network.peers.a.session.checkpointJson())).toBe(checkpoint);
 // Online acknowledgement echoes must not split a same-context typing burst.
 await page.evaluate(()=>{const t=window.sharedV2Network,p=t.peers.a,original=p.session.core.typeUser.bind(p.session.core);p.onlineTypeClocks=[];p.session.core.typeUser=(...args)=>{p.onlineTypeClocks.push(args[1]);return original(...args);};p.session.select(t.range("caption",3));p.session.focus();});await page.keyboard.type("CD");await page.evaluate(()=>window.sharedV2Network.peers.a.sync.flush());await same(page);
 expect(await page.evaluate(()=>{const p=window.sharedV2Network.peers.a;if(p.onlineTypeClocks.length!==2)throw Error("Expected two native user input calls");p.onlineUnits=BigInt(p.onlineTypeClocks[1])-BigInt(p.onlineTypeClocks[0])<=750n?1:2;return p.session.view().undoDepth===1+p.onlineUnits;})).toBe(true);
 await page.evaluate(async()=>{const p=window.sharedV2Network.peers.a;for(let i=0;i<p.onlineUnits;i++)p.session.core.undo();await p.sync.flush();});await same(page);await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("xABy🙂");
 await page.evaluate(async()=>{const p=window.sharedV2Network.peers.a;p.session.core.undo();await p.sync.flush();});await same(page);await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("xy🙂");await expect(page.locator('#a [data-rich-text="p"]')).toHaveText("Foreign a🙂b");await expect(page.locator('#a [data-task-check="task-b"]')).toBeChecked();await expect(page.locator('#a [data-rich-task="task-a"] figure img')).toHaveCount(1);
 await page.evaluate(async()=>{const p=window.sharedV2Network.peers.a;for(let i=0;i<1+p.onlineUnits;i++)p.session.core.redo();await p.sync.flush();});await same(page);await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("xABCDy🙂");expect(await page.evaluate(()=>window.sharedV2Network.errors.filter(e=>!["connection_lost","connection_timeout"].includes(e)))).toEqual([]);
});
