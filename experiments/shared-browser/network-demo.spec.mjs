import AxeBuilder from "@axe-core/playwright";
import {test,expect} from "@playwright/test";
import {createRelay} from "./relay-fixture.mjs";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
let relay,bootstrap,otherContext;
async function route(page){await page.route("**/relay-bootstrap.json",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(bootstrap)}));}
const pilotRoot=()=>JSON.parse(readFileSync(new URL("./pilot-root.json",import.meta.url),"utf8"));
const pilotBootstrap=()=>({format:"breditor/first-party-pilot",formatVersion:1,endpoint:bootstrap.endpoint,configuration:bootstrap.configuration});
const routePilot=(page,config=pilotBootstrap())=>page.route("**/pilot-bootstrap.json",route=>route.fulfill({
 status:200,contentType:"application/json",body:JSON.stringify(config),
}));
async function ready(page,options={}){await expect(page.locator("#network-state")).toHaveText("Editors ready",options);await expect.poll(()=>page.evaluate(()=>Object.values(window.breditorNetworkDemo.peers).every(p=>p.sync.state().status==="ready")),options).toBe(true);}
async function same(page){await expect.poll(()=>page.evaluate(()=>{const{a,b}=window.breditorNetworkDemo.peers;return a.session.core.documentJson()===b.session.core.documentJson();})).toBe(true);}
async function provisionDemo(page,root){
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 const input=await page.evaluate(()=>({configuration:JSON.stringify(window.sharedTools.vector.shared_profile.configuration),input:window.sharedTools.vector.shared_profile.input,origin:location.origin}));
 if(root)input.input=JSON.stringify({...JSON.parse(input.input),root});
 relay=await createRelay(input);
 await page.addScriptTag({type:"module",url:"/socket-fixture.mjs"});await page.waitForFunction(()=>window.relaySocketFixture);
 await page.evaluate(async({url,tokens})=>{const owner=await window.relaySocketFixture.connect(url,"owner",tokens.owner);for(const principal of["alice","bob"]){const r=await owner.request({kind:"grant",principal,role:"editor"});if(r.kind!=="granted")throw Error("Demo account provisioning failed");}await owner.close();},{url:relay.url,tokens:relay.tokens});
 bootstrap={format:"breditor/network-demo",formatVersion:1,endpoint:relay.url,configuration:JSON.parse(input.configuration),tokens:{alice:relay.tokens.alice,bob:relay.tokens.bob}};
}
test.afterEach(async({page},info)=>{
 if(info.status!==info.expectedStatus&&!page.isClosed()){
  const state=await page.evaluate(()=>{const t=window.breditorNetworkDemo;if(!t)return null;return {ready:t.ready,errors:t.errors,peers:Object.fromEntries(Object.entries(t.peers).map(([key,p])=>[key,{offline:p.offline,button:document.querySelector(`#connect-${key}`)?.textContent,sync:p.sync?.state(),checkpoint:p.session?.core.checkpointJson()}]))};}).catch(error=>({diagnosticError:String(error)}));
  await info.attach("application-network-native-state",{body:JSON.stringify(state),contentType:"application/json"});
 }
 await otherContext?.close();otherContext=undefined;await relay?.dispose();relay=undefined;
});

test.describe("Developer demo",()=>{
test.beforeEach(async({page})=>{await provisionDemo(page);await route(page);});
test("the network demo has separate writer statuses and a keyboard skip link",async({page,browserName})=>{
 await page.goto("/network-demo");await ready(page);
 const skip=page.getByRole("link",{name:"Skip to network editors"});
 // macOS WebKit reaches links with Option+Tab under its default keyboard setting.
 await page.keyboard.press(browserName==="webkit"&&process.platform==="darwin"?"Alt+Tab":"Tab");
 await expect(skip).toBeFocused();
 await expect(skip).toBeInViewport();
 await page.keyboard.press("Enter");
 const main=page.getByRole("main");
 await expect(main).toHaveCount(1);
 await expect(main).toBeFocused();
 for(const writer of ["alice","bob"]){
  const region=main.getByRole("region",{name:writer,exact:true});
  await expect(region.getByRole("status",{name:`${writer} synchronization`})).toContainText("server saved");
  await expect(region.getByRole("status",{name:`${writer} peer selection`})).toBeVisible();
 }
 const audit=await new AxeBuilder({page}).analyze();
 expect(audit.violations).toEqual([]);
});

test("network demo combines offline table image text history and restart with distinct saved states",async({page})=>{
 await page.goto("/network-demo");await ready(page);
 await page.locator("#connect-a").click();await expect(page.locator("#state-a")).toContainText("offline");
 await page.evaluate(()=>{const{a,b}=window.breditorNetworkDemo.peers;a.session.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Offline A "}},{kind:"resize_column",data:{block:"table-block",column:"c",width:330}}]});b.session.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Online B "}},{kind:"set_image_alt",data:{block:"image-block",text:"Network diagram",decorative:false}}]});});
 const fixture=JSON.parse(readFileSync(new URL("../../target/relay-raster-fixtures.json",import.meta.url),"utf8"))[0];await page.locator("#files-a").setInputFiles({name:"network.png",mimeType:fixture.mime,buffer:Buffer.from(fixture.bytes)});
 await expect(page.locator("#state-a")).toContainText("images 0/1");await expect(page.locator("#state-a")).toContainText("server pending");
 await expect(page.locator('#b [data-rich-text="p"]')).toHaveText("a🙂b");
 await page.locator("#connect-a").click();await ready(page);await same(page);await expect(page.locator("#state-a")).toContainText("images 0/1");
 await page.locator("#upload-a").click();await expect(page.locator("#state-a")).toContainText("images 1/1");await expect(page.locator("#state-b")).toContainText("images 1/1");
 await expect.poll(()=>page.locator("#b img").last().evaluate(img=>img.naturalWidth)).toBe(2);
 const saved=await page.evaluate(async()=>{const{a,b}=window.breditorNetworkDemo.peers;await Promise.all([a.session.flush(),b.session.flush(),a.sync.flush(),b.sync.flush()]);return{document:a.session.core.documentJson(),history:[a.session.core.view().undoDepth,b.session.core.view().undoDepth]};});expect(saved.history).toEqual([2,1]);
 await relay.offline();await expect.poll(()=>page.evaluate(()=>Object.values(window.breditorNetworkDemo.peers).every(p=>["offline","connecting"].includes(p.sync.state().status)))).toBe(true);expect(await relay.online()).toBe(relay.url);await ready(page);
 await page.evaluate(()=>window.breditorNetworkDemo.close());await page.reload();await ready(page);await same(page);
 const restored=await page.evaluate(()=>{const{a,b}=window.breditorNetworkDemo.peers;return{document:a.session.core.documentJson(),recovered:[a.session.recovered,b.session.recovered],history:[a.session.core.view().undoDepth,b.session.core.view().undoDepth]};});expect(restored).toEqual({...saved,recovered:[true,true]});
 await page.locator('#a [data-shared-action="undo"]').click();await same(page);await expect(page.locator("#b img")).toHaveCount(1);await expect(page.locator('#b [data-rich-text="caption"]')).toHaveText("Online B xy🙂");
 await page.locator('#a [data-shared-action="redo"]').click();await same(page);await expect.poll(()=>page.locator("#b img").last().evaluate(img=>img.naturalWidth)).toBe(2);
 expect(await page.evaluate(()=>window.breditorNetworkDemo.peers.a.session.core.documentJson())).toBe(saved.document);
});

test("single account demo pages exchange real image bytes and visible peer carets across independent contexts",async({page,browser})=>{
 await page.goto("/network-demo?peer=alice");await ready(page);await expect(page.locator("#pane-b")).toHaveCount(0);
 otherContext=await browser.newContext();const peer=await otherContext.newPage();await route(peer);await peer.goto("/network-demo?peer=bob");await ready(peer);await expect(peer.locator("#pane-a")).toHaveCount(0);
 await page.locator('#a [data-rich-text="p"]').scrollIntoViewIfNeeded();
 await peer.evaluate(()=>{const p=window.breditorNetworkDemo.peers.b,point={block:"p",offset:"1",affinity:"after"};p.mounted.select({kind:"text",anchor:point,focus:point});});
 await expect(page.locator('[data-shared-presence-overlay] [data-peer-kind="text"]').first()).toBeVisible();await expect(page.locator("#presence-a")).toContainText("bob: caret p@1");
 const fixture=JSON.parse(readFileSync(new URL("../../target/relay-raster-fixtures.json",import.meta.url),"utf8"))[0];await page.locator("#files-a").setInputFiles({name:"separate.png",mimeType:fixture.mime,buffer:Buffer.from(fixture.bytes)});
 await expect(page.locator("#state-a")).toContainText("images 1/1");await expect(peer.locator("#state-b")).toContainText("images 1/1");await expect.poll(()=>peer.locator("#b img").last().evaluate(img=>img.naturalWidth)).toBe(2);
 const cache=await peer.evaluate(()=>window.breditorNetworkDemo.peers.b.cache.list());expect(cache[0]).toMatchObject({status:"uploaded",attempts:0,asset:fixture.asset});
});

test("independent offline writers keep exact journals across a relay and page restart, including downloaded backups",async({page,browser})=>{
 await page.goto("/network-demo?peer=alice");
 await ready(page);
 otherContext=await browser.newContext();
 const bob=await otherContext.newPage();
 await route(bob);
 await bob.goto("/network-demo?peer=bob");
 await ready(bob);

 const writers=[[page,"a","p","Alice offline. "],[bob,"b","caption","Bob offline. "]];
 for(const [writer,key,block,text] of writers){
  await writer.bringToFront();
  await writer.getByRole("button",{name:"Go offline",exact:true}).press("Enter");
  await expect(writer.locator(`#state-${key}`)).toContainText("offline");
  await writer.evaluate(key=>window.breditorNetworkDemo.peers[key].sync.waitForDisconnected(),key);
  await writer.evaluate(({key,block})=>{
   const {mounted}=window.breditorNetworkDemo.peers[key];
   const point={block,offset:"0",affinity:"after"};
   mounted.surface.focus();
   mounted.select({kind:"text",anchor:point,focus:point});
  },{key,block});
  await writer.keyboard.insertText(text);
 }
 await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("xy🙂");
 await expect(bob.locator('#b [data-rich-text="p"]')).toHaveText("a🙂b");

 const saved=await Promise.all(writers.map(([writer,key])=>writer.evaluate(async key=>{
  const {session,identity}=window.breditorNetworkDemo.peers[key];
  await session.flush();
  return {checkpoint:session.core.checkpointJson(),writer:identity.writer};
 },key)));

 await relay.offline();
 await Promise.all(writers.map(([writer])=>writer.evaluate(()=>window.breditorNetworkDemo.close())));
 await Promise.all(writers.map(([writer])=>writer.reload()));
 for(const [index,[writer,key]] of writers.entries()){
  await expect.poll(()=>writer.evaluate(()=>window.breditorNetworkDemo?.ready)).toBe(true);
  const reloaded=await writer.evaluate(key=>{
   const {session,identity}=window.breditorNetworkDemo.peers[key];
   return {checkpoint:session.core.checkpointJson(),writer:identity.writer,recovered:session.recovered};
  },key);
  expect(reloaded).toEqual({...saved[index],recovered:true});
 }

 expect(await relay.online()).toBe(relay.url);
 // Reload already started an automatic connection. Wait for its resume
 // rather than joining an earlier connection attempt made while offline.
 await Promise.all(writers.map(([writer])=>ready(writer,{timeout:15_000})));
 await Promise.all(writers.map(([writer,key])=>writer.evaluate(
  key=>window.breditorNetworkDemo.peers[key].sync.flush(),key)));
 for(const [writer,key] of writers){
  await expect(writer.locator(`#${key} [data-rich-text="p"]`)).toHaveText("Alice offline. a🙂b");
  await expect(writer.locator(`#${key} [data-rich-text="caption"]`)).toHaveText("Bob offline. xy🙂");
 }

 const documentJson=([writer,key])=>writer.evaluate(key=>window.breditorNetworkDemo.peers[key].session.core.documentJson(),key);
 const merged=await documentJson(writers[0]);
 expect(await documentJson(writers[1])).toBe(merged);
 await page.bringToFront();
 await page.getByRole("button",{name:"Undo",exact:true}).click();
 await expect(bob.locator('#b [data-rich-text="p"]')).toHaveText("a🙂b");
 await expect(bob.locator('#b [data-rich-text="caption"]')).toHaveText("Bob offline. xy🙂");
 await page.getByRole("button",{name:"Redo",exact:true}).click();
 await expect.poll(()=>documentJson(writers[1])).toBe(merged);

 // Drain each writer's sync work before comparing an exact offline download.
 // Document convergence alone does not account for a catchup already in flight.
 for(const [writer,key] of writers){
  await writer.getByRole("button",{name:"Go offline",exact:true}).click();
  await writer.evaluate(key=>window.breditorNetworkDemo.peers[key].sync.waitForDisconnected(),key);
 }
 await relay.offline();
 const downloaded=[];
 for(const [writer,key] of writers){
  const checkpoint=await writer.evaluate(async key=>{
   const {session}=window.breditorNetworkDemo.peers[key];
   await session.flush();
   return session.core.checkpointJson();
  },key);
  await writer.bringToFront();
  const pending=writer.waitForEvent("download");
  await writer.locator(`#save-${key}`).click();
  const download=await pending;
  expect(download.suggestedFilename()).toBe(`breditor-network-${key==="a"?"alice":"bob"}.json`);
  const contents=readFileSync(await download.path(),"utf8");
  expect(contents).toBe(checkpoint);
  downloaded.push(contents);
 }
 await Promise.all(writers.map(([writer])=>writer.evaluate(()=>window.breditorNetworkDemo.close())));
 const restored=await page.evaluate(async({configuration,downloaded})=>{
  const [api,wasm]=await Promise.all([import("/shared.js"),import("/probe.js")]);
  const profile=api.compileSharedProfile(wasm,configuration);
  try{
   return downloaded.map(checkpoint=>{
    const owner=new api.SharedRichEditor(profile.restore("room",checkpoint));
    try{return {checkpoint:owner.checkpointJson(),document:owner.documentJson()};}
    finally{owner.dispose();}
   });
  }finally{profile.free();}
 },{configuration:bootstrap.configuration,downloaded});
 expect(restored).toEqual(downloaded.map(checkpoint=>({checkpoint,document:merged})));
});
});

test("the first-party pilot opens independent participants and verifies an offline checkpoint after reload",async({page,browser})=>{
 await provisionDemo(page,pilotRoot());
 const pilotConfig=pilotBootstrap();
 const open=async (writer,principal)=>{
  await writer.getByLabel("Participant",{exact:true}).selectOption(principal);
  await writer.getByLabel("Participant code").fill(bootstrap.tokens[principal]);
  await writer.getByRole("button",{name:"Open editor"}).click();
  await expect(writer.getByRole("region",{name:"Shared document"})).toBeVisible();
 };
 await routePilot(page,pilotConfig);
 await page.route("**/network-demo.mjs",route=>route.abort());
 await page.goto("/pilot");
 await expect(page.locator("#network-state")).toContainText("The pilot runtime could not load");
 await expect(page.getByRole("button",{name:"Open editor"})).toBeDisabled();
 await page.unroute("**/network-demo.mjs");
 await page.reload();
 const publicConfig=await page.evaluate(async()=>({
  pilot:await (await fetch("/pilot-bootstrap.json")).json(),
  developerStatus:(await fetch("/relay-bootstrap.json")).status,
 }));
 expect(publicConfig).toEqual({pilot:pilotConfig,developerStatus:404});
 await expect(page.getByRole("heading",{name:"Release handoff"})).toBeVisible();
 await expect(page.getByRole("region",{name:"Shared document"})).toBeHidden();
 await page.getByLabel("Participant code").fill("0".repeat(64));
 await page.getByRole("button",{name:"Open editor"}).click();
 await expect(page.locator("#network-state")).toContainText("could not open");
 await expect(page.getByRole("region",{name:"Shared document"})).toBeHidden();

 await open(page,"alice");
 await ready(page);
 await expect(page.locator("#pane-b")).toBeHidden();
 otherContext=await browser.newContext();
 const bob=await otherContext.newPage();
 await routePilot(bob,pilotConfig);
 await bob.goto("/pilot");
 await open(bob,"bob");
 await ready(bob);
 await expect(bob.locator("#pane-a")).toBeHidden();

 await page.getByRole("button",{name:"Go offline",exact:true}).click();
 await expect(page.locator("#state-a")).toContainText("offline");
 const type=async (writer,key,block,text)=>{
  await writer.bringToFront();
  await writer.evaluate(({key,block})=>{
   const {mounted}=window.breditorNetworkDemo.peers[key];
   const point={block,offset:"0",affinity:"after"};
   mounted.surface.focus();
   mounted.select({kind:"text",anchor:point,focus:point});
  },{key,block});
  await writer.keyboard.insertText(text);
 };
 await type(page,"a","pilot-notes","Pilot decision. ");
 await type(bob,"b","pilot-item","Pilot evidence. ");
 await expect(bob.locator('#b [data-rich-text="pilot-notes"]')).toHaveText("Add the decisions and results that the next reviewer needs.");
 await expect(page.locator('#a [data-rich-text="pilot-item"]')).toHaveText("Verify the handoff");
 const checkpoint=await page.evaluate(()=>window.breditorNetworkDemo.peers.a.session.core.checkpointJson());

 await page.getByRole("button",{name:"Save and reload"}).click();
 await expect(page.getByRole("button",{name:"Open editor"})).toBeEnabled();
 await expect(page.getByLabel("Participant code")).toHaveValue("");
 await expect(page.getByLabel("Participant",{exact:true})).toHaveValue("alice");
 const savedKeys=await page.evaluate(()=>Object.entries(sessionStorage));
 expect(savedKeys).toEqual(expect.arrayContaining([["breditor-pilot-paused-alice","1"]]));
 expect(JSON.stringify(savedKeys)).not.toContain(bootstrap.tokens.alice);
 await page.getByLabel("Participant code").fill("0".repeat(64));
 await page.getByRole("button",{name:"Open editor"}).click();
 await expect(page.locator("#network-state")).toContainText("could not open");
 await expect(page.getByRole("region",{name:"Shared document"})).toBeHidden();
 await open(page,"alice");
 await expect(page.locator("#state-a")).toContainText("offline");
 expect(await page.evaluate(()=>window.breditorNetworkDemo.peers.a.session.core.checkpointJson())).toBe(checkpoint);

 const downloaded=page.waitForEvent("download");
 await page.getByRole("button",{name:"Download checkpoint"}).click();
 const file=await downloaded;
 const downloadBytes=readFileSync(await file.path());
 expect(downloadBytes).toEqual(Buffer.from(checkpoint,"utf8"));
 const expectedHash=createHash("sha256").update(downloadBytes).digest("hex");
 await expect(page.getByLabel("Downloaded checkpoint digest")).toContainText(expectedHash);
 const restore=page.getByLabel("Document checkpoint");
 await restore.setInputFiles(await file.path());
 await expect(page.locator("#pilot-verification")).toContainText(`Exact read-only replay verified. Undo 1. Redo 0. SHA-256 ${expectedHash}`);
 await expect(page.getByLabel("Recovered document text")).toContainText("Pilot decision.");
 await expect(page.getByLabel("Recovered document text")).not.toContainText("Pilot evidence.");
 expect(await page.evaluate(()=>window.breditorNetworkDemo.peers.a.session.core.checkpointJson())).toBe(checkpoint);

 await restore.setInputFiles({name:"noncanonical.json",mimeType:"application/json",buffer:Buffer.from(checkpoint+"\n","utf8")});
 await expect(page.locator("#pilot-verification")).toContainText("could not be recovered");
 await expect(page.getByLabel("Recovered document text")).toBeHidden();
 await restore.setInputFiles({name:"invalid.json",mimeType:"application/json",buffer:Buffer.from([0xff,0x00])});
 await expect(page.locator("#pilot-verification")).toContainText("could not be recovered");
 await expect(page.getByLabel("Recovered document text")).toBeHidden();

 await page.getByRole("button",{name:"Reconnect",exact:true}).click();
 await ready(page);
 await expect(bob.locator('#b [data-rich-text="pilot-notes"]')).toHaveText("Pilot decision. Add the decisions and results that the next reviewer needs.");
 await expect(page.locator('#a [data-rich-text="pilot-item"]')).toHaveText("Pilot evidence. Verify the handoff");
});

test("the pilot supports keyboard sign-in and checkpoint recovery at a narrow viewport",async({page,browserName})=>{
 await provisionDemo(page,pilotRoot());
 await routePilot(page);
 await page.setViewportSize({width:320,height:740});
 await page.goto("/pilot");
 const open=page.getByRole("button",{name:"Open editor"});
 await expect(open).toBeEnabled();
 const tab=browserName==="webkit"&&process.platform==="darwin"?"Alt+Tab":"Tab";
 const skip=page.getByRole("link",{name:"Skip to pilot workspace"});
 await page.keyboard.press(tab);
 await expect(skip).toBeFocused();
 await expect(skip).toBeInViewport();
 await page.keyboard.press("Enter");
 await expect(page.getByRole("main")).toBeFocused();
 await page.keyboard.press(tab);
 await expect(page.getByLabel("Participant",{exact:true})).toBeFocused();
 await page.keyboard.press(tab);
 const code=page.getByLabel("Participant code");
 await expect(code).toBeFocused();
 await page.keyboard.insertText(bootstrap.tokens.alice);
 await page.keyboard.press("Enter");
 await ready(page);
 await expect(page.getByRole("region",{name:"Shared document"})).toBeFocused();
 await expect(page.getByRole("region",{name:"Table 1",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Scroll table 1 right"})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
 const backup=page.getByLabel("Document checkpoint");
 for(let step=0;step<40&&!(await backup.evaluate(input=>document.activeElement===input));step++)await page.keyboard.press(tab);
 await expect(backup).toBeFocused();
 const checkpoint=await page.evaluate(()=>window.breditorNetworkDemo.peers.a.session.core.checkpointJson());
 await backup.setInputFiles({name:"checkpoint.json",mimeType:"application/json",buffer:Buffer.from(checkpoint)});
 await expect(page.locator("#pilot-verification")).toContainText("Exact read-only replay verified");
 await expect(backup).toBeFocused();
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});

test.describe("Pilot touch controls",()=>{
 test.use({hasTouch:true,viewport:{width:320,height:740}});

 test("participants can sign in, scroll a table, and reconnect with touch",async({page})=>{
  await provisionDemo(page,pilotRoot());
  await routePilot(page);
  await page.goto("/pilot");
  expect(await page.evaluate(()=>matchMedia("(any-pointer: coarse)").matches)).toBe(true);
  const open=page.getByRole("button",{name:"Open editor"});
  await expect(open).toBeEnabled();
  const usable=async control=>{
   await expect(control).toBeVisible();
   const bounds=await control.boundingBox();
   expect(bounds.height).toBeGreaterThanOrEqual(44);
   expect(bounds.width).toBeGreaterThanOrEqual(44);
  };
  await usable(open);
  await page.getByLabel("Participant code").fill(bootstrap.tokens.alice);
  await open.tap();
  await ready(page);

  const right=page.getByRole("button",{name:"Scroll table 1 right"});
  const table=page.getByRole("region",{name:"Table 1",exact:true});
  await usable(right);
  expect(await table.evaluate(element=>element.scrollLeft)).toBe(0);
  await right.tap();
  await expect.poll(()=>table.evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);

  const pause=page.getByRole("button",{name:"Go offline",exact:true});
  await usable(pause);
  await usable(page.getByRole("button",{name:"Download checkpoint"}));
  await usable(page.getByRole("button",{name:"Save and reload"}));
  await pause.tap();
  await expect(page.locator("#state-a")).toContainText("offline");
  await page.getByRole("button",{name:"Reconnect",exact:true}).tap();
  await ready(page);
 });
});
