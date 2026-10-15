import {test,expect} from "@playwright/test";
import {createRelay} from "./relay-fixture.mjs";
let relay;
async function pageTools(page,provision=true){await page.addScriptTag({type:"module",url:"/relay-app-fixture.mjs"});await page.waitForFunction(()=>window.relayAppFixture);await page.evaluate(options=>window.relayAppFixture.configure(options),{url:relay.url,tokens:relay.tokens,provision});}
test.beforeEach(async({page})=>{await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");relay=await createRelay(await page.evaluate(()=>({configuration:window.sharedTools.vector.shared_writer.configuration,input:window.sharedTools.vector.shared_writer.input,origin:location.origin})));await pageTools(page);});
test.afterEach(async()=>{await relay?.dispose();relay=undefined;});

test("packaged sync persists credentials separately and automatically recovers offline rich editing through server and page restart",async({page})=>{
 await page.evaluate(async()=>{const app=window.relayAppFixture;await app.open("a",{principal:"alice",mount:"#a"});await app.open("b",{principal:"bob",mount:"#b"});for(const p of Object.values(app.peers))p.sync.disconnect();const {a,b}=app.peers;a.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Packaged 🙂 "}},{kind:"resize_column",data:{block:"table-block",column:"c",width:360}}]});b.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Offline caption "}},{kind:"set_image_alt",data:{block:"image-block",text:"Packaged shared image",decorative:false}}]});await a.session.flush();await b.session.flush();});
 const offline=await page.evaluate(()=>{const {a,b}=window.relayAppFixture.peers;return{states:[a.sync.state(),b.sync.state()],saved:[a.session.state().status,b.session.state().status],secretInJournal:[a,b].some(p=>p.core.checkpointJson().includes(p.identity.credential))};});
 expect(offline.saved).toEqual(["saved","saved"]);expect(offline.states.every(s=>s.status==="offline"&&s.pending&&s.serverThrough==="0")).toBe(true);expect(offline.secretInJournal).toBe(false);
 await page.evaluate(async()=>{const {a,b}=window.relayAppFixture.peers;await Promise.all([a.sync.connect(),b.sync.connect()]);await Promise.all([a.sync.flush(),b.sync.flush()]);});
 await expect.poll(()=>page.evaluate(()=>{const {a,b}=window.relayAppFixture.peers;return a.core.documentJson()===b.core.documentJson();})).toBe(true);
 await relay.offline();await expect.poll(()=>page.evaluate(()=>Object.values(window.relayAppFixture.peers).every(p=>p.sync.state().status==="offline"||p.sync.state().status==="connecting"))).toBe(true);
 await page.evaluate(async()=>{const {a,b}=window.relayAppFixture.peers;a.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"After restart "}}]});b.core.dispatch({commands:[{kind:"resize_image",data:{block:"image-block",size:[320,180]}}]});await Promise.all([a.session.flush(),b.session.flush()]);});
 const address=await relay.online();expect(address).toBe(relay.url);
 await expect.poll(()=>page.evaluate(()=>Object.values(window.relayAppFixture.peers).every(p=>p.sync.state().status==="ready"))).toBe(true);
 const before=await page.evaluate(async()=>{const app=window.relayAppFixture,{a,b}=app.peers;await Promise.all([a.sync.flush(),b.sync.flush()]);const result={document:a.core.documentJson(),same:a.core.documentJson()===b.core.documentJson(),history:[a.core.view().undoDepth,b.core.view().undoDepth],errors:app.errors.filter(e=>!["connection_lost","connection_timeout"].includes(e))};await app.close("a");await app.close("b");return result;});
 expect(before.same).toBe(true);expect(before.history).toEqual([2,2]);expect(before.errors).toEqual([]);
 await page.reload();await expect(page.locator("#status")).toHaveText("Ready");await pageTools(page,false);
 const recovered=await page.evaluate(async()=>{const app=window.relayAppFixture,a=await app.open("a",{create:false,mount:"#a"}),b=await app.open("b",{create:false,mount:"#b"});const same=a.core.documentJson()===b.core.documentJson(),before=a.core.documentJson();a.core.undo();const undone=a.core.documentJson();await a.sync.flush();a.core.redo();await a.sync.flush();return{recovered:[a.session.recovered,b.session.recovered],same,before,undone,after:a.core.documentJson(),history:a.core.view().undoDepth,states:[a.sync.state(),b.sync.state()]};});
 expect(recovered.recovered).toEqual([true,true]);expect(recovered.same).toBe(true);expect(recovered.before).toBe(before.document);expect(recovered.after).toBe(before.document);expect(recovered.undone).not.toContain("After restart ");expect(recovered.undone).toContain("Offline caption ");expect(recovered.history).toBe(2);
 for(const pane of["#a","#b"]){await expect(page.locator(`${pane} img`)).toHaveAttribute("alt","Packaged shared image");}
});

test("disconnect cancels a held remote publication and reconnect later admits the latest server state without losing the local caret",async({page})=>{
 await page.evaluate(async()=>{const app=window.relayAppFixture,a=await app.open("a",{principal:"alice"}),b=await app.open("b",{principal:"bob"});a.core.select({kind:"node",block:"image-block"});app.held=a.core.holdRemotes();app.beforeHeld=a.core.checkpointJson();b.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Held remote "}}]});await b.sync.flush();});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.peers.a.core.pendingRemote().frames)).toBe(1);
 const cancelled=await page.evaluate(()=>{const app=window.relayAppFixture,a=app.peers.a;a.sync.disconnect();const result={frames:a.core.pendingRemote().frames,unchanged:a.core.checkpointJson()===app.beforeHeld,selection:a.core.view().selection};app.held();return result;});
 expect(cancelled.frames).toBe(0);expect(cancelled.unchanged).toBe(true);expect(cancelled.selection).toEqual({kind:"node",block:"image-block"});
 await page.evaluate(()=>window.relayAppFixture.peers.a.sync.connect());
 await expect.poll(()=>page.evaluate(()=>{const {a,b}=window.relayAppFixture.peers;return a.core.documentJson()===b.core.documentJson();})).toBe(true);
 expect(await page.evaluate(()=>window.relayAppFixture.peers.a.core.view().selection)).toEqual({kind:"node",block:"image-block"});
});

test("local durability failure blocks publication and retry sends only the saved author boundary",async({page})=>{
 await page.evaluate(async()=>{const app=window.relayAppFixture;app.failSave=true;app.persistCalls=0;const a=await app.open("a",{principal:"alice",persist:async peer=>{app.persistCalls++;if(app.failSave)throw Error("Private quota diagnostics must not become network state");await peer.session.flush();}});a.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Not yet sent "}}]});try{await a.sync.flush();}catch(e){app.failureCode=e.code;}});
 const failed=await page.evaluate(async()=>{const app=window.relayAppFixture,a=app.peers.a;return{failure:app.failureCode,state:a.sync.state(),clock:(await app.owner.request({kind:"clock",writer:a.identity.writer})).clock,document:a.core.documentJson()};});
 expect(failed.failure).toBe("local_save_failed");expect(failed.state.status).toBe("local-save-failed");expect(failed.state.serverThrough).toBe("0");expect(failed.clock.through).toBe("0");expect(failed.document).toContain("Not yet sent ");expect(JSON.stringify(failed.state)).not.toContain("Private quota");
 await page.evaluate(async()=>{const app=window.relayAppFixture;app.failSave=false;await app.peers.a.sync.connect();await app.peers.a.sync.flush();});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.peers.a.sync.state().status)).toBe("ready");
 const saved=await page.evaluate(()=>window.relayAppFixture.peers.a.sync.state());expect(saved.locallyDurableThrough).toBe(saved.localThrough);expect(saved.serverThrough).toBe(saved.localThrough);expect(saved.serverReceiptSequence).not.toBeNull();
});

test("the send pump never includes a newer group in an older local-save ticket",async({page})=>{
 await page.evaluate(async()=>{const app=window.relayAppFixture;app.gates=[];app.persistCount=0;const a=await app.open("a",{principal:"alice",persist:async p=>{await p.session.flush();app.persistCount++;await new Promise(resolve=>app.gates.push(resolve));}});a.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"First saved "}}]});app.firstThrough=a.core.writerClock(a.identity.writer).through;});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.persistCount)).toBe(1);
 await page.evaluate(()=>{const app=window.relayAppFixture,a=app.peers.a;a.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Second saved "}}]});app.gates[0]();});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.persistCount)).toBe(2);
 const middle=await page.evaluate(async()=>{const app=window.relayAppFixture,a=app.peers.a;return{first:app.firstThrough,local:a.core.writerClock(a.identity.writer).through,state:a.sync.state(),server:(await app.owner.request({kind:"clock",writer:a.identity.writer})).clock.through};});
 expect(middle.server).toBe(middle.first);expect(middle.state.locallyDurableThrough).toBe(middle.first);expect(middle.local).not.toBe(middle.first);
 await page.evaluate(async()=>{const app=window.relayAppFixture;app.gates[1]();await app.peers.a.sync.flush();});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.peers.a.sync.state().status)).toBe("ready");
});

test("permission loss fences auto reconnect but keeps an editable journal and explicit regrant can resume it",async({page})=>{
 await page.evaluate(async()=>{const app=window.relayAppFixture,a=await app.open("a",{principal:"alice"});a.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Accepted "}}]});await a.sync.flush();await app.owner.request({kind:"grant",principal:"alice",role:null});});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.peers.a.sync.state().status)).toBe("denied");
 const retained=await page.evaluate(async()=>{const app=window.relayAppFixture,a=app.peers.a;a.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Offline after revoke "}}]});await a.session.flush();let code;try{await a.sync.flush();}catch(e){code=e.code;}return{code,state:a.sync.state(),checkpoint:a.core.checkpointJson(),document:a.core.documentJson()};});
 expect(retained.code).toBe("permission_denied");expect(retained.state.status).toBe("denied");expect(retained.state.pending).toBe(true);expect(retained.document).toContain("Offline after revoke Accepted ");
 await page.evaluate(async()=>{const app=window.relayAppFixture;await app.owner.request({kind:"grant",principal:"alice",role:"editor"});await app.peers.a.sync.connect();await app.peers.a.sync.flush();});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.peers.a.sync.state().status)).toBe("ready");
});

test("a divergent same-writer journal rejects before catchup and sync disposal never disposes the editor",async({page})=>{
 const r=await page.evaluate(async()=>{const t=window.sharedTools,app=window.relayAppFixture,a=await app.open("a",{principal:"alice"});const prior=a.core.checkpointJson();a.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Server branch "}}]});await a.sync.flush();a.sync.dispose();const p=t.wasm.SharedRichProfile.from_configuration_json(t.vector.shared_writer.configuration),fork=new t.SharedRichEditor(p.restore("room",prior)),old=new t.SharedRichEditor(p.restore("room",prior));p.free();fork.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Client branch "}}]});const saved=fork.checkpointJson(),sync=new t.SharedRelaySync(fork,{identity:a.identity,getToken:()=>app.tokens.alice,autoConnect:false});let code;try{await sync.connect();}catch(e){code=e.code;}const result={code,state:sync.state(),unchanged:fork.checkpointJson()===saved,document:fork.documentJson()};sync.dispose();fork.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Still usable "}}]});result.usable=fork.documentJson().includes("Still usable ");fork.dispose();const older=new t.SharedRelaySync(old,{identity:a.identity,getToken:()=>app.tokens.alice,autoConnect:false});try{await older.connect();}catch(e){result.olderCode=e.code;}result.oldUnchanged=old.checkpointJson()===prior;older.dispose();old.dispose();return result;});
 expect(r.code).toBe("history_fork");expect(r.olderCode).toBe("server_ahead");expect(r.oldUnchanged).toBe(true);expect(r.state.status).toBe("failed");expect(r.unchanged).toBe(true);expect(r.document).toContain("Client branch ");expect(r.document).not.toContain("Server branch ");expect(r.usable).toBe(true);
});

test("dependency pending remains locally durable and a later author catchup retries it even when the local view was already identical",async({page})=>{
 await page.evaluate(async()=>{const app=window.relayAppFixture,a=await app.open("a",{principal:"alice"}),b=await app.open("b",{principal:"bob"});a.sync.disconnect();b.sync.disconnect();a.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Required author "}}]});await b.core.receiveFrame(a.core.updateFrame());b.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Pending dependent "}}]});await Promise.all([a.session.flush(),b.session.flush()]);await b.sync.connect();});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.peers.b.sync.state().waitingFor.length)).toBeGreaterThan(0);
 const pending=await page.evaluate(async()=>{const app=window.relayAppFixture,{a,b}=app.peers;return{state:b.sync.state(),a:a.identity.writer,bClock:(await app.owner.request({kind:"clock",writer:b.identity.writer})).clock.through,before:b.core.documentJson()};});
 expect(pending.state.status).toBe("pending");expect(pending.state.locallyDurableThrough).toBe(pending.state.localThrough);expect(pending.bClock).toBe("0");expect(pending.state.waitingFor.some(d=>d.writer===pending.a)).toBe(true);
 await page.evaluate(async()=>{const a=window.relayAppFixture.peers.a;await a.sync.connect();await a.sync.flush();});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.peers.b.sync.state().status)).toBe("ready");
 const final=await page.evaluate(()=>{const {a,b}=window.relayAppFixture.peers;return{state:b.sync.state(),document:b.core.documentJson(),same:a.core.documentJson()===b.core.documentJson()};});expect(final.state.waitingFor).toEqual([]);expect(final.document).toBe(pending.before);expect(final.same).toBe(true);
});

test("a replaced packaged writer stops reconnecting and preserves its independently editable old branch",async({page})=>{
 await page.evaluate(async()=>{const app=window.relayAppFixture,a=await app.open("a",{principal:"alice"});app.beforeFence=a.core.checkpointJson();app.replacement=await window.relaySocketFixture.connect(app.endpoint,"alice",app.tokens.alice);await app.replacement.request({kind:"resume",writer:a.identity.writer,credential:a.identity.credential});});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.peers.a.sync.state().status)).toBe("fenced");
 const r=await page.evaluate(async()=>{const t=window.sharedTools,app=window.relayAppFixture,a=app.peers.a,p=t.wasm.SharedRichProfile.from_configuration_json(t.vector.shared_writer.configuration),replacement=new t.SharedRichEditor(p.restore("room",app.beforeFence));p.free();a.core.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"Retained old branch "}}]});await a.session.flush();let code;try{await a.sync.flush();}catch(e){code=e.code;}replacement.dispatch({commands:[{kind:"insert_text",data:{block:"p",offset:0,text:"New writer session "}}]});const ack=await app.replacement.request({kind:"submit",group:replacement.writerGroups("0").groups[0]});replacement.dispose();return{code,state:a.sync.state(),ack:ack.kind,document:a.core.documentJson(),errors:app.errors};});
 expect(r.code).toBe("lease_rejected");expect(r.state.status).toBe("fenced");expect(r.state.pending).toBe(true);expect(r.ack).toBe("durable");expect(r.document).toContain("Retained old branch ");expect(r.document).not.toContain("New writer session ");
});

test("queued abort releases remote budgets without admitting malformed data and an abort after commit cannot rewind it",async({page})=>{
 const r=await page.evaluate(async()=>{const t=window.sharedTools,v=t.vector.shared_writer,a=new t.SharedRichEditor(t.wasm.RichReplicaProbe.restore("room",v.initialA)),b=new t.SharedRichEditor(t.wasm.RichReplicaProbe.restore("room",v.initialB));b.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Cancellable remote "}}]});const original=a.checkpointJson(),release=a.holdRemotes(),abort=new AbortController(),valid=new AbortController();const one=a.receiveFrame("not-json",{signal:abort.signal}).then(()=>"accepted",e=>e.code),two=a.receiveFrame(b.updateFrame(),{signal:valid.signal});abort.abort();const during={pending:a.pendingRemote().frames,unchanged:a.checkpointJson()===original};release();const code=await one,changed=await two,accepted=a.checkpointJson();valid.abort();const after=accepted===a.checkpointJson();const stopped=new AbortController();stopped.abort();let already;try{await a.receiveFrame("also not-json",{signal:stopped.signal});}catch(e){already=e.code;}const document=a.documentJson();a.dispose();b.dispose();return{during,code,changed,after,already,document};});
 expect(r.during).toEqual({pending:1,unchanged:true});expect(r.code).toBe("remote_cancelled");expect(r.changed).toBe(true);expect(r.after).toBe(true);expect(r.already).toBe("remote_cancelled");expect(r.document).toContain("Cancellable remote ");
});

test("failed credential persistence cannot return an authoring registration and transport notifications stay out of publication callbacks",async({page})=>{
 const r=await page.evaluate(async()=>{const t=window.sharedTools,app=window.relayAppFixture;let failed;try{await t.registerSharedRelayWriter({endpoint:app.endpoint,principal:"alice",room:"room",getToken:()=>app.tokens.alice,saveIdentity:()=>{throw Error("Private save error");}});}catch(e){failed=e.code;}let selected=false;const a=await app.open("a",{principal:"alice",onState:(peer,s)=>{if(s.status==="ready"&&!selected){selected=true;peer.core.select({kind:"node",block:"image-block"});throw Error("Host callback failure");}}});a.core.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Callback safe "}}]});await a.sync.flush();let duplicate;try{new t.SharedRelaySync(a.core,{identity:a.identity,getToken:()=>app.tokens.alice,autoConnect:false});}catch(e){duplicate=e.code;}return{failed,duplicate,writer:a.identity.writer,selected,document:a.core.documentJson(),state:a.sync.state(),secretInState:JSON.stringify(a.states).includes(a.identity.credential),errors:app.errors};});
 expect(r.failed).toBe("identity_not_saved");expect(r.duplicate).toBe("relay_already_attached");expect(r.writer).toBe("3");expect(r.selected).toBe(true);expect(r.document).toContain("Callback safe ");expect(r.secretInState).toBe(false);expect(r.errors).not.toContain("reentrant_publication");
});

test("disconnect during initial held catchup allows an immediate new connect without reusing the cancelled startup promise",async({page})=>{
 await page.evaluate(async()=>{const app=window.relayAppFixture,a=await app.open("a",{principal:"alice",connectNow:false});app.startupHold=a.core.holdRemotes();app.firstStartup=a.sync.connect().then(()=>"connected",e=>e.code);});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.peers.a.core.pendingRemote().frames)).toBe(1);
 await page.evaluate(()=>{const app=window.relayAppFixture,a=app.peers.a;a.sync.disconnect();app.secondStartup=a.sync.connect().then(()=>"connected",e=>e.code);});
 await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.peers.a.core.pendingRemote().frames)).toBe(1);
 const result=await page.evaluate(async()=>{const app=window.relayAppFixture;app.startupHold();const first=await app.firstStartup,second=await app.secondStartup;await app.peers.a.sync.flush();return{first,second};});
 expect(result).toEqual({first:"disconnected",second:"connected"});await expect.poll(()=>page.evaluate(()=>window.relayAppFixture.peers.a.sync.state().status)).toBe("ready");
});
