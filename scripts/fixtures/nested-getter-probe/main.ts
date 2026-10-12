// Raw generated getter/lifetime probe. No browser editor, renderer or history.
import initialize, * as wasm from "@breditor/wasm";
// The runner supplies exact inspected bridge source from the retained control.
// @ts-expect-error Generated private diagnostic module has no public declarations.
import {bridgeInvoke} from "./bridge.js";
const output = document.getElementById("result")!;
let progress = "initialization", checks = 0;
const ownerRepetitions = 30;
const getterSequence: string = "all";
const walkRepetitions = 1;
function same(actual: unknown, expected: unknown, label: string): void {
  checks++;
  // Fixture references are finite unsigned integers, strings or undefined.
  // Preserve zero-sign equivalence while avoiding the observed strict-equality
  // rejection of two captured 1146s (whose SameValue comparison was true).
  const equal = Object.is(actual,expected) ||
    (Object.is(expected,0) && Object.is(actual,-0));
  if (!equal) {
    const scalar = (value: unknown) => ({type: typeof value,
      spelling: typeof value === "number" || typeof value === "string" ? String(value).slice(0,256) : undefined});
    throw Error(JSON.stringify({progress,label,actual:scalar(actual),expected:scalar(expected),sameValue:Object.is(actual,expected)}));
  }
}
function using<T extends {free(): void}, R>(handle: T | undefined, action: (value:T)=>R):R {
  if (!handle) throw Error("Missing handle: " + progress);
  try {return action(handle);} finally {handle.free();}
}
type Node = {kind:"text";text:string;formats:[]} | {kind:"element";type:string;entityId:null;properties:Record<string,number>;children:Node[]};
const element = (type:string,children:Node[],properties:Record<string,number>={}):Node => ({kind:"element",type:`breditor/${type}`,entityId:null,properties,children});
const paragraph = (text:string,heading=false):Node => element(heading?"heading":"paragraph",[{kind:"text",text,formats:[]}],heading?{"breditor/level":2}:{});
function tree(items:number):Node {
  return element("document",[element("ordered-list",Array.from({length:items},(_,index)=>element("list-item",[
    paragraph(`Item ${index}: A🙂`,index%10===0),
    ...(index%10===0?[element("bullet-list",[element("list-item",[
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
  const profile=using(wasm.BreditorCompiledProfile.fromBootstrapJsonV5(JSON.stringify({format:"breditor/profile-bootstrap",formatVersion:5,schema,extensions:[]})),result=>{
    same(result.status,"profile","profile status");return result.takeProfile();
  });
  if(!profile)throw Error("Missing profile");
  try {
    const fingerprint=using(profile.descriptor(),descriptor=>descriptor.schemaFingerprint);
    for(const items of [10,100,500])for(let repetition=0;repetition<ownerRepetitions;repetition++) {
      progress=`${items} items, owner ${repetition}`;
      const root=tree(items), expected=rows(root);
      using(using(profile.createEngineFromDocumentJsonV7(`getter-${items}-${repetition}`,JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint:fingerprint,root}),20),result=>{
        same(result.status,"engine","engine status");return result.takeEngine();
      }),engine=>{
        using(engine.observation(),observation=>using(engine.projection(observation),result=>using(result.takeProjection(),view=>{
          const methods={childAt:view.childAt,nodeKind:view.nodeKind,elementType:view.elementType,childCount:view.childCount,
            text:view.text,formatCount:view.formatCount,headingLevel:view.headingLevel,listKind:view.listKind,orderedListStart:view.orderedListStart};
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
            same(bridgeInvoke(methods.formatCount,view,index),node.kind==="text"?0:undefined,"format count");
            same(bridgeInvoke(methods.headingLevel,view,index),node.kind==="element"?node.properties["breditor/level"]:undefined,"heading level");
            same(bridgeInvoke(methods.listKind,view,index),node.kind==="element"&&node.type==="breditor/ordered-list"?"ordered":node.kind==="element"&&node.type==="breditor/bullet-list"?"bullet":undefined,"list kind");
            same(bridgeInvoke(methods.orderedListStart,view,index),node.kind==="element"?node.properties["breditor/start"]:undefined,"ordered start");
            for(let child=0;child<=row.children.length;child++)same(bridgeInvoke(methods.childAt,view,index,child),row.children[child],"child index or absent sentinel");
          }
        })));
      });
      await new Promise<void>(resolve=>setTimeout(resolve,4));
    }
    output.textContent=JSON.stringify({checks:String(checks),owners:String(3*ownerRepetitions),result:"passed"});output.dataset["status"]="passed";
  }finally{profile.free();}
}
