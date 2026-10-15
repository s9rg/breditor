import {seed,range} from "./seed.mjs";
export {range};
const text=(value)=>({kind:"text",text:value,formats:[]});
const element=(type,block,children,properties={})=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":block,...properties},children});
const paragraph=(block,value)=>element("paragraph",block,[text(value)]);
export function structuralSeed(binding){
 const doc=JSON.parse(seed(binding));
 doc.root.children[0].children[0].formats=[{type:"breditor/strong",properties:{}}];
 doc.root.children.push(
  element("blockquote","quote",[paragraph("quote-head","Quoted 🙂"),element("code-block","code",[text("let x = 1;\n\t🙂")],{"breditor/language":"Rust"})]),
  element("task-list","tasks",[
   element("task-item","task-a",[paragraph("task-a-head","Write 🙂 draft"),element("blockquote","task-quote",[paragraph("task-tail","Retain this tail")]),element("task-list","nested-tasks",[element("task-item","task-child",[paragraph("task-child-head","Nested check")],{"breditor/checked":false})])],{"breditor/checked":true}),
   element("task-item","task-b",[paragraph("task-b-head","Review")],{"breditor/checked":false})
  ]),element("horizontal-rule","rule",[]),paragraph("tail","End")
 );
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
 return JSON.stringify(canonical(doc));
}
