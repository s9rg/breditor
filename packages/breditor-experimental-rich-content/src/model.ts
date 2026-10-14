// Read-only projection of one admitted Rust view. Never an independently mutable document.
import type {FormatLiteral,RichCell,RichPoint,RichSelection,RichView} from "./core.js";
export interface TextNode {kind:"text";text:string;formats:readonly FormatLiteral[]}
export interface ElementNode {kind:"element";type:string;properties:Readonly<Record<string,unknown>>;children:readonly AstNode[]}
export type AstNode=TextNode|ElementNode;
export interface RichModel {
 readonly view:RichView;
 readonly root:ElementNode;
 readonly nodes:ReadonlyMap<string,ElementNode>;
 readonly parents:ReadonlyMap<string,ElementNode>;
 readonly textBlocks:readonly ElementNode[];
}
export const property=(node:ElementNode,name:string):unknown=>node.properties[`breditor/${name}`];
export const id=(node:ElementNode):string=>String(property(node,"block-id"));
export const isText=(node:ElementNode):boolean=>node.type==="breditor/paragraph"||node.type==="breditor/heading";
export const text=(node:ElementNode):string=>node.children.map(child=>child.kind==="text"?child.text:"").join("");
export const cellKey=(cell:RichCell):string=>JSON.stringify([cell.table,cell.row,cell.column]);
export function model(view:RichView):RichModel {
 const root=(JSON.parse(view.documentJson) as {root:ElementNode}).root;
 const nodes=new Map<string,ElementNode>(),parents=new Map<string,ElementNode>(),textBlocks:ElementNode[]=[];
 const walk=(node:ElementNode,parent?:ElementNode):void=>{
  if(node!==root){nodes.set(id(node),node);if(parent)parents.set(id(node),parent);}
  if(isText(node))textBlocks.push(node);
  for(const child of node.children)if(child.kind==="element")walk(child,node);
 };
 walk(root);
 return {view,root,nodes,parents,textBlocks};
}
export function textTargets(value:RichModel,selection:RichSelection|null=value.view.selection):{block:string;start:string;end:string}[] {
 if(selection?.kind!=="text")return [];
 const {anchor,focus}=selection;
 const a=value.textBlocks.findIndex(node=>id(node)===anchor.block),f=value.textBlocks.findIndex(node=>id(node)===focus.block);
 if(a<0||f<0)return [];
 const [start,end]=a<f||(a===f&&BigInt(anchor.offset)<=BigInt(focus.offset))?[anchor,focus]:[focus,anchor];
 return value.textBlocks.slice(Math.min(a,f),Math.max(a,f)+1).flatMap(node=>{
  const first=id(node)===start.block?Number(start.offset):0,last=id(node)===end.block?Number(end.offset):text(node).length;
  return first===last?[]:[{block:id(node),start:String(first),end:String(last)}];
 });
}
export function formatsAt(value:RichModel,point:RichPoint):readonly FormatLiteral[] {
 const node=value.nodes.get(point.block);if(!node)return [];
 const at=Number(point.offset);let offset=0,previous:readonly FormatLiteral[]=[];
 for(const child of node.children){if(child.kind!=="text")continue;const end=offset+child.text.length;
  if(at<end||(at===end&&point.affinity==="before"))return child.formats;
  previous=child.formats;offset=end;
 }
 return previous;
}
export function selectedText(value:RichModel):ElementNode|undefined {
 const selection=value.view.selection;
 return selection?.kind==="text"?value.nodes.get(selection.focus.block):undefined;
}
export function selectedTable(value:RichModel):ElementNode|undefined {
 const selection=value.view.selection;
 if(selection?.kind==="grid")return [...value.nodes.values()].find(node=>property(node,"table-id")===selection.focus.table);
 if(selection?.kind==="node"){const node=value.nodes.get(selection.block);if(node?.type==="breditor/table")return node;}
 let node=selection?.kind==="node"?value.nodes.get(selection.block):selectedText(value);
 while(node){if(node.type==="breditor/table")return node;node=value.parents.get(id(node));}
 return undefined;
}
export function selectedImage(value:RichModel):ElementNode|undefined {
 const selection=value.view.selection;
 let node=selection?.kind==="node"?value.nodes.get(selection.block):selectedText(value);
 while(node){if(node.type==="breditor/image")return node;node=value.parents.get(id(node));}
 return undefined;
}
export function sourceCell(value:RichModel,block:string):RichCell|undefined {
 let node=value.nodes.get(block),column:string|undefined,row:string|undefined;
 while(node){
  if(node.type==="breditor/table-cell")column=String(property(node,"column-id"));
  if(node.type==="breditor/table-row")row=String(property(node,"row-id"));
  if(node.type==="breditor/table"&&row&&column)return {table:String(property(node,"table-id")),row,column};
  node=value.parents.get(id(node));
 }
 return undefined;
}
