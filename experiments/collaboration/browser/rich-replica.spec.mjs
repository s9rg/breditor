import {test,expect} from "@playwright/test";

function findBlock(node,block){return node.properties?.["breditor/block-id"]===block?node:node.children?.map(value=>findBlock(value,block)).find(Boolean);}

test("new column width history never hides a later remote resize contribution",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers(),apply=window.sharedApply,sync=window.sharedSync;try{
   apply(a,{kind:"insert_column",data:{block:"table-block",column:"created-width",width:240,before:"c"}});b.receive(a.updates());
   apply(a,{kind:"resize_column",data:{block:"table-block",column:"created-width",width:320}});b.receive(a.updates());
   apply(b,{kind:"resize_column",data:{block:"table-block",column:"created-width",width:640}});a.receive(b.updates());const before=a.document_json();
   a.undo();sync(a,b);const undo=a.document_json();a.redo();sync(a,b);return {before,undo,redo:a.document_json()};
  }finally{a.free();b.free();}
 });
 expect(result.undo).toBe(result.before);expect(result.redo).toBe(result.before);
 expect(findBlock(JSON.parse(result.before).root,"table-block").properties["breditor/columns"][0].width).toBe(640);
});

test("original update envelopes reject wrong room and model before importing malformed engine bytes",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers();try{
   const frame=a.update_frame(),joined=window.richShared.wasm.RichReplicaProbe.join_frame("room","303",frame);
   const same=joined.document_json()===a.document_json();joined.free();
   const before=b.document_json(),checkpoint=b.checkpoint(),failures=[];
   for(const [field,value] of [["document","other-room"],["modelVersion",6],["engine",{name:"loro",version:"wrong-version"}]]){
    const wrong=JSON.parse(frame);wrong[field]=value;wrong.bytes=[255];try{b.receive_frame(JSON.stringify(wrong));}catch(error){failures.push(String(error));}
   }
   return {same,failures,unchanged:b.document_json()===before&&b.checkpoint()===checkpoint};
  }finally{a.free();b.free();}
 });
 expect(result.same).toBe(true);expect(result.unchanged).toBe(true);expect(result.failures).toHaveLength(3);expect(result.failures.every(value=>value.includes("binding"))).toBe(true);
});

test("stale shared versions reject before JSON decoding and keep the committed owner exact",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers();try{
   const version=a.causal_version();window.sharedApply(b,{kind:"insert_text",data:{block:"p",offset:1,text:"remote"}});a.receive(b.updates());
   const before=a.document_json(),checkpoint=a.checkpoint();let failure;
   try{a.apply_at(version,"not valid JSON");}catch(error){failure=String(error);}
   const unchanged=a.document_json()===before&&a.checkpoint()===checkpoint;
   const current=a.causal_version();a.apply_at(current,JSON.stringify([{kind:"insert_text",data:{block:"p",offset:0,text:"Current "}}]));
   return {failure,unchanged,version:JSON.parse(current),after:a.document_json()};
  }finally{a.free();b.free();}
 });
 expect(result.failure).toContain("stale shared causal version");expect(result.unchanged).toBe(true);expect(Object.values(result.version).every(value=>typeof value==="string")).toBe(true);
 expect(findBlock(JSON.parse(result.after).root,"p").children.map(run=>run.text).join("")).toContain("Current ");
});

test.beforeEach(async({page})=>{
 await page.goto("/");await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 await page.evaluate(async()=>{
  const wasm=await import("/probe.js"),vector=await(await fetch("/native-vector.json")).json();
  window.richShared={wasm,input:vector.rich_local_input};
  window.makePeers=()=>{
   const a=new wasm.RichReplicaProbe(vector.rich_local_input,"101"),b=wasm.RichReplicaProbe.join_frame("room","202",a.update_frame());
   return {a,b};
  };
  window.sharedSync=(a,b)=>{const x=a.update_frame(),y=b.update_frame();a.receive_frame(y);b.receive_frame(x);if(a.document_json()!==b.document_json())throw Error("Shared ASTs diverged");};
  window.sharedApply=(owner,...commands)=>owner.apply(JSON.stringify(commands));
  window.sharedNode=(node,block)=>node.properties?.["breditor/block-id"]===block?node:node.children?.map(value=>window.sharedNode(value,block)).find(Boolean);
  window.sharedCell=(owner,row,column)=>window.sharedNode(JSON.parse(owner.document_json()).root,row).children.find(cell=>cell.properties["breditor/column-id"]===column);
  window.sharedParagraph=(block,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":block},children:[{kind:"text",text,formats:[{type:"breditor/strong",properties:{}}]}]});
  window.sharedGrid=()=>{const {a,b}=window.makePeers();window.sharedApply(a,{kind:"insert_row",data:{block:"table-block",row_block:"new-row",row:"r2",before:"row"}},{kind:"insert_column",data:{block:"table-block",column:"c2",width:240,before:"c"}});window.sharedSync(a,b);return {a,b};};
  window.sharedMerge=(owner,id,lastRow="new-row")=>({kind:"merge_cells",data:{block:"table-block",merge:id,anchor:window.sharedCell(owner,"new-row","c2").properties["breditor/block-id"],focus:window.sharedCell(owner,lastRow,"c").properties["breditor/block-id"]}});
 });
});

test("independent rich creation keeps remote content through creator Undo and Redo",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers(),apply=window.sharedApply,sync=window.sharedSync;try{
   apply(a,{kind:"insert_blocks",data:{parent:null,before:"table-block",nodes:[window.sharedParagraph("a-new","Initial🙂")]}});
   apply(b,{kind:"insert_blocks",data:{parent:null,before:"table-block",nodes:[window.sharedParagraph("b-new","Other")]}});sync(a,b);
   apply(b,{kind:"insert_text",data:{block:"a-new",offset:0,text:"Remote "}});a.receive(b.updates());const before=a.document_json();
   a.undo();sync(a,b);const undone=a.document_json();a.redo();sync(a,b);return {before,undone,after:a.document_json()};
  }finally{a.free();b.free();}
 });
 expect(result.after).toBe(result.before);expect(findBlock(JSON.parse(result.undone).root,"a-new")).toBeUndefined();
 expect(findBlock(JSON.parse(result.undone).root,"b-new").children.map(run=>run.text).join("")).toBe("Other");
 expect(findBlock(JSON.parse(result.after).root,"a-new").children.map(run=>run.text).join("")).toBe("Remote Initial🙂");
});

test("independent new axes derive one shared editable cell and retain its rich body and header",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers(),apply=window.sharedApply,sync=window.sharedSync;try{
   apply(a,{kind:"insert_row",data:{block:"table-block",row_block:"new-row",row:"r2",before:"row"}});
   apply(b,{kind:"insert_column",data:{block:"table-block",column:"c2",width:240,before:"c"}});sync(a,b);
   const cell=window.sharedCell(a,"new-row","c2"),block=cell.children[0].properties["breditor/block-id"];
   apply(a,{kind:"insert_text",data:{block,offset:0,text:"A"}});apply(b,{kind:"insert_text",data:{block,offset:0,text:"B🙂"}});sync(a,b);
   const combined=window.sharedCell(a,"new-row","c2").children[0].children.map(run=>run.text).join("");a.undo();sync(a,b);
   apply(b,{kind:"insert_blocks",data:{parent:cell.properties["breditor/block-id"],before:null,nodes:[window.sharedParagraph("rich-cell","Rich")]}},{kind:"set_header",data:{cells:[cell.properties["breditor/block-id"]],header:true}});sync(a,b);
   const before=a.document_json();a.undo();sync(a,b);const hidden=!window.sharedNode(JSON.parse(a.document_json()).root,"new-row");a.redo();sync(a,b);
   return {combined,hidden,exact:a.document_json()===before,cell:window.sharedCell(a,"new-row","c2")};
  }finally{a.free();b.free();}
 });
 expect(result.combined).toContain("A");expect(result.combined).toContain("B🙂");expect(result.hidden).toBe(true);expect(result.exact).toBe(true);
 expect(result.cell.properties["breditor/header"]).toBe(true);expect(result.cell.children[0].children.map(run=>run.text).join("")).toBe("B🙂");
 expect(findBlock(result.cell,"rich-cell").children[0].text).toBe("Rich");
});

test("whole tables images headings and lists decompose into one shared creation group",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers(),apply=window.sharedApply,sync=window.sharedSync;try{
   const source=JSON.parse(a.document_json()).root,table=structuredClone(source.children[0]),image=structuredClone(window.sharedNode(source,"image-block"));
   function rekey(node,prefix){for(const name of ["breditor/block-id","breditor/table-id","breditor/image-id","breditor/row-id","breditor/column-id","breditor/asset-generation"])if(typeof node.properties?.[name]==="string")node.properties[name]=`${prefix}-${node.properties[name]}`;for(const column of node.properties?.["breditor/columns"]??[])column.id=`${prefix}-${column.id}`;for(const child of node.children??[])if(child.kind==="element")rekey(child,prefix);}
   rekey(table,"created");rekey(image,"standalone");const heading=window.sharedParagraph("heading-new","Title🙂");heading.type="breditor/heading";heading.properties["breditor/level"]=2;
   const list={kind:"element",type:"breditor/ordered-list",entityId:null,properties:{"breditor/block-id":"list-new","breditor/start":3},children:[{kind:"element",type:"breditor/list-item",entityId:null,properties:{"breditor/block-id":"item-new"},children:[window.sharedParagraph("list-p","Item")]}]};
   apply(a,{kind:"insert_blocks",data:{parent:null,before:null,nodes:[table,image,heading,list]}});const count=a.undo_count();b.receive(a.updates());
   apply(b,{kind:"insert_text",data:{block:"created-caption",offset:0,text:"Remote "}});a.receive(b.updates());const before=a.document_json();a.undo();sync(a,b);const hidden=!window.sharedNode(JSON.parse(a.document_json()).root,"created-table-block");a.redo();sync(a,b);
   return {count,hidden,exact:a.document_json()===before,after:JSON.parse(a.document_json()).root};
  }finally{a.free();b.free();}
 });
 expect(result.count).toBe(1);expect(result.hidden).toBe(true);expect(result.exact).toBe(true);expect(findBlock(result.after,"heading-new").type).toBe("breditor/heading");
 expect(findBlock(result.after,"list-new").properties["breditor/start"]).toBe(3);expect(findBlock(result.after,"standalone-image-block").type).toBe("breditor/image");
});

test("owned merge split and merged headers retain every covered cell body",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.sharedGrid(),apply=window.sharedApply,sync=window.sharedSync;try{
   apply(a,window.sharedMerge(a,"m-a"));b.receive(a.updates());const first=window.sharedCell(a,"new-row","c2"),last=window.sharedCell(a,"new-row","c");
   let rejected=false;const prior=a.checkpoint();try{apply(a,{kind:"set_header",data:{cells:[last.properties["breditor/block-id"]],header:true}});}catch{rejected=a.checkpoint()===prior;}
   apply(a,{kind:"set_header",data:{cells:[first.properties["breditor/block-id"],last.properties["breditor/block-id"]],header:true}});
   apply(b,{kind:"insert_text",data:{block:last.children[0].properties["breditor/block-id"],offset:0,text:"Covered🙂"}});sync(a,b);
   apply(a,{kind:"split_cell",data:{cell:last.properties["breditor/block-id"]}});sync(a,b);const split=a.document_json();a.undo();sync(a,b);const merged=a.document_json();a.redo();sync(a,b);
   return {rejected,exact:a.document_json()===split,split:JSON.parse(split).root,merged:JSON.parse(merged).root};
  }finally{a.free();b.free();}
 });
 expect(result.rejected).toBe(true);expect(result.exact).toBe(true);const table=findBlock(result.split,"table-block");expect(table.properties["breditor/retracted-merges"]).toEqual(["m-a"]);
 const cells=findBlock(result.split,"new-row").children;expect(cells.map(cell=>cell.properties["breditor/header"])).toEqual([true,true]);expect(cells[1].children[0].children.map(run=>run.text).join("")).toBe("Covered🙂");
 expect(findBlock(result.merged,"table-block").properties["breditor/retracted-merges"]).toEqual([]);
});

test("independent splits retract observed losing merges without undoing the other writer",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.sharedGrid(),apply=window.sharedApply,sync=window.sharedSync;try{
   apply(a,window.sharedMerge(a,"m-a","row"));apply(b,window.sharedMerge(b,"m-b"));sync(a,b);
   const split={kind:"split_cell",data:{cell:window.sharedCell(a,"new-row","c2").properties["breditor/block-id"]}};apply(a,split);apply(b,split);sync(a,b);
   const both=a.document_json();a.undo();sync(a,b);const one=a.document_json();b.undo();sync(a,b);return {both,one,restored:a.document_json()};
  }finally{a.free();b.free();}
 });
 for(const document of [result.both,result.one])expect(findBlock(JSON.parse(document).root,"table-block").properties["breditor/retracted-merges"]).toEqual(["m-a","m-b"]);
 expect(findBlock(JSON.parse(result.restored).root,"table-block").properties["breditor/retracted-merges"]).toEqual([]);
 expect(findBlock(JSON.parse(result.restored).root,"table-block").properties["breditor/merges"]).toHaveLength(2);
});

test("created axes and merge history replay after page reload with exact future operation bytes",async({page})=>{
 const saved=await page.evaluate(()=>{
  const {a,b}=window.sharedGrid(),apply=window.sharedApply,sync=window.sharedSync;try{
   apply(a,window.sharedMerge(a,"m-reload","row"));b.receive(a.updates());
   apply(b,{kind:"split_cell",data:{cell:window.sharedCell(b,"row","c").properties["breditor/block-id"]}});a.receive(b.updates());
   const journal=a.checkpoint(),before=a.document_json();a.undo();sync(a,b);const undo=a.document_json(),undoBytes=Array.from(a.updates());a.redo();
   return {journal,before,undo,undoBytes,redo:a.document_json(),redoBytes:Array.from(a.updates())};
  }finally{a.free();b.free();}
 });
 await page.reload();await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 const restored=await page.evaluate(async saved=>{const wasm=await import("/probe.js"),owner=wasm.RichReplicaProbe.restore("room",saved.journal);try{const before=owner.document_json();owner.undo();const undo=owner.document_json(),undoBytes=Array.from(owner.updates());owner.redo();return {before,undo,undoBytes,redo:owner.document_json(),redoBytes:Array.from(owner.updates())};}finally{owner.free();}},saved);
 expect(restored).toEqual({before:saved.before,undo:saved.undo,undoBytes:saved.undoBytes,redo:saved.redo,redoBytes:saved.redoBytes});
});

test("real shared Wasm materializes an identical admitted rich AST, not probe JSON",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers();try{return {a:a.document_json(),b:b.document_json(),admitted:JSON.parse(window.richShared.wasm.admit_rich_ast(window.richShared.input)).canonical,undo:[a.undo_count(),b.undo_count()]};}finally{a.free();b.free();}
 });
 expect(result.a).toBe(result.admitted);expect(result.b).toBe(result.a);expect(result.undo).toEqual([0,0]);
});

test("simultaneous cell caption and paired metadata effects survive another writers selective undo",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers(),apply=window.sharedApply,sync=window.sharedSync;
  try{
   apply(a,{kind:"insert_text",data:{block:"p",offset:1,text:"A"}},{kind:"resize_column",data:{block:"table-block",column:"c",width:240}});
   apply(b,{kind:"insert_text",data:{block:"p",offset:1,text:"B"}},{kind:"insert_text",data:{block:"caption",offset:0,text:"remote "}},{kind:"set_image_alt",data:{block:"image-block",text:"Remote alt",decorative:false}});
   sync(a,b);const before=a.document_json();a.undo();sync(a,b);const undone=a.document_json();a.redo();sync(a,b);return {before,undone,redone:a.document_json()};
  }finally{a.free();b.free();}
 });
 expect(result.redone).toBe(result.before);
 const doc=JSON.parse(result.undone),node=findBlock;
 expect(node(doc.root,"p").children.map(run=>run.text).join("")).toBe("aB🙂b");
 expect(node(doc.root,"caption").children.map(run=>run.text).join("")).toBe("remote xy🙂");
 expect(node(doc.root,"image-block").properties["breditor/alt-text"]).toBe("Remote alt");
 expect(node(doc.root,"table-block").properties["breditor/columns"][0].width).toBe(120);
});

test("shared owned formatting and paired size survive offline merge and exact writer restart",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers(),apply=window.sharedApply,sync=window.sharedSync;let restored;
  try{
   const format={kind:"set_format",data:{block:"caption",offset:0,length:2,format:{type:"breditor/strong",properties:{}},enabled:true}};
   apply(a,format,{kind:"resize_image",data:{block:"image-block",size:[320,180]}});apply(b,format,{kind:"resize_image",data:{block:"image-block",size:[640,360]}});
   sync(a,b);a.undo();sync(a,b);const before=a.document_json(),checkpoint=a.checkpoint();
   restored=window.richShared.wasm.RichReplicaProbe.restore("room",checkpoint);a.redo();restored.redo();
   return {before,restored:restored.document_json(),after:a.document_json(),bytesEqual:Array.from(a.updates()).join(",")===Array.from(restored.updates()).join(","),redo:restored.redo_count()};
  }finally{a.free();b.free();restored?.free();}
 });
 expect(result.restored).toBe(result.after);expect(result.bytesEqual).toBe(true);expect(result.redo).toBe(0);
 const parsed=JSON.parse(result.before);const image=parsed.root.children[0].children[0].children[0].children[1];
 expect(image.properties).toMatchObject({"breditor/width":640,"breditor/height":360});
 expect(image.children[0].children[0].formats).toEqual([{type:"breditor/strong",properties:{}}]);
});

test("independent shared row and column deletion effects cannot be retracted by another writer",async({page})=>{
 const result=await page.evaluate(()=>{
  const outputs=[];
  for(const command of [{kind:"delete_block",data:{block:"row"}},{kind:"delete_column",data:{block:"table-block",column:"c"}}]){
   const {a,b}=window.makePeers();try{window.sharedApply(a,command);window.sharedApply(b,command);window.sharedSync(a,b);a.undo();window.sharedSync(a,b);
    const hidden=!window.sharedNode(JSON.parse(a.document_json()).root,"p");b.undo();window.sharedSync(a,b);outputs.push({hidden,restored:!!window.sharedNode(JSON.parse(a.document_json()).root,"p")});
   }finally{a.free();b.free();}
  }return outputs;
 });
 expect(result).toEqual([{hidden:true,restored:true},{hidden:true,restored:true}]);
});

test("same-node later remote placement survives Undo and Redo with its caption intact",async({page})=>{
 const result=await page.evaluate(()=>{
  const {a,b}=window.makePeers();try{
   window.sharedApply(a,{kind:"move_block",data:{block:"image-block",parent:null,before:"table-block"}});b.receive(a.updates());
   window.sharedApply(b,{kind:"move_block",data:{block:"image-block",parent:null,before:null}},{kind:"insert_text",data:{block:"caption",offset:0,text:"Moved "}});a.receive(b.updates());
   const before=a.document_json();a.undo();const undo=a.document_json();window.sharedSync(a,b);a.redo();return {before,undo,redo:a.document_json()};
  }finally{a.free();b.free();}
 });
 expect(result.undo).toBe(result.before);expect(result.redo).toBe(result.before);
 expect(JSON.parse(result.before).root.children.at(-1).children[0].children.map(value=>value.text).join("")).toBe("Moved xy🙂");
});

test("failed shared groups do not partially publish and a real page reload preserves selective redo",async({page})=>{
 const saved=await page.evaluate(()=>{
  const {a,b}=window.makePeers();try{
   const before=a.document_json(),journal=a.checkpoint();let rejected=false;
   try{window.sharedApply(a,{kind:"insert_text",data:{block:"p",offset:1,text:"partial"}},{kind:"resize_image",data:{block:"image-block",size:[0,10]}});}catch{rejected=true;}
   if(a.document_json()!==before||a.checkpoint()!==journal)throw Error("Failed group published");
   window.sharedApply(a,{kind:"insert_text",data:{block:"p",offset:1,text:"local"}});window.sharedApply(b,{kind:"insert_text",data:{block:"caption",offset:0,text:"remote"}});window.sharedSync(a,b);a.undo();
   const saved=a.checkpoint(),current=a.document_json();a.redo();return {saved,current,future:a.document_json(),rejected};
  }finally{a.free();b.free();}
 });
 expect(saved.rejected).toBe(true);await page.reload();await expect(page.locator("#status")).toHaveText("Ready for contract tests");
 const recovered=await page.evaluate(async saved=>{const {RichReplicaProbe}=await import("/probe.js"),owner=RichReplicaProbe.restore("room",saved.saved);try{const current=owner.document_json();owner.redo();return {current,future:owner.document_json()};}finally{owner.free();}},saved);
 expect(recovered.current).toBe(saved.current);expect(recovered.future).toBe(saved.future);
});
