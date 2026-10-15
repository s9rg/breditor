import {test,expect} from "@playwright/test";
import {compareEngineExports} from "../collaboration/browser/compare-exports.mjs";
test.beforeEach(async({page})=>{await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready");await page.evaluate(()=>{
 const t=window.sharedTools;t.errors=[];t.peers=()=>{const a=new t.SharedRichEditor(new t.wasm.RichReplicaProbe(t.vector.rich_local_input,"101")),b=new t.SharedRichEditor(t.wasm.RichReplicaProbe.join_frame("room","202",a.updateFrame()));return{a,b};};
 t.caption=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:[{kind:"text",text,formats:[]}]});
 t.image=core=>{const find=n=>n.properties?.["breditor/block-id"]==="image-block"?n:n.children?.map(find).find(Boolean);return find(JSON.parse(core.documentJson()).root);};
 t.text=n=>n?.text??n?.children?.map(t.text).join("")??"";
 t.sync=async(a,b)=>{const x=a.updateFrame(),y=b.updateFrame();await Promise.all([a.receiveFrame(y),b.receiveFrame(x)]);if(a.documentJson()!==b.documentJson())throw Error("Caption replicas differ");};
});});
test("concurrent generic caption creation selects one source and masked Undo cannot erase the other",async({page})=>{
 const result=JSON.parse(await page.evaluate(async()=>{const t=window.sharedTools,{a,b}=t.peers();a.dispatch({commands:[{kind:"set_image_caption",data:{block:"image-block",caption:null}}]});await t.sync(a,b);
 for(const[core,id,text]of[[a,"caption-a","Alice"],[b,"caption-b","Bob"]])core.dispatch({commands:[{kind:"insert_blocks",data:{parent:"image-block",before:null,nodes:[t.caption(id,text)]}}]});await t.sync(a,b);const winner=t.image(a).children;
 a.undo();await t.sync(a,b);const masked=t.image(a).children;b.undo();await t.sync(a,b);const empty=t.image(a).children;return JSON.stringify({winner,masked,empty});}));expect(result.winner).toHaveLength(1);expect(result.winner[0].children[0].text).toBe("Bob");expect(result.masked).toEqual(result.winner);expect(result.empty).toEqual([]);
});
test("caption toolbar removes and restores offline original text then creates editable fresh caption history",async({page})=>{
 await page.evaluate(()=>{const t=window.sharedTools,{a,b}=t.peers();t.a=a;t.b=b;t.dom=t.mountSharedEditor(document.querySelector("#a"),{core:a,onError:e=>t.errors.push(String(e))});t.dom.select({kind:"node",block:"image-block"});});
 await page.locator('#a [data-shared-action="remove-caption"]').click();await expect(page.locator('#a figcaption')).toHaveCount(0);
 await page.evaluate(async()=>{const t=window.sharedTools;t.b.dispatch({commands:[{kind:"insert_text",data:{block:"caption",offset:0,text:"Remote "}}]});await t.sync(t.a,t.b);t.a.undo();});
 await expect(page.locator('#a [data-rich-text="caption"]')).toHaveText("Remote xy🙂");await page.locator('#a [data-shared-action="redo"]').click();
 await page.locator('#a [data-shared-action="add-caption"]').click();await page.keyboard.type("New");await expect(page.locator('#a figcaption')).toHaveText("New");
 await page.locator('#a [data-shared-action="remove-caption"]').click();await expect(page.locator('#a figcaption')).toHaveCount(0);await page.locator('#a [data-shared-action="undo"]').click();await expect(page.locator('#a figcaption')).toHaveText("New");
 const r=JSON.parse(await page.evaluate(async()=>{const t=window.sharedTools;await t.sync(t.a,t.b);return JSON.stringify({caption:t.text(t.image(t.b).children[0]),errors:t.errors});}));expect(r).toEqual({caption:"New",errors:[]});
});
test("caption command requires explicit value and rejects stale authority before malformed payload",async({page})=>{
 const r=await page.evaluate(()=>{const t=window.sharedTools,raw=new t.wasm.RichReplicaProbe(t.vector.rich_local_input,"101"),o=raw.observe(),before=raw.checkpoint();let invalid=0;
 for(const data of[{block:"image-block"},{block:"image-block",caption:null,clock:"forged"},{block:"image-block",caption:{kind:"element",type:"breditor/heading",entityId:null,properties:{"breditor/block-id":"bad","breditor/level":1},children:[]}}]){try{raw.dispatch(o,JSON.stringify({commands:[{kind:"set_image_caption",data}]}));}catch{invalid++;}if(raw.checkpoint()!==before)throw Error("Partial invalid caption publication");}
 raw.dispatch(o,JSON.stringify({commands:[{kind:"set_image_caption",data:{block:"image-block",caption:null}}]}));let stale;try{raw.dispatch(o,"not JSON");}catch(e){stale=String(e);}o.free();raw.free();return{invalid,stale};});expect(r.invalid).toBe(3);expect(r.stale).toContain("stale or foreign shared observation");
});
test("native caption journal survives real reload with eight exact future Wasm operation sets",async({page})=>{
 const checkpoint=await page.evaluate(()=>window.sharedTools.vector.shared_caption.checkpoint);await page.reload();await expect(page.locator("#status")).toHaveText("Ready");
 const r=JSON.parse(await page.evaluate(checkpoint=>{const t=window.sharedTools,v=t.vector.shared_caption,a=new t.SharedRichEditor(t.wasm.RichReplicaProbe.restore("room",checkpoint));try{const cases=[],actual={},expected={},capture=name=>{actual[name]={view:JSON.stringify(a.view()),checkpoint:a.checkpointJson()};expected[name]={view:JSON.stringify(JSON.parse(v[name].view)),checkpoint:v[name].checkpoint};cases.push({name,native:v[name].bytes,wasm:JSON.parse(a.updateFrame()).bytes});};
 capture("current");a.redo();capture("redo");const p={block:"native-caption",offset:"5",affinity:"after"};a.select({kind:"text",anchor:p,focus:p});a.type("!");capture("typed");a.dispatch({commands:[{kind:"set_image_caption",data:{block:"image-block",caption:null}}]});capture("clear");a.undo();capture("undo_clear");a.undo();capture("undo_typed");a.redo();capture("redo_typed");a.redo();capture("redo_clear");return JSON.stringify({cases,actual,expected});}finally{a.dispose();}},checkpoint));for(const value of await compareEngineExports(r.cases))expect(value).toMatchObject({operationsEqual:true,causalVersionEqual:true,stateEqual:true,firstOperationDifference:null});expect(r.actual).toEqual(r.expected);
});

test("creation redo retains an offline prefix ahead of the seed in native and Wasm history",async({page})=>{
 const checkpoint=await page.evaluate(()=>window.sharedTools.vector.shared_caption.creation.checkpoint);await page.reload();await expect(page.locator("#status")).toHaveText("Ready");
 const r=JSON.parse(await page.evaluate(checkpoint=>{const t=window.sharedTools,v=t.vector.shared_caption.creation,a=new t.SharedRichEditor(t.wasm.RichReplicaProbe.restore("room",checkpoint)),find=n=>n.properties?.["breditor/block-id"]==="seed-caption"?n:n.children?.map(find).find(Boolean),text=()=>find(JSON.parse(a.documentJson()).root).children.map(n=>n.text).join("");try{const cases=[],actual={},expected={},texts=[],selections=[],capture=name=>{actual[name]={view:JSON.stringify(a.view()),checkpoint:a.checkpointJson()};expected[name]={view:JSON.stringify(JSON.parse(v[name].view)),checkpoint:v[name].checkpoint};cases.push({name,native:v[name].bytes,wasm:JSON.parse(a.updateFrame()).bytes});};
 capture("current");a.redo();capture("redo");texts.push(text());selections.push(a.view().selection);a.undo();capture("undo");a.redo();capture("redo_again");texts.push(text());selections.push(a.view().selection);return JSON.stringify({cases,actual,expected,texts,selections});}finally{a.dispose();}},checkpoint));
 for(const value of await compareEngineExports(r.cases))expect(value).toMatchObject({operationsEqual:true,causalVersionEqual:true,stateEqual:true,firstOperationDifference:null});expect(r.actual).toEqual(r.expected);expect(r.texts).toEqual(["Remote A🙂","Remote A🙂"]);for(const selection of r.selections)expect(selection.focus).toMatchObject({block:"seed-caption",offset:"10"});
});
