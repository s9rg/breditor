import {test,expect} from "@playwright/test";

test.beforeEach(async({page})=>{
 const errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 await page.goto("/");
 try {await expect(page.locator("#status")).toHaveText("Ready");}
 catch(error){throw new Error(`Rich module startup failed: ${errors.join("; ")}`,{cause:error});}
 await page.evaluate(()=>{
  const equal=(actual,expected)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`Mismatch: ${JSON.stringify(actual)} / ${JSON.stringify(expected)}`);};
  const boot=()=>{
   const profile=window.rich.compileRichProfile(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/rich-browser",version:1},extensions:[]}));
   const descriptor=profile.descriptor();
   // This is a trusted human-readable fixture, not imported wire. The strict
   // Document V2 codec requires sorted unique property/object keys.
   const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
   const initial=JSON.stringify({format:"breditor/document",formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(window.rich.root)});
   return {profile,editor:profile.createEditor(initial,"100"),initial};
  };
  const exec=(editor,command,status="content")=>equal(editor.execute(command),status);
  const roundtrip=(editor,command)=>{
   const before=editor.documentJson(),selection=editor.view().selection;
   exec(editor,command);const after=editor.documentJson(),afterSelection=editor.view().selection;
   exec(editor,{kind:"undo"},"undo");equal(editor.documentJson(),before);equal(editor.view().selection,selection);
   exec(editor,{kind:"redo"},"redo");equal(editor.documentJson(),after);equal(editor.view().selection,afterSelection);
  };
  const action=(kind,data)=>({kind,data});
  const p=(block,text="")=>({kind:"paragraph",block,text,formatsJson:"[]"});
  const cell=(block,column,body)=>({block,column,header:false,body:[body]});
  const select=(block,start,end=start)=>({kind:"setSelection",selection:{kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}}});
  const grid=(r0="r",c0="c",r1=r0,c1=c0)=>({kind:"setSelection",selection:{kind:"grid",anchor:{table:"t",row:r0,column:c0},focus:{table:"t",row:r1,column:c1}}});
  const grow=editor=>{
   roundtrip(editor,action("insertTableRow",{table:"t",before:null,row:{block:"row2",id:"r2",cells:[cell("cell2","c",p("p2","third"))]}}));
   roundtrip(editor,action("insertTableColumn",{table:"t",before:null,column:{id:"c2",width:180},cells:[{row:"r",cell:cell("cell12","c2",p("p12","second"))},{row:"r2",cell:cell("cell22","c2",p("p22","fourth"))}]}));
  };
  window.contract={equal,boot,exec,roundtrip,action,p,cell,select,grid,grow};
 });
});

test("explicit rich module/bootstrap leaves the default ABI and factories unchanged",async({page})=>{
 await page.evaluate(()=>{
  const {equal,boot}=window.contract,{profile,editor}=boot();
  equal(window.rich.wasm.breditorWasmAbiVersion(),"5");
  equal(profile.descriptor().abiVersion,1);
  equal(editor.view().revision,"0");
  equal(editor.view().tables[0].columns,[{id:"c",width:120}]);
  const rejected=window.rich.wasm.BreditorCompiledProfile.fromBootstrapJson(JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/rich-browser",version:1},extensions:[]}));
  equal(rejected.status,"error");rejected.error.free();rejected.free();
  for(const capacity of ["01","-1","10001","1.0"]){let failed=false;try{profile.createEditor(editor.documentJson(),capacity);}catch{failed=true;}equal(failed,true);}
  profile.dispose();equal(editor.view().revision,"0");editor.dispose();editor.dispose();
 });
});

test("range typing and explicit marks recover exact history and reject stale host views",async({page})=>{
 await page.evaluate(()=>{
  const {equal,boot,exec,select}=window.contract,{profile,editor}=boot();
  const original=editor.documentJson();exec(editor,select("p",1,3),"selection");
  const revision=editor.view().revision;
  exec(editor,{kind:"insertPlainText",text:"X"});
  equal(editor.view().selection.focus.offset,"2");
  equal(editor.view().pendingFormatsJson,'[{"type":"breditor/strong","properties":{}}]');
  let code;try{editor.execute({kind:"insertPlainText",text:"NO"},revision);}catch(error){code=error.code;}
  equal(code,"breditor_rich.stale_observation");
  const after=editor.documentJson();const restored=profile.restoreEditor(editor.checkpointJson());
  equal(restored.documentJson(),after);exec(restored,{kind:"undo"},"undo");equal(restored.documentJson(),original);
  equal(restored.view().selection.focus.offset,"3");exec(restored,{kind:"redo"},"redo");equal(restored.documentJson(),after);
  exec(restored,{kind:"setPendingFormats",formats:[]},"typing");exec(restored,{kind:"insertPlainText",text:"plain"});
  equal(restored.view().pendingFormatsJson,"[]");
  restored.dispose();editor.dispose();profile.dispose();
 });
});

test("atomic sibling range typing removes selected media and restores exact mixed content",async({page})=>{
 await page.evaluate(()=>{
  const {equal,boot,exec,roundtrip,action,p}=window.contract,{profile,editor}=boot();
  roundtrip(editor,action("insertBlocks",{position:{parent:{kind:"document"},before:"table-block"},blocks:[p("before","before")]}));
  roundtrip(editor,action("insertBlocks",{position:{parent:{kind:"document"},before:null},blocks:[p("after","after")]}));
  exec(editor,{kind:"setSelection",selection:{kind:"text",anchor:{block:"after",offset:"1",affinity:"after"},focus:{block:"before",offset:"3",affinity:"before"}}},"selection");
  const original=editor.documentJson();roundtrip(editor,{kind:"insertPlainText",text:"X"});
  equal(editor.view().tables.length,0);equal(editor.documentJson().includes("befXfter"),true);equal(editor.view().selection.focus.offset,"4");
  const restored=profile.restoreEditor(editor.checkpointJson());exec(restored,{kind:"undo"},"undo");equal(restored.documentJson(),original);equal(restored.view().selection.anchor.block,"after");
  restored.dispose();editor.dispose();profile.dispose();
 });
});

test("typed extension properties format cell text and survive recovered undo",async({page})=>{
 await page.evaluate(()=>{
  const {equal,exec,select,roundtrip,action}=window.contract;
  const bootstrap={format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/color-rich",version:1},extensions:[{
   id:{name:"example/color-extension",version:1},dependencies:[],conflicts:[],inlineFormats:[{kind:"example/color",revision:1}],inlineFormatPropertyContracts:[{
    formatKind:"example/color",properties:[{name:"example/color-value",presence:"required",valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:32}}]}],inlineFormatToggles:[],inlineFormatSets:[]}]};
  const profile=window.rich.compileRichProfile(window.rich.wasm,JSON.stringify(bootstrap)),binding=profile.descriptor();
  const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"custom-doc"},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":"custom-p"},children:[{kind:"text",text:"text🙂",formats:[]}]}]};
  const editor=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root}));
  exec(editor,select("custom-p",6),"selection");exec(editor,{kind:"setPendingFormats",formats:[{type:"example/color",properties:{"example/color-value":"gold"}}]},"typing");
  roundtrip(editor,{kind:"insertPlainText",text:"X"});
  roundtrip(editor,action("setInlineFormat",{change:{kind:"set",formatsJson:'[{"type":"example/color","properties":{"example/color-value":"blue"}}]'},targets:[{block:"custom-p",start:"0",end:"7"}]}));
  const restored=profile.restoreEditor(editor.checkpointJson());equal(restored.documentJson(),editor.documentJson());exec(restored,{kind:"undo"},"undo");equal(restored.documentJson().includes("gold"),true);
  restored.dispose();editor.dispose();profile.dispose();
 });
});

test("table axes, merge/split, headers, width, navigation and clear retain exact undo",async({page})=>{
 await page.evaluate(()=>{
  const {equal,boot,exec,roundtrip,action,grid,grow,p,cell}=window.contract,{profile,editor}=boot();grow(editor);
  roundtrip(editor,action("moveTableRow",{table:"t",row:"r2",before:"r"}));
  roundtrip(editor,action("moveTableColumn",{table:"t",column:"c2",before:"c"}));
  exec(editor,grid("r2","c2","r","c"),"selection");
  roundtrip(editor,action("mergeTableCells",{merge:"m1",replica:"1",counter:"0",lamport:"1"}));
  equal(editor.view().tables[0].cells[0].rowSpan,2);equal(editor.view().tables[0].cells[0].sources.length,4);
  roundtrip(editor,action("setTableHeader",{header:true}));roundtrip(editor,action("resizeTableColumn",{table:"t",column:"c2",width:220}));
  exec(editor,action("navigateGrid",{movement:"next",extend:false}),"unchanged");
  roundtrip(editor,action("clearTableCells",{emptyBlocks:["e0","e1","e2","e3"]}));
  exec(editor,{kind:"undo"},"undo");equal(editor.documentJson().includes("fourth"),true);
  roundtrip(editor,action("splitTableCell",{cell:{table:"t",row:"r2",column:"c2"}}));
  roundtrip(editor,action("deleteTableRow",{table:"t",row:"r2"}));roundtrip(editor,action("deleteTableColumn",{table:"t",column:"c2"}));
  roundtrip(editor,action("insertTable",{position:{parent:{kind:"document"},before:null},table:{block:"new-table",table:"t2",columns:[{id:"nc",width:100}],rows:[{block:"nr-block",id:"nr",cells:[cell("nc-block","nc",p("np","new table"))]}]}}));
  roundtrip(editor,action("deleteTable",{table:"t2",replacement:null}));
  roundtrip(editor,action("deleteTable",{table:"t",replacement:p("fallback","after table")}));equal(editor.view().tables.length,0);
  const restored=profile.restoreEditor(editor.checkpointJson());exec(restored,{kind:"undo"},"undo");equal(restored.view().tables.length,1);
  restored.dispose();editor.dispose();profile.dispose();
 });
});

test("image metadata, caption, replace, insert and delete use the real rich owner",async({page})=>{
 await page.evaluate(()=>{
  const {equal,boot,exec,roundtrip,action,p}=window.contract,{profile,editor}=boot();
  exec(editor,{kind:"setSelection",selection:{kind:"node",block:"image-block"}},"selection");
  roundtrip(editor,action("setImageAlt",{image:"image",alt:{kind:"description",text:"New diagram"}}));
  roundtrip(editor,action("resizeImage",{image:"image",size:{width:320,height:240}}));
  roundtrip(editor,action("replaceImage",{image:"image",asset:"asset2",generation:"gen2"}));
  roundtrip(editor,action("setImageCaption",{image:"image",caption:{block:"caption2",text:"Caption 🙂",formatsJson:"[]"}}));
  roundtrip(editor,action("setImageCaption",{image:"image",caption:null}));roundtrip(editor,action("resizeImage",{image:"image",size:null}));
  roundtrip(editor,action("setImageAlt",{image:"image",alt:{kind:"decorative"}}));
  roundtrip(editor,action("insertImage",{position:{parent:{kind:"document"},before:null},image:{block:"new-image-block",image:"new-image",asset:"asset3",generation:"gen3",alt:{kind:"description",text:"New image"},size:null,caption:{block:"new-caption",text:"New caption",formatsJson:"[]"}}}));
  roundtrip(editor,action("deleteImage",{image:"image",replacement:null}));roundtrip(editor,action("deleteImage",{image:"new-image",replacement:p("image-slot","after image")}));
  const restored=profile.restoreEditor(editor.checkpointJson());equal(restored.documentJson(),editor.documentJson());restored.dispose();editor.dispose();profile.dispose();
 });
});

test("rich flow, nested lists, formatting, Enter and deletion share one owner",async({page})=>{
 await page.evaluate(()=>{
  const {equal,boot,exec,roundtrip,action,p,select}=window.contract,{profile,editor}=boot();
  roundtrip(editor,action("insertBlocks",{position:{parent:{kind:"document"},before:null},blocks:[p("first","one🙂"),p("second","two"),p("third","three")]}));
  exec(editor,select("first",5),"selection");
  const formats='[{"type":"breditor/strong","properties":{}}]';
  roundtrip(editor,action("setInlineFormat",{change:{kind:"set",formatsJson:formats},targets:[{block:"first",start:"0",end:"5"},{block:"second",start:"0",end:"3"}]}));
  roundtrip(editor,action("splitTextBlock",{point:{block:"first",offset:"5",affinity:"after"},right:"first-right",rightHeading:null}));equal(editor.view().pendingFormatsJson,formats);
  roundtrip(editor,action("joinTextBlocks",{left:"first",right:"first-right"}));
  roundtrip(editor,action("wrapList",{first:"first",last:"third",container:"list",items:["i1","i2","i3"],start:null}));
  roundtrip(editor,action("setListKind",{list:"list",start:3}));
  roundtrip(editor,action("indentListItems",{container:"list",first:"i2",last:"i3",nested:{block:"nested",start:4}}));
  roundtrip(editor,action("outdentListItems",{container:"nested",first:"i2",last:"i3",tail:null}));
  roundtrip(editor,action("splitListItem",{point:{block:"first",offset:"5",affinity:"after"},newItem:"i-new",right:"item-right",rightHeading:null}));
  roundtrip(editor,action("joinListItems",{container:"list",left:"i1",right:"i-new"}));roundtrip(editor,action("unwrapList",{list:"list"}));
  roundtrip(editor,action("replaceBlocks",{first:"second",last:"third",blocks:[p("replacement","replaced")]}));
  roundtrip(editor,action("insertFormattedText",{text:"X",formatsJson:formats}));
  roundtrip(editor,action("setInlineFormat",{change:{kind:"remove",format:"breditor/strong"},targets:[{block:"first",start:"0",end:"6"}]}));
  exec(editor,select("first",1,3),"selection");roundtrip(editor,{kind:"deleteSelection"});equal(editor.documentJson().includes("o🙂X"),true);
  editor.dispose();profile.dispose();
 });
});

test("clipboard inline, grid and whole flow pastes preserve active spans with fresh IDs",async({page})=>{
 await page.evaluate(()=>{
  const {equal,boot,exec,roundtrip,action,select,grid,grow}=window.contract,{profile,editor}=boot();
  equal(editor.clipboard(),null);exec(editor,select("p",1,3),"selection");const inline=editor.clipboard();equal(inline.plainText,"🙂");
  exec(editor,select("p",4),"selection");roundtrip(editor,action("pasteInlineClipboard",{clipboardJson:inline.structuredJson}));
  grow(editor);exec(editor,grid("r","c","r2","c2"),"selection");
  roundtrip(editor,action("mergeTableCells",{merge:"m1",replica:"1",counter:"0",lamport:"1"}));
  const copy=editor.clipboard(),before=editor.documentJson();equal(copy.kind,"grid");equal(editor.documentJson(),before);
  roundtrip(editor,action("pasteGridClipboard",{clipboardJson:copy.structuredJson,allocation:{prefix:"paste1",replica:"1",counter:"1",lamport:"2"}}));
  equal(editor.view().tables[0].cells[0].sources.length,4);equal(editor.documentJson().includes('"breditor/asset-id":"asset"'),true);
  roundtrip(editor,action("pasteFlowClipboard",{clipboardJson:copy.structuredJson,position:{parent:{kind:"document"},before:null},allocation:{prefix:"paste2",replica:"1",counter:"2",lamport:"3"}}));
  equal(editor.view().tables.length,2);equal(editor.view().tables[1].cells[0].rowSpan,2);
  const restored=profile.restoreEditor(editor.checkpointJson());equal(restored.documentJson(),editor.documentJson());restored.dispose();editor.dispose();profile.dispose();
 });
});

test("invalid commands and foreign observations cannot partially publish",async({page})=>{
 await page.evaluate(()=>{
  const {equal,boot,exec,select}=window.contract,{profile,editor}=boot();exec(editor,select("p",1),"selection");const before=editor.checkpointJson();
  for(const input of ['{"kind":"undo","text":null}','{"kind":"insertPlainText","text":"a","text":"b"}',{kind:"setPendingFormats"},{kind:"resizeImage",data:{image:"image",size:{width:0,height:10}}},{kind:"setSelection",selection:{kind:"text",anchor:{block:"p",offset:1,affinity:"after"},focus:{block:"p",offset:"1",affinity:"after"}}}]){
   let failed=false;try{editor.execute(input);}catch{failed=true;}equal(failed,true);equal(editor.checkpointJson(),before);
  }
  const rawProfileResult=window.rich.wasm.BreditorRichProfile.fromBootstrapJson(JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/rich-browser",version:1},extensions:[]}));
  const rawProfile=rawProfileResult.takeProfile();rawProfileResult.free();
  const aResult=rawProfile.createEditor(editor.documentJson(),"100"),bResult=rawProfile.createEditor(editor.documentJson(),"100"),a=aResult.takeEditor(),b=bResult.takeEditor();aResult.free();bResult.free();
  const observation=a.observe(),result=b.execute(observation,'{"kind":"undo"}');equal(result.status,"error");const error=result.error;equal(error.code,"breditor_rich.stale_observation");error.free();result.free();observation.free();a.free();b.free();rawProfile.free();
  editor.dispose();profile.dispose();
 });
});

test("repeated typed edits and branch recovery stay Unicode exact",async({page})=>{
 await page.evaluate(()=>{
  const {equal,boot,exec,select}=window.contract,{profile,editor}=boot();exec(editor,select("p",4),"selection");
  const initial=editor.documentJson();for(let i=0;i<30;i++)exec(editor,{kind:"insertPlainText",text:i%2===0?"🙂":"é"});
  const final=editor.documentJson(),restored=profile.restoreEditor(editor.checkpointJson());
  for(let i=0;i<30;i++)exec(restored,{kind:"undo"},"undo");equal(restored.documentJson(),initial);
  const future=profile.restoreEditor(restored.checkpointJson());for(let i=0;i<30;i++)exec(future,{kind:"redo"},"redo");equal(future.documentJson(),final);
  future.dispose();restored.dispose();editor.dispose();profile.dispose();
 });
});

test("host-saved checkpoint restores its redo branch after an actual page reload",async({page})=>{
 const expected=await page.evaluate(()=>{
  const {boot,exec,select}=window.contract,{profile,editor}=boot();exec(editor,select("p",4),"selection");exec(editor,{kind:"insertPlainText",text:"saved 🙂"});const expected=editor.documentJson();exec(editor,{kind:"undo"},"undo");localStorage.setItem("rich-checkpoint",editor.checkpointJson());editor.dispose();profile.dispose();return expected;
 });
 await page.reload();await expect(page.locator("#status")).toHaveText("Ready");
 const actual=await page.evaluate(()=>{
  const profile=window.rich.compileRichProfile(window.rich.wasm,JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:6,schema:{name:"example/rich-browser",version:1},extensions:[]}));
  const editor=profile.restoreEditor(localStorage.getItem("rich-checkpoint"));if(editor.execute({kind:"redo"})!=="redo")throw Error("redo branch missing");const actual=editor.documentJson();editor.dispose();profile.dispose();localStorage.removeItem("rich-checkpoint");return actual;
 });
 expect(actual).toBe(expected);
});
