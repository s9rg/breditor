import root from "./root.json";
export function seed(binding){
 const content=structuredClone(root),paragraph=(id,text)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":id},children:[{kind:"text",text,formats:[]}]}),item=(id,text,tail=[])=>({kind:"element",type:"breditor/list-item",entityId:null,properties:{"breditor/block-id":id},children:[paragraph(`${id}-head`,text),...tail]}),list=(id,items)=>({kind:"element",type:"breditor/bullet-list",entityId:null,properties:{"breditor/block-id":id},children:items});
 content.children.unshift({kind:"element",type:"breditor/heading",entityId:null,properties:{"breditor/block-id":"intro","breditor/level":2},children:[{kind:"text",text:"SDK heading",formats:[]}]});
 content.children.push(list("ideas",[item("first","First idea"),item("second","Second idea",[list("nested",[item("deep","Nested idea")])])]));
 const canonical=value=>Array.isArray(value)?value.map(canonical):value!==null&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(content)});
}
export const range=(block,start,end=start)=>({kind:"text",anchor:{block,offset:String(start),affinity:"after"},focus:{block,offset:String(end),affinity:"after"}});
