import {test,expect} from "@playwright/test";
import {createRelay} from "./relay-fixture.mjs";
let relay,otherContext;
async function tools(page,provision=true){
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 await page.addScriptTag({type:"module",url:"/relay-app-fixture.mjs"});await page.waitForFunction(()=>window.relayAppFixture);
 await page.evaluate(options=>window.relayAppFixture.configure(options),{url:relay.url,tokens:relay.tokens,provision});
}
async function other(browser){otherContext=await browser.newContext();const page=await otherContext.newPage();await tools(page,false);return page;}
async function insert(page,mime="image/png"){
 return page.evaluate(async mime=>{const t=window.sharedTools,p=window.relayAppFixture.peers.a,fixture=(await(await fetch("/raster-fixtures.json")).json()).find(f=>f.mime===mime);if(!fixture)throw Error("Requested native raster fixture unavailable");const blob=new Blob([new Uint8Array(fixture.bytes)],{type:mime});await t.insertSharedImageFiles(p.core,p.cache,[new File([blob],"shared.png",{type:mime})],{parent:null,before:null});await p.session.flush();await p.sync.flush();const root=JSON.parse(p.core.documentJson()).root,node=root.children.at(-1),info=(await p.cache.list()).find(info=>info.asset===fixture.asset);return{block:node.properties["breditor/block-id"],asset:info.asset,info};},mime);
}
test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");
 relay=await createRelay(await page.evaluate(()=>({configuration:window.sharedTools.vector.shared_writer.configuration,input:window.sharedTools.vector.shared_writer.input,origin:location.origin})));
 await tools(page);await page.evaluate(()=>window.relayAppFixture.open("a",{principal:"alice",mount:"#a",assets:true}));
});
test.afterEach(async()=>{await otherContext?.close();otherContext=undefined;await relay?.dispose();relay=undefined;});

test("late uploaded bytes cross independent browser caches without an edit, caret replacement or echo upload",async({page,browser})=>{
 const peer=await other(browser);await peer.evaluate(()=>window.relayAppFixture.open("b",{principal:"bob",mount:"#b",assets:true}));
 const value=await insert(page);
 const target=peer.locator(`[data-rich-block="${value.block}"] img`);
 await expect(target).toHaveCount(1);await expect(target).not.toHaveAttribute("src");
 expect(await peer.evaluate(()=>window.relayAppFixture.peers.b.cache.list())).toEqual([]);
 await peer.evaluate(()=>{const p=window.relayAppFixture.peers.b,point={block:"p",offset:"1",affinity:"after"};p.mounted.select({kind:"text",anchor:point,focus:point});p.beforeAsset=p.core.checkpointJson();p.textNode=document.getSelection().anchorNode;p.focus=document.activeElement;});
 let peerPuts=0;peer.on("request",request=>{if(request.method()==="PUT")peerPuts++;});
 await page.evaluate(()=>window.relayAppFixture.peers.a.assets.flush());
 await expect.poll(()=>target.evaluate(img=>img.complete&&img.naturalWidth===2&&img.naturalHeight===3)).toBe(true);
 const proof=await peer.evaluate(async()=>{const p=window.relayAppFixture.peers.b,img=[...p.mounted.surface.querySelectorAll("img")].at(-1),canvas=document.createElement("canvas");canvas.width=2;canvas.height=3;const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0);await p.assets.flush();return{unchanged:p.beforeAsset===p.core.checkpointJson(),sameNode:p.textNode===document.getSelection().anchorNode,sameFocus:p.focus===document.activeElement,pixel:[...ctx.getImageData(0,0,1,1).data],cache:await p.cache.list(),hints:p.assetHints,errors:window.relayAppFixture.errors};});
 expect(proof).toMatchObject({unchanged:true,sameNode:true,sameFocus:true,pixel:[17,119,221,255],errors:[]});expect(proof.hints).toBeGreaterThan(1);expect(proof.cache).toHaveLength(1);expect(proof.cache[0]).toMatchObject({asset:value.asset,status:"uploaded",attempts:0});expect(peerPuts).toBe(0);
 const sender=await page.evaluate(()=>window.relayAppFixture.peers.a.cache.list());expect(sender[0]).toMatchObject({status:"uploaded",attempts:1});
});

test("PNG JPEG and WebP original bytes survive relay restart and load into a new context",async({page,browser})=>{
 const values=[];for(const mime of["image/png","image/jpeg","image/webp"]){values.push(await insert(page,mime));await page.evaluate(()=>window.relayAppFixture.peers.a.assets.flush());}
 const exact=await page.evaluate(async()=>{const p=window.relayAppFixture.peers.a;return Promise.all((await p.cache.list()).map(async info=>({asset:info.asset,bytes:[...new Uint8Array(await(await p.cache.blob(info.asset)).arrayBuffer())]})));});
 await relay.offline();expect(await relay.online()).toBe(relay.url);
 const peer=await other(browser);await peer.evaluate(()=>window.relayAppFixture.open("b",{principal:"bob",mount:"#b",assets:true}));
 for(const value of values)await expect.poll(()=>peer.locator(`[data-rich-block="${value.block}"] img`).evaluate(img=>img.complete&&img.naturalWidth===2&&img.naturalHeight===3)).toBe(true);
 const fetched=await peer.evaluate(async()=>{const p=window.relayAppFixture.peers.b;return Promise.all((await p.cache.list()).map(async info=>({asset:info.asset,bytes:[...new Uint8Array(await(await p.cache.blob(info.asset)).arrayBuffer())]})));});
 expect(fetched.sort((a,b)=>a.asset.localeCompare(b.asset))).toEqual(exact.sort((a,b)=>a.asset.localeCompare(b.asset)));
});

test("offline local upload queue survives page reload and an exact retry does not duplicate storage",async({page,browser})=>{
 const value=await insert(page);await page.evaluate(()=>window.relayAppFixture.close("a"));
 await page.reload();await expect(page.locator("#status")).toHaveText("Ready");await tools(page,false);await page.evaluate(()=>window.relayAppFixture.open("a",{create:false,mount:"#a",assets:true}));
 const pending=await page.evaluate(()=>window.relayAppFixture.peers.a.cache.list());expect(pending[0]).toMatchObject({asset:value.asset,status:"pending",attempts:0});
 const retried=await page.evaluate(async()=>{const p=window.relayAppFixture.peers.a;await p.assets.flush();const info=await p.cache.get((await p.cache.list())[0].asset),blob=await p.cache.blob(info.asset),a=await p.assets.uploader(info,blob,new AbortController().signal),b=await p.assets.uploader(info,blob,new AbortController().signal);return{a,b,info,recovered:p.session.recovered};});
 expect(retried.recovered).toBe(true);expect(retried.a).toBe(retried.b);expect(retried.info.status).toBe("uploaded");
 const peer=await other(browser);await peer.evaluate(()=>window.relayAppFixture.open("b",{principal:"bob",mount:"#b",assets:true}));
 await expect.poll(()=>peer.locator(`[data-rich-block="${value.block}"] img`).evaluate(img=>img.naturalWidth)).toBe(2);
});

test("asset HTTP roles origins and immutable digest are enforced independently of writer payloads",async({page})=>{
 const value=await insert(page);await page.evaluate(()=>window.relayAppFixture.peers.a.assets.flush());
 const result=await page.evaluate(async({asset,url,tokens})=>{const http=url.replace(/^ws:/,"http:").replace(/\/ws$/,"/assets/"),p=window.relayAppFixture.peers.a,blob=await p.cache.blob(asset),request=(principal,method="GET",key=asset)=>fetch(http+encodeURIComponent(key),{method,headers:{"Authorization":`Bearer ${tokens[principal]}`,"X-Breditor-Principal":principal,...(method==="PUT"?{"Content-Type":"image/png"}:{})},...(method==="PUT"?{body:blob}:{}),credentials:"omit"});const reader=await request("reader"),forbidden=await request("ungranted"),put=await request("reader","PUT"),wrong=await request("alice","PUT","sha256:"+"0".repeat(64));await window.relayAppFixture.owner.request({kind:"grant",principal:"reader",role:null});const revoked=await request("reader");return{reader:reader.status,forbidden:forbidden.status,put:put.status,wrong:wrong.status,revoked:revoked.status};},{asset:value.asset,url:relay.url,tokens:relay.tokens});
 expect(result).toEqual({reader:200,forbidden:403,put:403,wrong:400,revoked:403});
 const http=relay.url.replace(/^ws:/,"http:").replace(/\/ws$/,"/assets/")+encodeURIComponent(value.asset);
 const denied=await page.request.get(http,{headers:{Origin:"http://wrong.invalid",Authorization:`Bearer ${relay.tokens.owner}`,"X-Breditor-Principal":"owner"}});expect(denied.status()).toBe(403);
});

test("late upload completion cannot recreate a deleted image and undo still resolves retained bytes",async({page,browser})=>{
 const peer=await other(browser);await peer.evaluate(()=>window.relayAppFixture.open("b",{principal:"bob",mount:"#b",assets:true}));
 const value=await insert(page);await expect(peer.locator(`[data-rich-block="${value.block}"]`)).toHaveCount(1);
 let release,entered;const held=new Promise(resolve=>entered=resolve);
 await page.route("**/assets/**",async route=>{if(route.request().method()!=="PUT"){await route.continue();return;}entered();await new Promise(resolve=>release=resolve);await route.continue();});
 await page.evaluate(()=>{window.assetFlush=window.relayAppFixture.peers.a.assets.flush();});await held;
 await page.evaluate(async block=>{const p=window.relayAppFixture.peers.a;p.core.dispatch({commands:[{kind:"delete_block",data:{block}}]});await p.sync.flush();},value.block);
 await expect(peer.locator(`[data-rich-block="${value.block}"]`)).toHaveCount(0);
 const deleted=await page.evaluate(()=>window.relayAppFixture.peers.a.core.checkpointJson());release();await page.evaluate(()=>window.assetFlush);
 expect(await page.evaluate(()=>window.relayAppFixture.peers.a.core.checkpointJson())).toBe(deleted);
 await expect(peer.locator(`[data-rich-block="${value.block}"]`)).toHaveCount(0);
 await page.evaluate(async()=>{const p=window.relayAppFixture.peers.a;p.core.undo();await p.sync.flush();});
 await expect.poll(()=>peer.locator(`[data-rich-block="${value.block}"] img`).evaluate(img=>img.naturalWidth)).toBe(2);
});

test("remote cache admission verifies bytes and preserves local cancellation epochs without echoing downloads",async({page})=>{
 const result=await page.evaluate(async()=>{const t=window.sharedTools,p=window.relayAppFixture.peers.a,canvas=document.createElement("canvas");canvas.width=2;canvas.height=3;const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png")),info=await p.cache.ingest(blob),cancelled=await p.cache.cancel(info.asset);let mismatch=false;try{await p.cache.cacheRemote("sha256:"+"0".repeat(64),blob,"remote");}catch{mismatch=true;}const existing=await p.cache.cacheRemote(info.asset,blob,"remote");const independent=await t.RichAssetStore.open("download-only"),received=await independent.cacheRemote(info.asset,blob,"remote");let uploads=0;await independent.flush(async()=>{uploads++;return"unexpected";});const out={mismatch,existing,cancelled,received,uploads,count:(await p.cache.list()).length};independent.close();return out;});
 expect(result.mismatch).toBe(true);expect(result.existing).toEqual(result.cancelled);expect(result.existing.status).toBe("cancelled");expect(result.received).toMatchObject({status:"uploaded",attempts:0,storageRef:"remote"});expect(result.uploads).toBe(0);expect(result.count).toBe(1);
});

test("a multi-image document drains bounded downloads without losing later bindings",async({page,browser})=>{
 const count=await page.evaluate(async()=>{const t=window.sharedTools,p=window.relayAppFixture.peers.a,fixtures=await(await fetch("/raster-fixtures.json")).json();await t.insertSharedImageFiles(p.core,p.cache,fixtures.map((f,i)=>new File([new Uint8Array(f.bytes)],`batch-${i}`,{type:f.mime})),{parent:null,before:null});await p.sync.flush();await p.assets.flush();return fixtures.length;});
 expect(count).toBeGreaterThan(4);
 const peer=await other(browser);await peer.evaluate(()=>window.relayAppFixture.open("b",{principal:"bob",mount:"#b",assets:true}));
 await expect.poll(()=>peer.evaluate(()=>[...document.querySelectorAll("#b img")].filter(img=>img.naturalWidth===2&&img.naturalHeight===3).length)).toBe(count);
 expect(await peer.evaluate(async()=>{const p=window.relayAppFixture.peers.b;return(await p.cache.list()).every(info=>info.status==="uploaded"&&info.attempts===0);})).toBe(true);
});
