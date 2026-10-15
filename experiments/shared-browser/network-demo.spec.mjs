import {test,expect} from "@playwright/test";
import {createRelay} from "./relay-fixture.mjs";
import {readFileSync} from "node:fs";
let relay,bootstrap,otherContext;
async function route(page){await page.route("**/relay-bootstrap.json",r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(bootstrap)}));}
async function ready(page){await expect(page.locator("#network-state")).toHaveText("Editors ready");await expect.poll(()=>page.evaluate(()=>Object.values(window.breditorNetworkDemo.peers).every(p=>p.sync.state().status==="ready"))).toBe(true);}
async function same(page){await expect.poll(()=>page.evaluate(()=>{const{a,b}=window.breditorNetworkDemo.peers;return a.session.core.documentJson()===b.session.core.documentJson();})).toBe(true);}
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 const input=await page.evaluate(()=>({configuration:JSON.stringify(window.sharedTools.vector.shared_profile.configuration),input:window.sharedTools.vector.shared_profile.input,origin:location.origin}));relay=await createRelay(input);
 await page.addScriptTag({type:"module",url:"/socket-fixture.mjs"});await page.waitForFunction(()=>window.relaySocketFixture);
 await page.evaluate(async({url,tokens})=>{const owner=await window.relaySocketFixture.connect(url,"owner",tokens.owner);for(const principal of["alice","bob"]){const r=await owner.request({kind:"grant",principal,role:"editor"});if(r.kind!=="granted")throw Error("Demo account provisioning failed");}await owner.close();},{url:relay.url,tokens:relay.tokens});
 bootstrap={format:"breditor/network-demo",formatVersion:1,endpoint:relay.url,configuration:JSON.parse(input.configuration),tokens:{alice:relay.tokens.alice,bob:relay.tokens.bob}};await route(page);
});
test.afterEach(async()=>{await otherContext?.close();otherContext=undefined;await relay?.dispose();relay=undefined;});

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
