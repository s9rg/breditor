// Test data only: source-cell identity/AST order deliberately differ from rendered merge order.
export const element=(type,id,children=[])=>({kind:"element",type:`breditor/${type}`,entityId:null,properties:{"breditor/block-id":id},children});
export const paragraph=(id,text)=>element("paragraph",id,text?[{kind:"text",text,formats:[]}]:[]);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function coverageSeed(binding){
 const image=element("image","image",[paragraph("caption","xy🙂")]);Object.assign(image.properties,{"breditor/image-id":"img","breditor/asset-id":"asset","breditor/asset-generation":"gen","breditor/decorative":false,"breditor/alt-text":"Diagram"});
 const table=element("table","table",Array.from({length:3},(_,r)=>{const row=element("table-row",`row-${r}`,Array.from({length:4},(_,c)=>{const cell=element("table-cell",`cell-${r}-${c}`,[paragraph(`p-${r}-${c}`,"a🙂b"),...(r===2&&c===1?[image]:[])]);Object.assign(cell.properties,{"breditor/column-id":`c${c}`,"breditor/header":r===0});return cell;}));row.properties["breditor/row-id"]=`r${r}`;return row;}));
 Object.assign(table.properties,{"breditor/table-id":"t","breditor/columns":Array.from({length:4},(_,c)=>({id:`c${c}`,width:100})),"breditor/merges":[{id:"m",lamport:"1",writer:"1",counter:"1",rows:["r0","r1","r2"],columns:["c0","c1","c2","c3"],"first-row":"r0","last-row":"r1","first-column":"c0","last-column":"c1"}],"breditor/retracted-merges":[]});
 const hidden=structuredClone(table);hidden.properties["breditor/block-id"]="hidden";hidden.properties["breditor/table-id"]="hidden-t";hidden.properties["breditor/merges"]=[];hidden.children=[];
 const task=element("task-item","task",[paragraph("task-head","Task")]);task.properties["breditor/checked"]=true;
 const root=element("document","unused",[element("horizontal-rule","lead"),paragraph("z-intro","a🙂b"),table,element("blockquote","quote",[paragraph("q1","Quote"),paragraph("q2","Tail")]),element("bullet-list","list",[element("list-item","item",[paragraph("head","Head"),element("bullet-list","nested",[element("list-item","nested-item",[paragraph("nested-text","Nested")])])])]),element("task-list","tasks",[task]),paragraph("empty",""),element("code-block","code",[{kind:"text",text:"plain\ncode",formats:[]}]),element("horizontal-rule","tail"),hidden]);
 root.properties={"breditor/document-id":"room"};
 return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root:canonical(root)});
}
export const point=(block,offset="0")=>({block,offset:String(offset),affinity:"after"});
export const range=(a,x,b=a,y=x)=>({kind:"text",anchor:point(a,x),focus:point(b,y)});
export const grid=(row="r1",column="c1")=>{const c={table:"t",row,column};return {kind:"grid",anchor:c,focus:c};};
