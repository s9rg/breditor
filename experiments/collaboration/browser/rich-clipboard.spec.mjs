import {test,expect} from "@playwright/test";
import {compareEngineExports} from "./compare-exports.mjs";

test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 await page.evaluate(async()=>{
  const wasm=await import("/probe.js"),vector=await(await fetch("/native-vector.json")).json(),t={wasm,vector};window.clipboardTools=t;
  t.peers=()=>{const a=new wasm.RichReplicaProbe(vector.rich_local_input,"101"),b=wasm.RichReplicaProbe.join_frame("room","202",a.update_frame());return{a,b};};
  t.guard=(a,fn)=>{const o=a.observe();try{return fn(o);}finally{o.free();}};
  t.dispatch=(a,commands)=>t.guard(a,o=>a.dispatch(o,JSON.stringify({commands})));
  t.select=(a,s)=>t.guard(a,o=>a.set_selection(o,JSON.stringify(s)));
  t.range=(block,start,end)=>({kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}});
  t.grid=()=>({kind:"grid",anchor:{table:"t",row:"r",column:"second"},focus:{table:"t",row:"r",column:"c"}});
  t.history=(a,redo=false)=>t.guard(a,o=>redo?a.redo_observed(o):a.undo_observed(o));
  t.copy=a=>t.guard(a,o=>JSON.parse(a.copy_clipboard(o)));
  t.node=(a,id)=>{const visit=n=>n.properties?.["breditor/block-id"]===id?n:n.children?.map(visit).find(Boolean);return visit(JSON.parse(a.document_json()).root);};
  t.text=n=>n?.text??(n?.children??[]).map(t.text).join("");
  t.sync=(a,b)=>{const x=a.update_frame(),y=b.update_frame();a.receive_frame(y);b.receive_frame(x);if(a.document_json()!==b.document_json())throw Error("Replica mismatch");};
  t.paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:[{kind:"text",text,formats:[]}]});
  t.cellPaste=(cell,id,text)=>({kind:"paste_table_cells",data:{anchor:cell,focus:cell,cells:[[{body:[t.paragraph(id,text)],header:null}]],merges:[]}});
  t.insert=(block,text)=>({kind:"insert_text",data:{block,offset:0,text}});
  t.setup=(a,merge=true)=>{t.dispatch(a,[{kind:"insert_column",data:{block:"table-block",column:"second",width:200,before:null}}]);const cell=t.node(a,"row").children[1].properties["breditor/block-id"];t.dispatch(a,[t.cellPaste(cell,"right-body","Right🙂")]);if(merge)t.dispatch(a,[{kind:"merge_cells",data:{block:"table-block",merge:"source-merge",anchor:"cell",focus:cell}}]);return cell;};
  t.ids=(fragment,prefix)=>{const ids=[];let n=0;const next=kind=>ids.push({kind,id:`${prefix}-${kind}-${++n}`});const visit=node=>{if(node.kind!=="element")return;next("block");if(node.type==="breditor/table"){next("table");for(const row of node.children)next("row");for(const c of node.properties["breditor/columns"])next("column");for(const m of node.properties["breditor/merges"])next("merge");}else if(node.type==="breditor/image"){next("image");next("assetGeneration");}for(const child of node.children)visit(child);};for(const node of JSON.parse(fragment).document.root.children)visit(node);return ids;};
  t.paste=(a,fragment,target,prefix)=>t.guard(a,o=>a.paste_clipboard(o,JSON.stringify({fragment,target,identities:target.kind==="text"?[]:t.ids(fragment,prefix)})));
 });
});

test("copy is a frozen semantic read preserving redo and opaque observations",async({page})=>{
 const r=JSON.parse(await page.evaluate(()=>{const t=window.clipboardTools,{a,b}=t.peers();let o;try{
  t.dispatch(a,[t.insert("p","X")]);t.history(a);t.select(a,t.range("p",3,1));o=a.observe();const before=a.checkpoint(),content=JSON.parse(a.copy_clipboard(o)),unchanged=a.checkpoint()===before;
  t.select(a,t.range("p",0,0));let stale=false,foreign=false;try{a.copy_clipboard(o);}catch{stale=true;}try{b.copy_clipboard(o);}catch{foreign=true;}return JSON.stringify({text:content.plainText,kind:JSON.parse(content.richJson).kind,unchanged,redo:a.redo_count(),stale,foreign,caret:t.copy(a)});
 }finally{o?.free();a.free();b.free();}}));expect(r).toEqual({text:"🙂",kind:"text",unchanged:true,redo:1,stale:true,foreign:true,caret:null});
});

test("inline rich paste replaces backward Unicode ranges with complete styles and exact caret history",async({page})=>{
 const r=JSON.parse(await page.evaluate(()=>{const t=window.clipboardTools,{a,b}=t.peers();try{
  t.select(a,t.range("p",3,1));const fragment=t.copy(a).richJson;t.select(a,t.range("caption",2,0));const before=a.document_json(),selection=JSON.parse(a.view_json()).selection;
  t.paste(a,fragment,{kind:"text"},"inline");const after=a.document_json(),caption=t.node(a,"caption"),selected=JSON.parse(a.view_json()).selection;const restored=t.wasm.RichReplicaProbe.restore("room",a.checkpoint());try{t.history(a);t.history(restored);if(a.checkpoint()!==restored.checkpoint())throw Error("Inline undo replay mismatch");const exact=a.document_json()===before,oldSelection=JSON.parse(a.view_json()).selection;t.history(a,true);t.history(restored,true);return JSON.stringify({text:t.text(caption),formats:caption.children[0].formats,selected,exact,selectionRestored:JSON.stringify(selection)===JSON.stringify(oldSelection),redo:a.document_json()===after&&a.checkpoint()===restored.checkpoint()});}finally{restored.free();}
 }finally{a.free();b.free();}}));expect(r.text).toBe("🙂🙂");expect(r.formats).toEqual([{type:"breditor/strong",properties:{}}]);expect(r.selected).toMatchObject({kind:"text",focus:{block:"caption",offset:"2"}});expect(r).toMatchObject({exact:true,selectionRestored:true,redo:true});
});

test("whole image paste keeps immutable assets while allocating fresh image caption and generation IDs",async({page})=>{
 const r=JSON.parse(await page.evaluate(()=>{const t=window.clipboardTools,{a,b}=t.peers();try{
  t.select(a,{kind:"node",block:"image-block"});const fragment=t.copy(a).richJson;t.paste(a,fragment,{kind:"flow",parent:null,before:null},"image-copy");const image=JSON.parse(a.document_json()).root.children[1];t.dispatch(b,[t.insert("caption","R")]);t.sync(a,b);t.history(a);t.sync(a,b);const original=t.text(t.node(a,"caption")),removed=JSON.parse(a.document_json()).root.children.length===1;t.history(a,true);return JSON.stringify({image,original,removed});
 }finally{a.free();b.free();}}));expect(r.image.properties).toMatchObject({"breditor/asset-id":"asset","breditor/alt-text":"Diagram"});expect(r.image.properties["breditor/image-id"]).not.toBe("image");expect(r.image.properties["breditor/asset-generation"]).not.toBe("generation");expect(r.image.children[0].properties["breditor/block-id"]).not.toBe("caption");expect(r).toMatchObject({original:"Rxy🙂",removed:true});
});

test("copied merged tables receive actual shared clocks and preserve every rich source partition",async({page})=>{
 const r=JSON.parse(await page.evaluate(()=>{const t=window.clipboardTools,{a,b}=t.peers();try{
  t.setup(a);t.select(a,{kind:"node",block:"table-block"});const fragment=t.copy(a).richJson;t.paste(a,fragment,{kind:"flow",parent:null,before:null},"table-copy");const table=JSON.parse(a.document_json()).root.children[1],after=a.document_json();t.history(a);t.history(a,true);return JSON.stringify({record:table.properties["breditor/merges"][0],parts:table.children[0].children.map(t.text),fresh:table.properties["breditor/table-id"]!=="t",redo:a.document_json()===after});
 }finally{a.free();b.free();}}));expect(r.record).toMatchObject({writer:"101"});expect(r.record.lamport).not.toBe("1");expect(r.record.id).not.toBe("source-merge");expect(r).toMatchObject({parts:["a🙂bxy🙂","Right🙂"],fresh:true,redo:true});
});

test("grid paste preserves stable axes and remote old-body edits across selective undo and reload",async({page})=>{
 const r=JSON.parse(await page.evaluate(()=>{const t=window.clipboardTools,{a,b}=t.peers();try{
  t.setup(a);b.receive_frame(a.update_frame());t.select(a,t.grid());const fragment=t.copy(a).richJson,before=t.node(a,"table-block").properties;t.paste(a,fragment,{kind:"grid"},"grid-copy");t.dispatch(b,[t.insert("caption","R"),t.insert("right-body","B")]);t.sync(a,b);
  const parts=t.node(a,"row").children.map(t.text),columns=t.node(a,"table-block").properties["breditor/columns"],restored=t.wasm.RichReplicaProbe.restore("room",a.checkpoint());try{t.history(a);t.history(restored);if(a.checkpoint()!==restored.checkpoint())throw Error("Grid history mismatch");const originals=[t.text(t.node(a,"caption")),t.text(t.node(a,"right-body"))];t.history(a,true);t.history(restored,true);return JSON.stringify({parts,axes:JSON.stringify(columns)===JSON.stringify(before["breditor/columns"]),originals,exact:a.checkpoint()===restored.checkpoint()});}finally{restored.free();}
 }finally{a.free();b.free();}}));expect(r).toEqual({parts:["a🙂bxy🙂","Right🙂"],axes:true,originals:["Rxy🙂","BRight🙂"],exact:true});
});

test("clear preserves merge geometry headers and restored source bodies including derived intersections",async({page})=>{
 const r=JSON.parse(await page.evaluate(()=>{const t=window.clipboardTools,{a,b}=t.peers();try{
  const cell=t.setup(a),before=a.document_json(),properties=t.node(a,"table-block").properties;t.dispatch(a,[{kind:"clear_table_cells",data:{anchor:cell,focus:"cell",empty:["clear-left","clear-right"]}}]);const cleared=t.node(a,"row").children.map(t.text),geometry=JSON.stringify(properties)===JSON.stringify(t.node(a,"table-block").properties);t.history(a);const exact=a.document_json()===before;t.history(a,true);return JSON.stringify({cleared,geometry,exact});
 }finally{a.free();b.free();}}));expect(r).toEqual({cleared:["",""],geometry:true,exact:true});
});

test("concurrent grid replacements keep both owned bodies and reject stale or invalid requests atomically",async({page})=>{
 const r=JSON.parse(await page.evaluate(()=>{const t=window.clipboardTools,{a,b}=t.peers();let o;try{
  t.dispatch(a,[t.cellPaste("cell","a-body","A")]);t.dispatch(b,[t.cellPaste("cell","b-body","B")]);t.sync(a,b);const both=!!t.node(a,"a-body")&&!!t.node(a,"b-body");t.history(a);t.sync(a,b);const ownOnly=!t.node(a,"a-body")&&!!t.node(a,"b-body");t.history(b);t.sync(a,b);const original=t.text(t.node(a,"p"));
  o=a.observe();t.select(a,t.range("p",0,0));const before=a.checkpoint();let stale=false,invalid=false;try{a.paste_clipboard(o,"invalid");}catch(e){stale=String(e).includes("stale")&&before===a.checkpoint();}try{t.dispatch(a,[t.cellPaste("cell","p","reuse")]);}catch{invalid=before===a.checkpoint();}return JSON.stringify({both,ownOnly,original,stale,invalid});
 }finally{o?.free();a.free();b.free();}}));expect(r).toEqual({both:true,ownOnly:true,original:"a🙂b",stale:true,invalid:true});
});

test("whole-flow paste retains normalized empty root and derived cell paragraphs with exact undo",async({page})=>{
 const r=JSON.parse(await page.evaluate(()=>{const t=window.clipboardTools,results=[];for(const root of[false,true]){const{a,b}=t.peers();try{
  t.select(a,{kind:"node",block:"image-block"});const fragment=t.copy(a).richJson;let parent=null;if(root)t.dispatch(a,[{kind:"delete_block",data:{block:"table-block"}}]);else{t.dispatch(a,[{kind:"insert_column",data:{block:"table-block",column:"empty-target",width:180,before:null}}]);parent=t.node(a,"row").children[1].properties["breditor/block-id"];}
  const head=(parent?t.node(a,parent):JSON.parse(a.document_json()).root).children[0].properties["breditor/block-id"];t.select(a,t.range(head,0,0));const selected=JSON.stringify(JSON.parse(a.view_json()).selection),before=a.document_json();t.paste(a,fragment,{kind:"flow",parent,before:null},"empty-flow");const body=parent?t.node(a,parent).children:JSON.parse(a.document_json()).root.children,types=body.map(n=>n.type);t.history(a);const undo=a.document_json()===before&&selected===JSON.stringify(JSON.parse(a.view_json()).selection);t.history(a,true);const restored=t.wasm.RichReplicaProbe.restore("room",a.checkpoint());try{t.history(a);t.history(restored);results.push({types,undo,exact:a.checkpoint()===restored.checkpoint()});}finally{restored.free();}
 }finally{a.free();b.free();}}return JSON.stringify(results);}));expect(r).toEqual([{types:["breditor/paragraph","breditor/image"],undo:true,exact:true},{types:["breditor/paragraph","breditor/image"],undo:true,exact:true}]);
});

test("same-value explicit pasted headers own intent while preservation does not",async({page})=>{
 // The equal-basis false intent uses the higher writer, independently of preparation size.
 const r=JSON.parse(await page.evaluate(()=>{const t=window.clipboardTools,results=[];for(const header of[false,null]){const peers=t.peers(),a=peers.b,b=peers.a;try{
  const paste=t.cellPaste("cell","header-body","Pasted");paste.data.cells[0][0].header=header;t.dispatch(a,[paste]);t.dispatch(b,[{kind:"set_header",data:{cells:["cell"],header:true}}]);t.sync(a,b);const values=[t.node(a,"cell").properties["breditor/header"]];t.history(a);t.sync(a,b);values.push(t.node(a,"cell").properties["breditor/header"]);t.history(a,true);t.sync(a,b);values.push(t.node(a,"cell").properties["breditor/header"]);results.push(values);
 }finally{a.free();b.free();}}return JSON.stringify(results);}));expect(r).toEqual([[false,true,false],[true,true,true]]);
});

test("native combined clipboard journal reloads with exact future operations and UI",async({page})=>{
 const checkpoint=await page.evaluate(()=>window.clipboardTools.vector.shared_clipboard.checkpoint);await page.reload();await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 const r=JSON.parse(await page.evaluate(async checkpoint=>{const wasm=await import("/probe.js"),v=(await(await fetch("/native-vector.json")).json()).shared_clipboard,a=wasm.RichReplicaProbe.restore("room",checkpoint);try{
  const actual={},expected={},cases=[],capture=name=>{actual[name]={view:a.view_json(),checkpoint:a.checkpoint()};expected[name]={view:v[name].view,checkpoint:v[name].checkpoint};cases.push({name,native:v[name].bytes,wasm:Array.from(a.updates())});},guard=fn=>{const o=a.observe();try{return fn(o);}finally{o.free();}};
  capture("current");guard(o=>a.redo_observed(o));capture("redo");guard(o=>a.dispatch(o,JSON.stringify({commands:[v.clear]})));capture("cleared");guard(o=>a.undo_observed(o));capture("undo");guard(o=>a.redo_observed(o));capture("repeated");return JSON.stringify({actual,expected,cases});
 }finally{a.free();}},checkpoint));
 const decoded=await compareEngineExports(r.cases);for(const value of decoded)expect(value).toMatchObject({operationsEqual:true,causalVersionEqual:true,stateEqual:true,firstOperationDifference:null});expect(r.actual).toEqual(r.expected);
});
