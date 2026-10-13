// Real generated Rust/Wasm producer plus source validator; no editor/DOM routing.
import initialize,* as api from "@probe/wasm";
import {sessionCheckpointJsonMatchesDurableContract,consumeWasmSessionCheckpoint} from "../../../packages/breditor-browser/src/wasm_session_checkpoint.ts";
import {preflightNestedListWasmSemanticProfile,bootstrapNestedListWasmEngine} from "../../../packages/breditor-browser/src/wasm_engine_bootstrap.ts";
import {BreditorNestedListWasmCommandAdapter,contentReadPortsForAdapter} from "../../../packages/breditor-browser/src/wasm_command_adapter.ts";
import {BreditorDomRenderer} from "../../../packages/breditor-browser/src/dom_renderer.ts";
import {BreditorNestedListDomSelectionBridge} from "../../../packages/breditor-browser/src/dom_selection.ts";
import {compileBrowserPresentation} from "../../../packages/breditor-browser/src/compiled_browser_presentation.ts";
import {createInlineFormatRenderManifest} from "../../../packages/breditor-browser/src/inline_format_render_manifest.ts";
import {nestedListCommandRequest,preserveSelectionSync} from "../../../packages/breditor-browser/src/editor_command.ts";

const output=document.getElementById("result"),schema={name:"example/producer-validator",version:1};
const properties=[
  {name:"example/href",presence:"required",valueType:{kind:"string",minimumUtf8Bytes:1,maximumUtf8Bytes:2048}},
  {name:"example/open-in-new-window",presence:"required",valueType:{kind:"boolean"}},
];
const color=[{name:"example/rgb24",presence:"required",valueType:{kind:"integer",minimum:0,maximum:16777215}}];
const bootstrap={format:"breditor/profile-bootstrap",formatVersion:5,schema,extensions:[{
  id:{name:"example/annotation-extension",version:1},dependencies:[],conflicts:[],
  inlineFormats:[{kind:"example/link",revision:1},{kind:"example/text-color",revision:1}],
  inlineFormatPropertyContracts:[{formatKind:"example/link",properties},{formatKind:"example/text-color",properties:color}],
  inlineFormatToggles:[],inlineFormatSets:[],
}]};
const formats=[{type:"breditor/strong",properties:{}},
  {type:"example/link",properties:{"example/href":"https://example.test/","example/open-in-new-window":false}},
  {type:"example/text-color",properties:{"example/rgb24":0x123456}}];
const element=(type,children,properties={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties,children});
const text=value=>({kind:"text",text:value,formats});
let progress="initialization",checks=0,bootstrapChecks=0,adapterChecks=0,failureInput;
function assert(value,message){if(!value)throw Error(message);}
function take(result,status,method){try{assert(result.status===status,`${method}: invalid result status`);const value=result[method]();assert(value!==undefined,`${method}: absent`);return value;}finally{result.free();}}
function string(result){return take(result,"value","takeValue");}
function command(engine,run){const observation=engine.observation();try{const result=run(observation);try{assert(result.status==="committed",`command: ${result.status}`);}finally{result.free();}}finally{observation.free();}}

async function run(){
  await initialize();
  const preflight=preflightNestedListWasmSemanticProfile(api,{bootstrapJson:JSON.stringify(bootstrap),formatVersion:5});
  assert(preflight.ok,"runtime profile preflight failed");
  const capturedContract=Object.freeze({mode:"v7",schema:preflight.profileDescriptor.schema,formats:preflight.profileDescriptor.formats});
  const profile=take(api.BreditorCompiledProfile.fromBootstrapJsonV5(JSON.stringify(bootstrap)),"profile","takeProfile");
  try{
    const descriptor=profile.descriptor();let fingerprint;
    try{fingerprint=descriptor.schemaFingerprint;}finally{descriptor.free();}
    const contract={mode:"v7",schema:{...schema,fingerprint},formats:[
      {kind:"breditor/strong",revision:1,properties:[]},
      {kind:"example/link",revision:1,properties},
      {kind:"example/text-color",revision:1,properties:color},
    ]};
    const check=(engine,stage,expectedCursor)=>{
      progress=stage;const checkpoint=string(engine.sessionCheckpointJson());
      const bytes=sessionCheckpointJsonMatchesDurableContract(checkpoint,contract),expectedBytes=new TextEncoder().encode(checkpoint).length;
      if(bytes!==expectedBytes){failureInput={checkpointJson:checkpoint,contract,bytes,expectedBytes};throw Error("producer checkpoint rejected by source validator");}
      const capturedBytes=sessionCheckpointJsonMatchesDurableContract(checkpoint,capturedContract);
      if(capturedBytes!==expectedBytes){failureInput={checkpointJson:checkpoint,contract:capturedContract,bytes:capturedBytes,expectedBytes};throw Error("producer checkpoint rejected by captured runtime contract");}
      const observation=engine.observation();let reader;
      try{reader=consumeWasmSessionCheckpoint({lineage:observation.snapshotLineage,revision:observation.snapshotRevision},engine.sessionCheckpointJson(),[engine,observation,profile],capturedContract);}
      finally{observation.free();}
      assert(reader.ok,"owned checkpoint reader rejected producer result");
      assert(reader.checkpoint.checkpointJson===checkpoint&&reader.checkpoint.checkpointUtf8Bytes===expectedBytes,"owned checkpoint reader changed bytes");
      const parsed=JSON.parse(checkpoint);assert(parsed.cursor===expectedCursor,"history cursor mismatch");checks++;return checkpoint;
    };
    for(const items of [10,100,500])for(let repetition=0;repetition<3;repetition++){
      progress=`${items}/${repetition}: create`;
      const root=element("document",[element("ordered-list",Array.from({length:items},(_,i)=>element("list-item",[
        element(i%10===0?"heading":"paragraph",[text(`Item ${i}: A🙂`)],i%10===0?{"breditor/level":2}:{}),
        ...(i%10===0?[element("bullet-list",[element("list-item",[
          element("paragraph",[text(`Child ${i}`)]),
          element("ordered-list",[element("list-item",[element("paragraph",[text(`Grandchild ${i}`)])])],{"breditor/start":4}),
        ])])]:[]),
      ])),{"breditor/start":7})]);
      const documentPayload={format:"breditor/document",formatVersion:2,schema,schemaFingerprint:fingerprint,root};
      const engine=take(profile.createEngineFromDocumentJsonV7(`producer-${items}-${repetition}`,JSON.stringify(documentPayload),20),"engine","takeEngine");
      let restored;
      try{
        check(engine,`${items}/${repetition}: initial`,0);
        const observation=engine.observation();let projection,result;
        let target=-1,parent=-1;const middle=Math.floor(Math.floor(items/2)/10)*10;
        try{result=engine.projection(observation);projection=result.takeProjection();assert(projection,"projection absent");
          for(let i=0;i<projection.nodeCount;i++)if(projection.text(i)===`Grandchild ${middle}`){target=i;break;}
          assert(target>=0,"target text missing");
          for(let i=0;i<projection.nodeCount;i++)if(projection.elementType(i)==="breditor/paragraph"){
            const child=projection.childAtWords(i,0);if(child.length===2&&child[0]===1&&child[1]===target){parent=i;break;}
          }
        }finally{projection?.free();result?.free();observation.free();}
        assert(parent>=0,"target paragraph missing");
        command(engine,o=>engine.setRangeSelection(o,"children",parent,1,"before","children",parent,1,"before"));
        check(engine,`${items}/${repetition}: selection`,0);
        command(engine,o=>engine.executeStringAction(o,"breditor/insert-nested-list-text","X",false));
        check(engine,`${items}/${repetition}: insert`,1);
        command(engine,o=>engine.undo(o,false));const backup=check(engine,`${items}/${repetition}: undo`,0);
        progress=`${items}/${repetition}: browser bootstrap restore`;
        const bootstrapped=bootstrapNestedListWasmEngine(api,{kind:"sessionCheckpoint",checkpointJson:backup,semanticProfile:{bootstrapJson:JSON.stringify(bootstrap),formatVersion:5}});
        assert(bootstrapped.ok,"browser bootstrap restore rejected checkpoint");
        let adapter,renderer,rendered;const host=document.createElement("div"),bridge=new BreditorNestedListDomSelectionBridge();document.body.append(host);
        try{
          const read=consumeWasmSessionCheckpoint({lineage:bootstrapped.observation.snapshotLineage,revision:bootstrapped.observation.snapshotRevision},bootstrapped.engine.sessionCheckpointJson(),[bootstrapped.engine,bootstrapped.observation,bootstrapped.profileGeneration],{mode:"v7",schema:bootstrapped.profileDescriptor.schema,formats:bootstrapped.profileDescriptor.formats});
          assert(read.ok&&read.checkpoint.checkpointJson===backup,"forwarding owner checkpoint mismatch");bootstrapChecks++;
          const manifest=createInlineFormatRenderManifest({recipes:[
            {formatKind:"breditor/strong",element:"strong"},
            {formatKind:"example/link",element:"a",classes:["breditor-link"],attributes:{kind:"safeLinkV1",hrefProperty:"example/href",openInNewWindowProperty:"example/open-in-new-window"}},
            {formatKind:"example/text-color",element:"span",classes:["breditor-text-color"],attributes:{kind:"safeTextColorV1"}},
          ]});
          renderer=new BreditorDomRenderer(compileBrowserPresentation(bootstrapped.profileGeneration,bootstrapped.profileDescriptor,manifest));
          const initial=renderer.renderNestedList(host,bootstrapped.projection);assert(initial.ok,"adapter initial render failed");rendered=initial.value.rendered;
          adapter=new BreditorNestedListWasmCommandAdapter(bootstrapped.engine,bootstrapped.observation,{durableMode:"v7",profileGeneration:bootstrapped.profileGeneration,profileDescriptor:bootstrapped.profileDescriptor,renderer,rendered,selectionBridge:bridge});
          const ports=contentReadPortsForAdapter(adapter);assert(ports,"adapter read ports absent");
          for(const operation of ["initial","redo","undo"]){
            progress=`${items}/${repetition}: adapter ${operation}`;
            if(operation!=="initial")assert(adapter.execute(nestedListCommandRequest(adapter.deliveryToken(),preserveSelectionSync(),{kind:"api",detail:operation},{kind:"history",operation})).command.status==="committed","adapter history failed");
            const checkpoint=ports.sessionCheckpointJson.read();assert(checkpoint?.ok,"adapter checkpoint read failed");
            assert(JSON.parse(checkpoint.checkpoint.checkpointJson).cursor===(operation==="redo"?1:0),"adapter checkpoint cursor mismatch");
            assert(adapter.rendered.validateCanonicalDom(),"adapter canonical render drift");adapterChecks++;
          }
        }finally{
          if(adapter)adapter.dispose();else{if(rendered)renderer.releaseNestedList(rendered);bootstrapped.observation.free();bootstrapped.profileGeneration.free();}
          bridge.dispose();bootstrapped.engine.free();host.remove();
        }
        command(engine,o=>engine.redo(o,false));check(engine,`${items}/${repetition}: redo`,1);
        restored=take(profile.createEngineFromSessionCheckpointJsonV7(backup),"engine","takeEngine");
        assert(check(restored,`${items}/${repetition}: restore`,0)===backup,"checkpoint bytes changed on restore");
        command(restored,o=>restored.redo(o,false));check(restored,`${items}/${repetition}: restored redo`,1);
      }finally{restored?.free();engine.free();}
    }
    output.textContent=JSON.stringify({checks,sizes:[10,100,500],repetitions:3,stages:7,contractChecks:checks*2,readerChecks:checks,bootstrapChecks,adapterChecks,runtimeContractCaptured:true});output.dataset.status="passed";
  }finally{profile.free();}
}
void run().catch(error=>{output.textContent=JSON.stringify({progress,checks,error:String(error),failureInput});output.dataset.status="failed";});
