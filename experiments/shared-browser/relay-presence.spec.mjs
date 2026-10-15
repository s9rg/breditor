import {test,expect} from "@playwright/test";
import {createRelay} from "./relay-fixture.mjs";
let relay,otherContext;
async function tools(page,provision=true){await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");await page.addScriptTag({type:"module",url:"/relay-app-fixture.mjs"});await page.waitForFunction(()=>window.relayAppFixture);await page.evaluate(options=>window.relayAppFixture.configure(options),{url:relay.url,tokens:relay.tokens,provision});}
async function other(browser){otherContext=await browser.newContext();const p=await otherContext.newPage();await tools(p,false);await p.evaluate(()=>window.relayAppFixture.open("b",{principal:"bob",mount:"#b",presence:true}));return p;}
async function view(page,key){return page.evaluate(key=>window.relayAppFixture.peers[key].presence.view(),key);}
test.beforeEach(async({page})=>{await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");relay=await createRelay(await page.evaluate(()=>({configuration:window.sharedTools.vector.shared_writer.configuration,input:window.sharedTools.vector.shared_writer.input,origin:location.origin})));await tools(page);await page.evaluate(()=>window.relayAppFixture.open("a",{principal:"alice",mount:"#a",presence:true}));});
test.afterEach(async()=>{await otherContext?.close();otherContext=undefined;await relay?.dispose();relay=undefined;});

test("authenticated causal selections cross independent clients without changing local selection document or history",async({page,browser})=>{
 const peer=await other(browser);await expect.poll(async()=>(await view(page,"a")).length).toBe(1);
 await page.evaluate(()=>{const p=window.relayAppFixture.peers.a;p.mounted.select({kind:"node",block:"image-block"});p.beforePresence=p.core.checkpointJson();p.focus=document.activeElement;});
 await peer.evaluate(()=>{const p=window.relayAppFixture.peers.b,point={block:"p",offset:"1",affinity:"after"};p.mounted.select({kind:"text",anchor:point,focus:{...point,offset:"3"}});});
 await expect.poll(async()=>(await view(page,"a"))[0]?.resolution?.selection).toEqual({kind:"text",anchor:{block:"p",offset:"1",affinity:"after"},focus:{block:"p",offset:"3",affinity:"after"}});
 const result=await page.evaluate(()=>{const p=window.relayAppFixture.peers.a;return{unchanged:p.beforePresence===p.core.checkpointJson(),focus:p.focus===document.activeElement,peer:p.presence.view()[0],secret:p.identity.credential,errors:window.relayAppFixture.errors};});
 expect(result.unchanged).toBe(true);expect(result.focus).toBe(true);expect(result.peer.label).toBe("bob");expect(JSON.stringify(result.peer)).not.toContain(result.secret);expect(result.errors).toEqual([]);
 await peer.evaluate(()=>{const p=window.relayAppFixture.peers.b,cell={table:"t",row:"r",column:"c"};p.mounted.select({kind:"grid",anchor:cell,focus:cell});});
 await expect.poll(async()=>(await view(page,"a"))[0]?.resolution?.selection?.kind).toBe("grid");
 await peer.evaluate(()=>window.relayAppFixture.peers.b.mounted.select(null));
 await expect.poll(async()=>(await view(page,"a"))[0]?.resolution?.selection).toBeNull();
});

test("offline authored presence waits for causal catchup and then remaps through the received text",async({page,browser})=>{
 const peer=await other(browser);await expect.poll(async()=>(await view(page,"a")).length).toBe(1);
 await page.evaluate(()=>{const p=window.relayAppFixture.peers.a;window.holdPresence=p.core.holdRemotes();});
 await peer.evaluate(async()=>{const p=window.relayAppFixture.peers.b;p.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Remote "}}]});const point={block:"p",offset:"8",affinity:"after"};p.mounted.select({kind:"text",anchor:point,focus:point});await p.sync.flush();});
 await expect.poll(async()=>(await view(page,"a"))[0]?.resolution?.kind).toBe("pending");
 await page.evaluate(()=>window.holdPresence());
 await expect.poll(async()=>(await view(page,"a"))[0]?.resolution).toMatchObject({kind:"resolved",selection:{focus:{block:"p",offset:"8"}}});
});

test("disconnect reconnect server restart and journal reload replace public epochs and recover current selections",async({page,browser})=>{
 const peer=await other(browser);await peer.evaluate(()=>window.relayAppFixture.peers.b.mounted.select({kind:"node",block:"image-block"}));
 await expect.poll(async()=>(await view(page,"a"))[0]?.resolution?.selection?.kind).toBe("node");const first=(await view(page,"a"))[0].session;
 await peer.evaluate(()=>window.relayAppFixture.peers.b.sync.disconnect());await expect.poll(async()=>(await view(page,"a")).length).toBe(0);
 await peer.evaluate(()=>window.relayAppFixture.peers.b.sync.connect());await expect.poll(async()=>(await view(page,"a"))[0]?.resolution?.selection?.kind).toBe("node");expect((await view(page,"a"))[0].session).not.toBe(first);
 await relay.offline();await expect.poll(async()=>(await view(page,"a")).length).toBe(0);expect(await relay.online()).toBe(relay.url);
 await expect.poll(async()=>(await view(page,"a"))[0]?.resolution?.selection?.kind).toBe("node");
 await peer.evaluate(()=>window.relayAppFixture.close("b"));await peer.reload();await tools(peer,false);await peer.evaluate(()=>window.relayAppFixture.open("b",{create:false,mount:"#b",presence:true}));
 await expect.poll(async()=>(await view(page,"a"))[0]?.resolution?.selection?.kind).toBe("node");expect(await peer.evaluate(()=>window.relayAppFixture.peers.b.session.recovered)).toBe(true);
});

test("permission revocation clears peer membership and cannot publish an old leased selection",async({page,browser})=>{
 const peer=await other(browser);await expect.poll(async()=>(await view(page,"a")).length).toBe(1);
 await page.evaluate(()=>window.relayAppFixture.owner.request({kind:"grant",principal:"bob",role:null}));
 await expect.poll(async()=>(await view(page,"a")).length).toBe(0);await expect.poll(()=>peer.evaluate(()=>window.relayAppFixture.peers.b.sync.state().status)).toBe("denied");
 const retained=await peer.evaluate(()=>{const p=window.relayAppFixture.peers.b;p.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Still local "}}]});return{document:p.core.documentJson(),peers:p.presence.view()};});expect(retained.document).toContain("Still local ");expect(retained.peers).toEqual([]);
});

test("peer overlays paint text node and grid selections and follow layout without replacing native selection",async({page,browser})=>{
 const peer=await other(browser);
 await page.evaluate(()=>{const p=window.relayAppFixture.peers.a,point={block:"p",offset:"1",affinity:"after"};p.mounted.select({kind:"text",anchor:point,focus:point});p.overlayBefore=p.core.checkpointJson();p.nativeAnchor=document.getSelection().anchorNode;});
 await peer.evaluate(()=>{const p=window.relayAppFixture.peers.b,a={block:"p",offset:"3",affinity:"after"},f={...a,offset:"1"};p.mounted.select({kind:"text",anchor:a,focus:f});});
 const layer=page.locator("[data-shared-presence-overlay]");await expect(layer.locator('[data-peer-kind="text"]').first()).toBeVisible();await expect(layer.locator("[data-peer-label]")).toHaveText("bob");
 await peer.evaluate(()=>window.relayAppFixture.peers.b.mounted.select({kind:"node",block:"image-block"}));
 await page.locator('#a [data-rich-block="image-block"]').scrollIntoViewIfNeeded();await expect(layer.locator('[data-peer-kind="node"]')).toBeVisible();
 const geometry=await page.evaluate(()=>{const p=window.relayAppFixture.peers.a,marker=p.overlay.element.querySelector('[data-peer-kind="node"]'),target=p.mounted.surface.querySelector('[data-rich-block="image-block"]'),r=marker.getBoundingClientRect(),t=target.getBoundingClientRect(),b=p.mounted.surface.getBoundingClientRect();return{left:r.left,expected:Math.max(0,b.left,t.left),width:r.width,expectedWidth:Math.min(innerWidth,b.right,t.right)-Math.max(0,b.left,t.left)};});expect(Math.abs(geometry.left-geometry.expected)).toBeLessThan(1);expect(Math.abs(geometry.width-geometry.expectedWidth)).toBeLessThan(1);
 await peer.evaluate(()=>{const p=window.relayAppFixture.peers.b,cell={table:"t",row:"r",column:"c"};p.mounted.select({kind:"grid",anchor:cell,focus:cell});});
 await page.locator("#a td").scrollIntoViewIfNeeded();await expect(layer.locator('[data-peer-kind="grid"]')).toBeVisible();
 await page.setViewportSize({width:1050,height:700});await expect(layer.locator('[data-peer-kind="grid"]')).toBeVisible();
 const result=await page.evaluate(()=>{const p=window.relayAppFixture.peers.a,out={unchanged:p.overlayBefore===p.core.checkpointJson(),sameNative:p.nativeAnchor===document.getSelection().anchorNode,pointer:p.overlay.element.style.pointerEvents};p.overlay.dispose();return{...out,removed:!p.overlay.element.isConnected,usable:p.core.view().selection.kind};});
 expect(result).toEqual({unchanged:true,sameNative:true,pointer:"none",removed:true,usable:"text"});
});
