// Raw generated getter/lifetime probe. No browser editor, renderer or history.
import initialize, * as wasm from "@breditor/wasm";
// The runner supplies exact inspected bridge source from the retained control.
// @ts-expect-error Generated private diagnostic module has no public declarations.
import {bridgeInvoke} from "./bridge.js";
import {decodeChildCountWords} from "./word-count.js";
// Copied from the current browser source by the runner, with its hash recorded.
import {decodeProjectionScalarWords, decodeProjectionIntegerWords} from "./projection_scalar_words.js";
// Copied private production helper; enabled only by an explicit u32-only trial.
import {projectionU32sEqual} from "./projection_u32_identity.js";
const output = document.getElementById("result")!;
let progress = "initialization", checks = 0;
const ownerRepetitions = 30;
const getterSequence: string = "all";
const walkRepetitions = 1;
const keepProjectionOwners = false;
const treeShape: string = "nested";
const wordChildCountTransport = false;
const packedWordRouting = false;
const allWordScalars = false;
const enrichedScalars = false;
const integerProperties = false;
const u32KeyComparison = false;
const propertyValues = [-9007199254740991, -4294967296, -5, 0, 1193046, 4294967295, 4294967296, 9007199254740991];
let propertyCursor = 0;
const retainedOwners:Array<wasm.BreditorEngine|wasm.BreditorProjection>=[];
function same(actual: unknown, expected: unknown, label: string): void {
  checks++;
  // Fixture references are finite safe integers, strings or undefined.
  // Preserve zero-sign equivalence while avoiding the observed strict-equality
  // rejection of two captured 1146s (whose SameValue comparison was true).
  const equal = u32KeyComparison && (typeof actual === "number" || typeof expected === "number")
    ? projectionU32sEqual(actual,expected)
    : Object.is(actual,expected) || (Object.is(expected,0) && Object.is(actual,-0));
  if (!equal) {
    const scalar = (value: unknown) => ({type: typeof value,
      spelling: typeof value === "number" || typeof value === "string" ? String(value).slice(0,256) : undefined});
    throw Error(JSON.stringify({progress,label,actual:scalar(actual),expected:scalar(expected),sameValue:Object.is(actual,expected)}));
  }
}
function using<T extends {free(): void}, R>(handle: T | undefined, action: (value:T)=>R):R {
  if (!handle) throw Error("Missing handle: " + progress);
  try {return action(handle);} finally {
    if(keepProjectionOwners&&(handle instanceof wasm.BreditorEngine||handle instanceof wasm.BreditorProjection))retainedOwners.push(handle);
    else handle.free();
  }
}
type Format = {type:string;properties:Record<string,number>};
type Node = {kind:"text";text:string;formats:Format[]} | {kind:"element";type:string;entityId:null;properties:Record<string,number>;children:Node[]};
const element = (type:string,children:Node[],properties:Record<string,number>={}):Node => ({kind:"element",type:`breditor/${type}`,entityId:null,properties,children});
const paragraph = (text:string,heading=false):Node => element(heading?"heading":"paragraph",[{kind:"text",text,
  formats:integerProperties?[{type:"example/signed",properties:{"example/value":propertyValues[propertyCursor++%propertyValues.length]!}}]:
    enrichedScalars?[{type:"breditor/strong",properties:{}}]:[]}],heading?{"breditor/level":2}:{});
function tree(items:number):Node {
  if(treeShape==="paragraphs")return element("document",Array.from({length:items},(_,index)=>paragraph(`Item ${index}: A🙂`)));
  return element("document",[element("ordered-list",Array.from({length:items},(_,index)=>element("list-item",[
    paragraph(`Item ${index}: A🙂`,treeShape==="nested"&&index%10===0),
    ...(treeShape==="nested"&&index%10===0?[element("bullet-list",[element("list-item",[
      paragraph(`Child ${index}`),element("ordered-list",[element("list-item",[paragraph(`Grandchild ${index}`)])],{"breditor/start":4}),
    ])])]:[]),
  ])),{"breditor/start":7})]);
}
function rows(root:Node):Array<{node:Node;children:number[]}> {
  const result:Array<{node:Node;children:number[]}>=[];
  const visit=(node:Node):number=>{
    const index=result.length, row={node,children:[] as number[]};result.push(row);
    if(node.kind==="element")for(const child of node.children)row.children.push(visit(child));
    return index;
  };
  visit(root);
  for(let index=0;index<result.length;index++)for(const child of result[index]!.children) {
    if(!Number.isSafeInteger(child)||child<=index||child>=result.length)throw Error("Invalid expected fixture index");
  }
  return result;
}
void run().catch(error=>{output.textContent=JSON.stringify({progress,error:String(error),checks:String(checks),
  childCountTrace:(wasm as unknown as {breditorChildCountTrace?:()=>unknown}).breditorChildCountTrace?.(),
  rustChildCountTrace:(wasm as unknown as {debugLastProjectionChildCount?:()=>string}).debugLastProjectionChildCount?.()});output.dataset["status"]="failed";});
async function run():Promise<void> {
  await initialize();
  const schema={name:"example/getter-probe",version:1};
  const extensions=integerProperties?[{id:{name:"example/signed-extension",version:1},dependencies:[],conflicts:[],
    inlineFormats:[{kind:"example/signed",revision:1}],inlineFormatPropertyContracts:[{formatKind:"example/signed",properties:[
      {name:"example/value",presence:"required",valueType:{kind:"integer",minimum:-9007199254740991,maximum:9007199254740991}}
    ]}],inlineFormatToggles:[],inlineFormatSets:[]}]:[];
  const profile=using(wasm.BreditorCompiledProfile.fromBootstrapJsonV5(JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:5,schema,extensions})),result=>{
    same(result.status,"profile","profile status");return result.takeProfile();
  });
  if(!profile)throw Error("Missing profile");
  let retainedOwnerCount=0;
  try {
    const fingerprint=using(profile.descriptor(),descriptor=>descriptor.schemaFingerprint);
    for(const items of [10,100,500])for(let repetition=0;repetition<ownerRepetitions;repetition++) {
      progress=`${items} items, owner ${repetition}`;
      const root=tree(items);
      if(enrichedScalars&&root.kind==="element")root.children.push(element("paragraph",[]));
      const expected=rows(root);
      using(using(profile.createEngineFromDocumentJsonV7(`getter-${items}-${repetition}`,JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint:fingerprint,root}),20),result=>{
        same(result.status,"engine","engine status");return result.takeEngine();
      }),engine=>{
        using(engine.observation(),observation=>using(engine.projection(observation),result=>using(result.takeProjection(),view=>{
          const methods={childAt:view.childAt,nodeKind:view.nodeKind,elementType:view.elementType,childCount:view.childCount,
            text:view.text,formatCount:view.formatCount,formatType:view.formatType,formatPropertyCount:view.formatPropertyCount,formatPropertyName:view.formatPropertyName,
            formatPropertyInteger:view.formatPropertyInteger,formatPropertyValueKind:view.formatPropertyValueKind,
            formatPropertyBoolean:view.formatPropertyBoolean,formatPropertyString:view.formatPropertyString,
            headingLevel:view.headingLevel,listKind:view.listKind,orderedListStart:view.orderedListStart};
          if(wordChildCountTransport){
            const decodeScalar=packedWordRouting?decodeProjectionScalarWords:decodeChildCountWords;
            if(packedWordRouting){
              const versions=view as unknown as Record<string,unknown>;
              same(versions["projectionScalarWordsVersion"],1,"packed scalar word version");
              same(versions["projectionIntegerWordsVersion"],1,"packed integer word version");
            }
            const wordGetter=(view as wasm.BreditorProjection & {childCountWords(index:number):Uint32Array}).childCountWords;
            if(typeof wordGetter!=="function")throw Error("Missing word-count transport");
            methods.childCount=function(index:number){return decodeScalar(bridgeInvoke(wordGetter,view,index));};
            if(allWordScalars){
              const api=view as unknown as Record<string,(...args:number[])=>Uint32Array>;
              const one=(name:string)=>{const getter=api[name];if(typeof getter!=="function")throw Error("Missing word scalar: "+name);return (index:number)=>decodeScalar(bridgeInvoke(getter,view,index));};
              const two=(name:string)=>{const getter=api[name];if(typeof getter!=="function")throw Error("Missing word scalar: "+name);return (index:number,ordinal:number)=>decodeScalar(bridgeInvoke(getter,view,index,ordinal));};
              methods.childAt=two("childAtWords");methods.formatCount=one("formatCountWords");
              methods.headingLevel=one("headingLevelWords");methods.orderedListStart=one("orderedListStartWords");
              methods.formatPropertyCount=two("formatPropertyCountWords");
              if(packedWordRouting){
                const integerGetter=api["formatPropertyIntegerWords"];
                if(typeof integerGetter!=="function")throw Error("Missing packed integer words");
                methods.formatPropertyInteger=(index:number,ordinal:number,property:number)=>
                  decodeProjectionIntegerWords(bridgeInvoke(integerGetter,view,index,ordinal,property));
              }
            }
          }
          same(view.nodeCount,expected.length,"node count");same(view.rootIndex,0,"root index");
          for(let walk=0;walk<walkRepetitions;walk++)for(const reverse of [false,true])for(let ordinal=0;ordinal<expected.length;ordinal++) {
            const index=reverse?expected.length-ordinal-1:ordinal, row=expected[index]!,node=row.node;
            progress=`${items} items, owner ${repetition}, walk ${walk}, ${reverse?"backward":"forward"} node ${index}`;
            if(getterSequence!=="child-count") {
              same(bridgeInvoke(methods.nodeKind,view,index),node.kind,"node kind");
              same(bridgeInvoke(methods.elementType,view,index),node.kind==="element"?node.type:undefined,"element type");
            }
            same(bridgeInvoke(methods.childCount,view,index),node.kind==="element"?row.children.length:undefined,"child count");
            if(getterSequence!=="all")continue;
            same(bridgeInvoke(methods.text,view,index),node.kind==="text"?node.text:undefined,"text");
            same(bridgeInvoke(methods.formatCount,view,index),node.kind==="text"?node.formats.length:undefined,"format count");
            if(enrichedScalars){
              const formats=node.kind==="text"?node.formats:[];
              for(let format=0;format<=formats.length;format++){
                same(bridgeInvoke(methods.formatType,view,index,format),formats[format]?.type,"format type or absence");
                const properties=Object.entries(formats[format]?.properties??{});
                same(bridgeInvoke(methods.formatPropertyCount,view,index,format),formats[format]===undefined?undefined:properties.length,"format property count or absence");
                for(let property=0;property<=properties.length;property++) {
                  same(bridgeInvoke(methods.formatPropertyName,view,index,format,property),properties[property]?.[0],"property name or absence");
                  if(integerProperties) {
                    same(bridgeInvoke(methods.formatPropertyValueKind,view,index,format,property),properties[property]===undefined?undefined:"integer","integer kind or absence");
                    same(bridgeInvoke(methods.formatPropertyInteger,view,index,format,property),properties[property]?.[1],"exact signed integer or absence");
                    same(bridgeInvoke(methods.formatPropertyBoolean,view,index,format,property),undefined,"integer is not boolean");
                    same(bridgeInvoke(methods.formatPropertyString,view,index,format,property),undefined,"integer is not string");
                  }
                }
              }
            }
            same(bridgeInvoke(methods.headingLevel,view,index),node.kind==="element"?node.properties["breditor/level"]:undefined,"heading level");
            same(bridgeInvoke(methods.listKind,view,index),node.kind==="element"&&node.type==="breditor/ordered-list"?"ordered":node.kind==="element"&&node.type==="breditor/bullet-list"?"bullet":undefined,"list kind");
            same(bridgeInvoke(methods.orderedListStart,view,index),node.kind==="element"?node.properties["breditor/start"]:undefined,"ordered start");
            for(let child=0;child<=row.children.length;child++)same(bridgeInvoke(methods.childAt,view,index,child),row.children[child],"child index or absent sentinel");
          }
        })));
      });
      await new Promise<void>(resolve=>setTimeout(resolve,4));
    }
  }finally{
    retainedOwnerCount=retainedOwners.length;
    try {
      const failures:unknown[]=[];
      for(const owner of retainedOwners.splice(0))try{owner.free();}catch(error){failures.push(error);}
      if(failures.length)throw new AggregateError(failures,"retained fixture owner cleanup failed");
    }finally{profile.free();}
  }
  output.textContent=JSON.stringify({checks:String(checks),owners:String(3*ownerRepetitions),retainedOwnerCount:String(retainedOwnerCount),cleanupCompleted:true,result:"passed"});output.dataset["status"]="passed";
}
