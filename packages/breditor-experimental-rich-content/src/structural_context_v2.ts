/** Read-only structural targeting shared by local and collaborative command preparation. */
import {id,selectedText,type ElementNode,type RichModel} from "./model.js";
export function nearestStructuralV2(model:RichModel,kind:string):ElementNode|undefined {
 const s=model.view.selection;let node=s?.kind==="node"?model.nodes.get(s.block):selectedText(model);
 while(node){if(node.type===`breditor/${kind}`)return node;node=model.parents.get(id(node));}return undefined;
}
export function replaceableFlowV2(model:RichModel,node:ElementNode):boolean {
 const parent=model.parents.get(id(node));if(!parent||parent.type==="breditor/image")return false;
 if((parent.type==="breditor/list-item"||parent.type==="breditor/task-item")&&parent.children[0]===node)return false;
 return ["breditor/document","breditor/blockquote","breditor/table-cell","breditor/list-item","breditor/task-item"].includes(parent.type);
}
export function structuralIntervalV2(m:RichModel):{first:string;last:string;nodes:ElementNode[]}|undefined {
 const s=m.view.selection;if(s?.kind==="node"){const node=m.nodes.get(s.block);return node&&replaceableFlowV2(m,node)?{first:id(node),last:id(node),nodes:[node]}:undefined;}
 if(s?.kind!=="text")return undefined;const a=m.textBlocks.findIndex(n=>id(n)===s.anchor.block),f=m.textBlocks.findIndex(n=>id(n)===s.focus.block);if(a<0||f<0)return undefined;
 const first=id(m.textBlocks[Math.min(a,f)]!),last=id(m.textBlocks[Math.max(a,f)]!),parent=m.parents.get(first);if(!parent||parent!==m.parents.get(last)||parent.type==="breditor/image")return undefined;
 const start=parent.children.findIndex(n=>n.kind==="element"&&id(n)===first),end=parent.children.findIndex(n=>n.kind==="element"&&id(n)===last);
 if(!replaceableFlowV2(m,m.nodes.get(first)!))return undefined;
 return {first,last,nodes:parent.children.slice(start,end+1).filter((n):n is ElementNode=>n.kind==="element")};
}
