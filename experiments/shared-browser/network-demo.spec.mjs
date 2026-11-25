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

 await page.evaluate(()=>{
  const digest=crypto.subtle.digest.bind(crypto.subtle);
  let release;
  const blocked=new Promise(resolve=>{release=resolve;});
  crypto.subtle.digest=async(...args)=>{await blocked;return digest(...args);};
  window.releaseCheckpointDigest=()=>{crypto.subtle.digest=digest;release();};
 });
 const beforeReloadDownload=page.waitForEvent("download");
 await page.getByRole("button",{name:"Download checkpoint"}).click();
 const beforeReloadFile=await beforeReloadDownload;
 expect(readFileSync(await beforeReloadFile.path())).toEqual(Buffer.from(checkpoint,"utf8"));
 await page.getByRole("button",{name:"Save and reload"}).click();
 await expect(page.getByRole("button",{name:"Download checkpoint"})).toBeDisabled();
 await page.evaluate(()=>window.releaseCheckpointDigest());
 await expect(page.getByRole("button",{name:"Open editor"})).toBeEnabled();
 await expect(page.getByLabel("Participant code")).toHaveValue("");
 await expect(page.getByLabel("Participant",{exact:true})).toHaveValue("alice");
 const savedKeys=await page.evaluate(()=>Object.entries(sessionStorage));
 const pauseScope=`breditor-pilot-paused-v2:${JSON.stringify([pilotConfig.endpoint,"alice",createHash("sha256").update(bootstrap.tokens.alice).digest("hex")])}`;
 expect(savedKeys).toEqual(expect.arrayContaining([[pauseScope,"1"]]));
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
 // WebKit's context-wide offline emulation also refuses local fixture file reads.
 // The relay is already disconnected. Block HTTP requests while reading the actual download.
 const recoveryRequests=[];
 const externalHttp=/^https?:\/\//;
 const blockRecoveryRequest=route=>{recoveryRequests.push(route.request().url());return route.abort();};
 await page.route(externalHttp,blockRecoveryRequest);
 await restore.setInputFiles(await file.path());
 await expect(page.locator("#pilot-verification")).toContainText(`Exact read-only replay verified. Undo 1. Redo 0. SHA-256 ${expectedHash}`);
 const recovered=page.getByRole("region",{name:"Recovered document",exact:true});
 await expect(recovered).toContainText("Pilot decision.");
 await expect(recovered).not.toContainText("Pilot evidence.");
 const recoveryTable=recovered.getByRole("table");
 await expect(recoveryTable.getByRole("columnheader",{name:"Follow-up",exact:true})).toBeVisible();
 await expect(recoveryTable.getByRole("cell",{name:"Verify the handoff",exact:true})).toBeVisible();
 await expect(recovered.locator('[contenteditable="true"],button,form,img[src]')).toHaveCount(0);
 expect(await page.evaluate(()=>window.breditorNetworkDemo.peers.a.session.core.checkpointJson())).toBe(checkpoint);

 await restore.setInputFiles({name:"noncanonical.json",mimeType:"application/json",buffer:Buffer.from(checkpoint+"\n","utf8")});
 await expect(page.locator("#pilot-verification")).toContainText("could not be recovered");
 await expect(recovered).toBeHidden();
 await restore.setInputFiles({name:"invalid.json",mimeType:"application/json",buffer:Buffer.from([0xff,0x00])});
 await expect(page.locator("#pilot-verification")).toContainText("could not be recovered");
 await expect(recovered).toBeHidden();

 await page.unroute(externalHttp,blockRecoveryRequest);
 expect(recoveryRequests).toEqual([]);
 await page.getByRole("button",{name:"Reconnect",exact:true}).click();
 await ready(page);
 await expect(bob.locator('#b [data-rich-text="pilot-notes"]')).toHaveText("Pilot decision. Add the decisions and results that the next reviewer needs.");
 await expect(page.locator('#a [data-rich-text="pilot-item"]')).toHaveText("Pilot evidence. Verify the handoff");
 const reportDownload=page.waitForEvent("download");
 await page.getByRole("button",{name:"Download session report"}).click();
 const reportFile=await reportDownload;
 expect(reportFile.suggestedFilename()).toBe("breditor-pilot-session-alice.json");
 const reportText=readFileSync(await reportFile.path(),"utf8");
 expect(reportText).not.toContain(bootstrap.tokens.alice);
 expect(reportText).not.toContain(bootstrap.tokens.bob);
 expect(reportText).not.toContain(createHash("sha256").update(bootstrap.tokens.alice).digest("hex"));
 expect(reportText).not.toContain("Pilot decision.");
 expect(reportText).not.toContain(bootstrap.endpoint);
 const report=JSON.parse(reportText);
 expect(report).toEqual({format:"breditor/first-party-pilot-session-report",formatVersion:1,participant:"alice",
  openedAt:expect.any(String),collectedAt:expect.any(String),browser:expect.any(String),
  counts:{opens:2,disconnects:1,reconnectRequests:1,savedReloads:1,checkpointDownloads:2,verifiedRecoveries:1,retiredJournals:0},
  downloadedSha256:expectedHash,recoveredSha256:expectedHash});
 expect(Date.parse(report.collectedAt)).toBeGreaterThanOrEqual(Date.parse(report.openedAt));

 const priorRelay=relay;
 try{
  await page.evaluate(()=>window.breditorNetworkDemo.close());
  await page.unroute("**/pilot-bootstrap.json");
  await provisionDemo(page,pilotRoot());
  expect(bootstrap.endpoint).not.toBe(pilotConfig.endpoint);
  await routePilot(page);
  await page.goto("/pilot");
  await open(page,"alice");
  await ready(page);
  const resetDownload=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download session report"}).click();
  const resetFile=await resetDownload;
  expect(JSON.parse(readFileSync(await resetFile.path(),"utf8"))).toMatchObject({participant:"alice",
   counts:{opens:1,disconnects:0,reconnectRequests:0,savedReloads:0,checkpointDownloads:0,verifiedRecoveries:0,retiredJournals:0},
   downloadedSha256:null,recoveredSha256:null});
 }finally{await priorRelay.dispose();}
});

test("a distinct pilot opens online after a different pilot was paused in the same tab",async({page})=>{
 await provisionDemo(page,pilotRoot());
 const first=relay,firstBootstrap=bootstrap;
 const open=async()=>{
  await routePilot(page);
  await page.goto("/pilot");
  await page.getByLabel("Participant code").fill(bootstrap.tokens.alice);
  await page.getByRole("button",{name:"Open editor"}).click();
  await expect(page.getByRole("region",{name:"Shared document"})).toBeVisible();
 };
 try{
  await open();
  await ready(page);
  await page.getByRole("button",{name:"Go offline",exact:true}).click();
  await expect(page.locator("#state-a")).toContainText("offline");
  await page.evaluate(()=>window.breditorNetworkDemo.close());
  await page.unroute("**/pilot-bootstrap.json");
  await provisionDemo(page,pilotRoot());
  expect(relay.url).not.toBe(first.url);
  const secondBootstrap=bootstrap;
  await open();
  await ready(page);
  await expect(page.getByRole("button",{name:"Go offline",exact:true})).toBeVisible();
  await page.evaluate(async()=>{
   // Two saved writers in different pilots predate the scoped pause record.
   for(const key of Object.keys(sessionStorage))if(key.startsWith("breditor-pilot-paused-v2:"))sessionStorage.removeItem(key);
   sessionStorage.setItem("breditor-pilot-paused-alice","1");
   await window.breditorNetworkDemo.close();
  });
  await page.unroute("**/pilot-bootstrap.json");
  bootstrap=firstBootstrap;
  await open();
  await expect(page.getByRole("button",{name:"Reconnect",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>sessionStorage.getItem("breditor-pilot-paused-alice"))).toBeNull();
  await page.evaluate(()=>window.breditorNetworkDemo.close());
  await page.unroute("**/pilot-bootstrap.json");
  bootstrap=secondBootstrap;
  await open();
  await ready(page);
  await expect(page.getByRole("button",{name:"Go offline",exact:true})).toBeVisible();
 }finally{await first.dispose();}
});

test("simultaneous pilot sign-in in the same browser profile reuses one writer",async({page})=>{
 await provisionDemo(page,pilotRoot());
 const twin=await page.context().newPage(),tabs=[page,twin];
 let registrations=0;
 for(const tab of tabs){
  tab.on("websocket",socket=>socket.on("framesent",({payload})=>{
   if(JSON.parse(payload.toString()).request?.kind==="register")registrations++;
  }));
 }
 const button=tab=>tab.getByRole("button",{name:"Open editor"});
 const documentRegion=tab=>tab.getByRole("region",{name:"Shared document"});
 await Promise.all(tabs.map(async tab=>{
  await routePilot(tab);
  await tab.goto("/pilot");
  await tab.getByLabel("Participant code").fill(bootstrap.tokens.alice);
 }));
 await Promise.all(tabs.map(tab=>button(tab).click()));
 await expect.poll(async()=>{
  const statuses=await Promise.all(tabs.map(tab=>tab.locator("#network-state").textContent()));
  return statuses.map(state=>state.includes("could not open")?"refused":state).sort();
 }).toEqual(["Editors ready","refused"]);
 const winner=await documentRegion(page).isVisible()?page:twin;
 const retry=winner===page?twin:page;
 await ready(winner);
 await expect(documentRegion(retry)).toBeHidden();
 expect(registrations).toBe(1);

 const snapshot=tab=>tab.evaluate(()=>{
  const {identity,session}=window.breditorNetworkDemo.peers.a;
  return {writer:identity.writer,document:session.core.documentJson(),undo:session.core.view().undoDepth};
 });
 await winner.evaluate(async()=>{
  const {session}=window.breditorNetworkDemo.peers.a;
  session.core.dispatch({commands:[{kind:"insert_text",data:{block:"pilot-notes",offset:0,text:"One writer. "}}]});
  await session.flush();
 });
 const saved=await snapshot(winner);
 expect(saved.undo).toBe(1);
 await winner.evaluate(()=>window.breditorNetworkDemo.close());
 await retry.getByLabel("Participant code").fill(bootstrap.tokens.alice);
 await button(retry).click();
 await ready(retry);
 expect(await snapshot(retry)).toEqual(saved);
 expect(registrations).toBe(1);
});

const retirePilotJournal=page=>page.evaluate(async()=>{
 const databases=(await indexedDB.databases()).filter(entry=>entry.name?.startsWith("breditor-pilot-journals-v12-"));
 if(databases.length!==1)throw Error("Expected one scoped pilot journal");
 return new Promise((resolve,reject)=>{
  const upgrade=indexedDB.open(databases[0].name,2);
  upgrade.onsuccess=()=>{upgrade.result.close();resolve();};
  upgrade.onerror=()=>reject(upgrade.error);
 });
});

test("a journal retired during pilot sign-in offers the exact saved checkpoint",async({page})=>{
 await provisionDemo(page,pilotRoot());
 await routePilot(page);
 await page.goto("/pilot");
 const signIn=async()=>{
  await page.getByLabel("Participant code").fill(bootstrap.tokens.alice);
  await page.getByRole("button",{name:"Open editor"}).click();
 };
 await signIn();
 await ready(page);
 await page.evaluate(async()=>{
  const {session,sync}=window.breditorNetworkDemo.peers.a;
  session.core.dispatch({commands:[{kind:"insert_text",data:{block:"pilot-notes",offset:0,text:"Saved before sign-in. "}}]});
  await session.flush();
  await sync.flush();
 });
 await page.addInitScript(endpoint=>{
  const send=WebSocket.prototype.send;
  window.blockedPilotClocks=0;
  WebSocket.prototype.send=function(message){
   if(this.url===endpoint&&typeof message==="string"&&JSON.parse(message).request?.kind==="clock"){
    window.blockedPilotClocks++;return;
   }
   return send.call(this,message);
  };
 },bootstrap.endpoint);
 await page.getByRole("button",{name:"Save and reload"}).click();
 await expect(page.getByRole("button",{name:"Open editor"})).toBeEnabled();
 await signIn();
 await expect.poll(()=>page.evaluate(()=>window.blockedPilotClocks)).toBe(1);
 const region=page.getByRole("region",{name:"Shared document"});
 await expect(region).toBeHidden();
 const checkpoint=await page.evaluate(()=>window.breditorNetworkDemo.peers.a.session.core.checkpointJson());
 expect(checkpoint).toContain("Saved before sign-in.");
 await retirePilotJournal(page);

 await expect(page.locator("#network-state")).toContainText("Local storage changed. Use Download checkpoint before leaving.");
 await expect(region).toBeVisible();
 const backup=page.getByRole("button",{name:"Download checkpoint"});
 await expect(backup).toBeFocused();
 await expect(page.locator("#a")).toHaveJSProperty("inert",true);
 for(const control of ["connect","upload","files"])await expect(page.locator(`#${control}-a`)).toBeDisabled();
 expect(await page.evaluate(()=>window.blockedPilotClocks)).toBe(1);
 const download=page.waitForEvent("download");
 await backup.press("Enter");
 expect(readFileSync(await (await download).path(),"utf8")).toBe(checkpoint);
 await expect(page.getByLabel("Downloaded checkpoint digest")).toContainText(createHash("sha256").update(checkpoint).digest("hex"));
});

test("a failed pilot save keeps the retired workspace available for exact backup",async({page})=>{
 await provisionDemo(page,pilotRoot());
 await routePilot(page);
 await page.goto("/pilot");
 await page.getByLabel("Participant code").fill(bootstrap.tokens.alice);
 await page.getByRole("button",{name:"Open editor"}).click();
 await ready(page);
 await page.getByRole("button",{name:"Go offline",exact:true}).click();
 const checkpoint=await page.evaluate(async()=>{
  const {session,sync}=window.breditorNetworkDemo.peers.a;
  await sync.waitForDisconnected();
  session.core.dispatch({commands:[{kind:"insert_text",data:{block:"pilot-notes",offset:0,text:"Keep this backup. "}}]});
  await session.flush();
  return session.core.checkpointJson();
 });
 const raster=JSON.parse(readFileSync(new URL("../../target/relay-raster-fixtures.json",import.meta.url),"utf8"))[0];
 const failedAsset=await page.evaluate(async({bytes,mime})=>{
  const {cache}=window.breditorNetworkDemo.peers.a;
  const {asset}=await cache.ingest(new Blob([new Uint8Array(bytes)],{type:mime}));
  await cache.flush(async()=>{throw Error("Upload fixture refused");});
  const list=cache.list.bind(cache),retry=cache.retry.bind(cache);
  let holdNextList=false,started,release,settled;
  const reached=new Promise(resolve=>{started=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  const done=new Promise(resolve=>{settled=resolve;});
  const upload={reached,release,done,retries:0};
  document.querySelector("#upload-a").addEventListener("click",()=>{holdNextList=true;},{capture:true,once:true});
  cache.list=async()=>{
   if(!holdNextList)return list();
   holdNextList=false;
   const records=await list();
   started();
   await held;
   settled();
   return records;
  };
  cache.retry=value=>{upload.retries++;return retry(value);};
  window.pendingPilotUpload=upload;
  return cache.get(asset);
 },raster);
 expect(failedAsset.status).toBe("failed");
 await page.locator("#upload-a").click();
 await page.evaluate(()=>window.pendingPilotUpload.reached);
 await page.evaluate(()=>{
  const {sync}=window.breditorNetworkDemo.peers.a,connect=sync.connect.bind(sync);
  let started,release,settled;
  const reached=new Promise(resolve=>{started=resolve;});
  const held=new Promise(resolve=>{release=resolve;});
  const done=new Promise(resolve=>{settled=resolve;});
  sync.connect=async()=>{started();await held;try{await connect();}finally{settled();}};
  window.pendingPilotReconnect={reached,release,done};
 });
 await page.getByRole("button",{name:"Reconnect",exact:true}).click();
 await page.evaluate(()=>window.pendingPilotReconnect.reached);
 await retirePilotJournal(page);
 const backup=page.getByRole("button",{name:"Download checkpoint"});
 await expect(page.locator("#network-state")).toContainText("Local storage changed. Use Download checkpoint before leaving.");
 await expect(backup).toBeFocused();
 await expect(page.locator("#a")).toHaveJSProperty("inert",true);
 await expect(page.locator("#connect-a")).toBeDisabled();
 await expect(page.locator("#upload-a")).toBeDisabled();
 await expect(page.locator("#files-a")).toBeDisabled();
 await page.getByRole("button",{name:"Save and reload"}).click();
 await expect(page.locator("#network-state")).toContainText("Local save did not finish");
 await page.evaluate(async()=>{
  const pending=[window.pendingPilotReconnect,window.pendingPilotUpload];
  for(const action of pending)action.release();
  await Promise.all(pending.map(action=>action.done));
  await new Promise(requestAnimationFrame);
 });
 await expect(page.locator("#network-state")).toContainText("Local save did not finish");
 expect(await page.evaluate(async asset=>({
  retries:window.pendingPilotUpload.retries,
  current:await window.breditorNetworkDemo.peers.a.cache.get(asset),
 }),failedAsset.asset)).toEqual({retries:0,current:failedAsset});
 await expect(page.getByRole("region",{name:"Shared document"})).toBeVisible();
 await expect(page.locator("#a")).toHaveJSProperty("inert",true);
 await expect(page.locator("#connect-a")).toBeDisabled();
 await expect(page.locator("#upload-a")).toBeDisabled();
 await expect(page.locator("#files-a")).toBeDisabled();
 await expect(backup).toBeFocused();
 const download=page.waitForEvent("download");
 await backup.press("Enter");
 expect(readFileSync(await (await download).path(),"utf8")).toBe(checkpoint);
 await expect(page.getByLabel("Downloaded checkpoint digest")).toContainText(createHash("sha256").update(checkpoint).digest("hex"));
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
 const downloadControl=page.getByRole("button",{name:"Download checkpoint",exact:true});
 for(let step=0;step<12&&!(await downloadControl.evaluate(control=>document.activeElement===control));step++)await page.keyboard.press(tab);
 await expect(downloadControl).toBeFocused();
 const download=page.waitForEvent("download");
 await page.keyboard.press("Enter");
 const downloaded=await download;
 const exactDownload=readFileSync(await downloaded.path(),"utf8");
 await expect(page.getByLabel("Downloaded checkpoint digest")).toContainText(createHash("sha256").update(exactDownload).digest("hex"));
 await expect(downloadControl).toBeFocused({timeout:1500});
 await page.keyboard.press(tab);
 await expect(page.locator("#pane-a").getByLabel("Image files")).toBeFocused();
 const backup=page.getByLabel("Document checkpoint");
 for(let step=0;step<40&&!(await backup.evaluate(input=>document.activeElement===input));step++)await page.keyboard.press(tab);
 await expect(backup).toBeFocused();
 const checkpoint=await page.evaluate(()=>window.breditorNetworkDemo.peers.a.session.core.checkpointJson());
 await backup.setInputFiles({name:"checkpoint.json",mimeType:"application/json",buffer:Buffer.from(checkpoint)});
 await expect(page.locator("#pilot-verification")).toContainText("Exact read-only replay verified");
 await expect(backup).toBeFocused();
 const recovered=page.getByRole("region",{name:"Recovered document",exact:true});
 await expect(recovered.getByRole("table")).toBeVisible();
 await page.keyboard.press(tab);
 await expect(recovered).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
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

test("pilot keeps journals and assets scoped and recovers only explicitly selected legacy references",async({page})=>{
 const [fixture,unrelated]=JSON.parse(readFileSync(new URL("../../target/relay-raster-fixtures.json",import.meta.url),"utf8"));
 await provisionDemo(page,pilotRoot());
 const relayA=relay,configA=pilotBootstrap(),tokenA=bootstrap.tokens.alice;
 const recovery=page.getByRole("button",{name:"Recover legacy images"});
 const signIn=async(config,token)=>{
  await page.unroute("**/pilot-bootstrap.json");await routePilot(page,config);await page.goto("/pilot");
  await page.getByLabel("Participant code").fill(token);await page.getByRole("button",{name:"Open editor"}).click();
 };
 const open=async(config,token)=>{
  await signIn(config,token);
  await expect(page.getByRole("region",{name:"Shared document"})).toBeVisible();
 };
 const queue=()=>page.evaluate(()=>window.breditorNetworkDemo.peers.a.cache.list());
 const saved=async()=>{
  await page.getByRole("button",{name:"Save and reload"}).click();
  await expect(page.getByRole("button",{name:"Open editor"})).toBeEnabled();
 };
 try{
  await open(configA,tokenA);await ready(page);
  await page.getByRole("button",{name:"Go offline",exact:true}).click();
  await expect(page.locator("#state-a")).toContainText("offline");
  await page.locator("#files-a").setInputFiles({name:"pilot-owned.png",mimeType:fixture.mime,buffer:Buffer.from(fixture.bytes)});
  await expect(page.locator("#state-a")).toContainText("images 0/1");
  const owned=await page.evaluate(async asset=>{
   const {cache,session,identity}=window.breditorNetworkDemo.peers.a,core=session.core;
   if(!core.documentJson().includes(asset)||!core.undo()||core.documentJson().includes(asset))throw Error("The raster must remain exclusively in native Redo history");
   const names=(await indexedDB.databases()).map(entry=>entry.name);
   return {checkpoint:core.checkpointJson(),metadata:await cache.list(),archive:Array.from(new Uint8Array(await (await cache.exportBackup()).arrayBuffer())),
    writer:identity.writer,room:identity.room,assets:names.find(name=>name?.startsWith("breditor-pilot-assets-v2-")),
    journal:names.find(name=>name?.startsWith("breditor-pilot-journals-v12-"))};
  },fixture.asset);
  expect(owned.metadata).toMatchObject([{asset:fixture.asset,status:"pending",attempts:0,storageRef:null}]);
  await saved();await open(configA,tokenA);
  expect(await queue()).toEqual(owned.metadata);
  expect(await page.evaluate(checkpoint=>window.breditorNetworkDemo.peers.a.session.core.checkpointJson()===checkpoint,owned.checkpoint)).toBe(true);
  await page.evaluate(()=>window.breditorNetworkDemo.close());

  await provisionDemo(page,pilotRoot());
  const configB=pilotBootstrap(),tokenB=bootstrap.tokens.alice;
  expect(configB.endpoint).not.toBe(configA.endpoint);
  await open(configB,tokenB);await ready(page);
  expect(await queue()).toEqual([]);
  expect(await page.evaluate(asset=>{
   const {identity,session}=window.breditorNetworkDemo.peers.a;
   return {writer:identity.writer,recovered:session.recovered,foreign:session.core.retainedAssetReferences().references.some(row=>row.asset===asset)};
  },fixture.asset)).toEqual({writer:owned.writer,recovered:false,foreign:false});
  expect(owned.assets&&owned.journal).toBeTruthy();
  const legacyBytes=await page.evaluate(async({archive,unrelated})=>{
   const {RichAssetStore}=await import("/rich.js");
   const legacy=await RichAssetStore.restoreBackup("breditor-pilot-assets-alice",new Blob([Uint8Array.from(archive)]),{uploadState:"preserve"});
   try{
    await legacy.ingest(new Blob([Uint8Array.from(unrelated.bytes)],{type:unrelated.mime}));
    await legacy.flush(async()=>"legacy-provider-receipt");
    return Array.from(new Uint8Array(await (await legacy.exportBackup()).arrayBuffer()));
   }finally{legacy.close();}
  },{archive:owned.archive,unrelated});
  await saved();await open(configB,tokenB);await ready(page);
  await expect(recovery).toBeHidden();
  await page.getByRole("button",{name:"Upload or retry pending images"}).click();
  expect(await queue()).toEqual([]);
  const alias=await page.evaluate(async({assets,journal,room,writer,endpoint,otherEndpoint})=>{
   const open=(name,upgrade)=>new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,1);request.onupgradeneeded=()=>upgrade?.(request.result);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
   });
   const transact=(db,name,mode,operation)=>new Promise((resolve,reject)=>{
    const tx=db.transaction(name,mode),request=operation(tx.objectStore(name));
    tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);
   });
   const original=await open(journal),rowKey=[room,writer];
   let row;
   try{row=await transact(original,"journals","readonly",store=>store.get(rowKey));}finally{original.close();}
   const legacy=await open("breditor-pilot-journals-v12",db=>db.createObjectStore("journals"));
   try{await transact(legacy,"journals","readwrite",store=>store.add(row,rowKey));}finally{legacy.close();}
   const db=await open("breditor-pilot-identities-v1"),alias=[otherEndpoint,"bob"];
   try{
    await new Promise((resolve,reject)=>{
     const tx=db.transaction("identities","readwrite"),store=tx.objectStore("identities"),key=[endpoint,"alice"],read=store.get(key);
     read.onsuccess=()=>{
      const value=read.result;delete value.scopedStorageVersion;
      store.put(value,key);
      store.add({...value,identity:{...value.identity,endpoint:otherEndpoint,principal:"bob"}},alias);
     };
     tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
    });
   }finally{db.close();}
   // Model the old installation: its exact writer has only the unscoped asset store.
   const deletion=indexedDB.deleteDatabase(assets);
   await new Promise((resolve,reject)=>{deletion.onsuccess=()=>resolve();deletion.onerror=()=>reject(deletion.error);deletion.onblocked=()=>reject(Error("Old scoped test handle remained open"));});
   return alias;
  },{assets:owned.assets,journal:owned.journal,room:owned.room,writer:owned.writer,endpoint:configA.endpoint,otherEndpoint:configB.endpoint});
  await page.evaluate(()=>window.breditorNetworkDemo.close());

  await page.addInitScript(({endpoint,alias})=>{
   const open=IDBFactory.prototype.open;
   window.pilotStorageAttempts={journals:0,assets:0};
   IDBFactory.prototype.open=function(name,...args){
    if(name.startsWith("breditor-pilot-journals-v12"))window.pilotStorageAttempts.journals++;
    if(name.startsWith("breditor-pilot-assets"))window.pilotStorageAttempts.assets++;
    if(name==="breditor-pilot-journals-v12"&&sessionStorage.getItem("pilot-test-late-legacy-alias")==="1"){
     sessionStorage.removeItem("pilot-test-late-legacy-alias");
     // This request precedes the app's post-open identity read and follows lease acquisition.
     window.latePilotAlias=new Promise((resolve,reject)=>{
      const request=open.call(this,"breditor-pilot-identities-v1",1);
      request.onsuccess=()=>{
       const db=request.result,tx=db.transaction("identities","readwrite"),store=tx.objectStore("identities"),read=store.get([endpoint,"alice"]);
       read.onsuccess=()=>store.add({...read.result,identity:{...read.result.identity,endpoint:alias[0],principal:alias[1]}},alias);
       tx.oncomplete=()=>{db.close();resolve(true);};tx.onabort=()=>{db.close();reject(tx.error);};
      };
      request.onerror=()=>reject(request.error);
     });
    }
    return open.call(this,name,...args);
   };
  },{endpoint:configA.endpoint,alias});
  const attempts=()=>page.evaluate(()=>window.pilotStorageAttempts);
  await signIn(configA,tokenA);
  await expect(page.locator("#network-state")).toContainText("pilot_journal_ambiguous");
  expect(await attempts()).toEqual({journals:0,assets:0});
  await expect(page.getByRole("region",{name:"Shared document"})).toBeHidden();
  const removeAlias=()=>page.evaluate(async alias=>{
   const open=indexedDB.open("breditor-pilot-identities-v1");
   const db=await new Promise((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
   try{await new Promise((resolve,reject)=>{
    const tx=db.transaction("identities","readwrite");tx.objectStore("identities").delete(alias);
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
   });}finally{db.close();}
  },alias);
  await removeAlias();
  await page.evaluate(()=>sessionStorage.setItem("pilot-test-late-legacy-alias","1"));
  await signIn(configA,tokenA);
  await expect(page.locator("#network-state")).toContainText("pilot_journal_ambiguous");
  expect(await page.evaluate(()=>window.latePilotAlias)).toBe(true);
  expect(await attempts()).toEqual({journals:1,assets:0});
  expect(await page.evaluate(async({room,writer})=>(await navigator.locks.query()).held.some(lock=>
   lock.name==="breditor:shared-writer:"+JSON.stringify([room,writer])),{room:owned.room,writer:owned.writer})).toBe(false);
  await expect(page.getByRole("region",{name:"Shared document"})).toBeHidden();
  await removeAlias();
  await open(configA,tokenA);
  await expect(recovery).toBeVisible();
  expect(await queue()).toEqual([]);
  await recovery.click();
  await expect(page.locator("#pilot-legacy-asset-status")).toContainText("Recovered 1 legacy image");
  const recovered=await page.evaluate(async asset=>{
   const {cache,session}=window.breditorNetworkDemo.peers.a;
   const {RichAssetStore}=await import("/rich.js"),legacy=await RichAssetStore.openRetained("breditor-pilot-assets-alice");
   try{
    return {checkpoint:session.core.checkpointJson(),raster:Array.from(new Uint8Array(await (await cache.blob(asset)).arrayBuffer())),
     archive:Array.from(new Uint8Array(await (await legacy.exportBackup()).arrayBuffer()))};
   }finally{legacy.close();}
  },fixture.asset);
  expect(recovered.checkpoint===owned.checkpoint).toBe(true);
  expect(recovered.raster).toEqual(fixture.bytes);
  expect(recovered.archive).toEqual(legacyBytes);
  expect(await queue()).toEqual(owned.metadata);
  await saved();await open(configA,tokenA);
  expect(await queue()).toEqual(owned.metadata);
  await page.getByRole("button",{name:"Reconnect",exact:true}).click();await ready(page);
  await page.getByRole("button",{name:"Upload or retry pending images"}).click();
  await expect(page.locator("#state-a")).toContainText("images 1/1");
  const receipt=await queue();
  expect(receipt).toMatchObject([{asset:fixture.asset,status:"uploaded",attempts:1,storageRef:expect.any(String)}]);
  expect(receipt[0].storageRef).not.toBe("legacy-provider-receipt");
  await saved();await open(configA,tokenA);await ready(page);
  expect(await queue()).toEqual(receipt);
  await page.evaluate(()=>window.breditorNetworkDemo.close());
  for(const version of [3,undefined]){
   await page.evaluate(async({endpoint,version})=>{
    const request=indexedDB.open("breditor-pilot-identities-v1");
    const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{await new Promise((resolve,reject)=>{
     const tx=db.transaction("identities","readwrite"),store=tx.objectStore("identities"),key=[endpoint,"alice"],read=store.get(key);
     read.onsuccess=()=>store.put({...read.result,scopedStorageVersion:version},key);
     tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);
    });}finally{db.close();}
   },{endpoint:configA.endpoint,version});
   await signIn(configA,tokenA);
   await expect(page.locator("#network-state")).toContainText("pilot_storage_version");
   expect(await attempts()).toEqual({journals:0,assets:0});
  }
 }finally{await relayA.dispose();}
});
