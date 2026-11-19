import {defaultTreeAdapter as base,parse,type DefaultTreeAdapterMap,type DefaultTreeAdapterTypes,type TreeAdapter} from "parse5";
import {Budget,fail,limits,sourceWithinBudget} from "./budget.js";
export type HtmlNode=DefaultTreeAdapterTypes.ChildNode;
export type HtmlElement=DefaultTreeAdapterTypes.Element;
export function isElement(n:HtmlNode):n is HtmlElement{return "tagName" in n;}
export function attribute(n:HtmlElement,name:string):string|undefined{return n.attrs.find(a=>a.name===name&&a.namespace===undefined&&a.prefix===undefined)?.value;}
export function plainText(n:HtmlNode):string{return n.nodeName==="#text"?(n as DefaultTreeAdapterTypes.TextNode).value:isElement(n)?n.tagName==="br"?"\n":n.childNodes.map(plainText).join(""):"";}
function officeConditional(source:string,offset:number):boolean {
  return offset>=2&&source.startsWith("<!",offset-2)&&/^\[(?:if [^\]<>]{1,64}|endif)\]>/i.test(source.slice(offset,offset+72));
}
/** Limits construction and HTML repair, including detached nodes absent from the returned tree. */
export function htmlTree(source:string,b:Budget):HtmlNode[] {
  sourceWithinBudget(source);
  const seen=new WeakSet<object>();let constructed=0,mutations=0,open=0,errors=0;
  const observe=<T extends object>(n:T):T=>{if(!seen.has(n)){seen.add(n);if(++constructed>limits.parsedNodes+32)fail("resource-limit");}return n;};
  const mutate=()=>{if(++mutations>limits.treeMutations)fail("resource-limit");};
  const adapter:TreeAdapter<DefaultTreeAdapterMap>={...base,
    createDocument:()=>observe(base.createDocument()),createDocumentFragment:()=>observe(base.createDocumentFragment()),
    createElement:(name,ns,attrs)=>observe(base.createElement(name,ns,attrs)),createCommentNode:value=>observe(base.createCommentNode(value)),createTextNode:value=>observe(base.createTextNode(value)),
    appendChild(parent,node){mutate();observe(parent);observe(node);base.appendChild(parent,node);},
    insertBefore(parent,node,ref){mutate();observe(parent);observe(node);base.insertBefore(parent,node,ref);},
    insertText(parent,value){const last=parent.childNodes.at(-1);if(last&&base.isTextNode(last)){mutate();last.value+=value;}else adapter.appendChild(parent,adapter.createTextNode(value));},
    insertTextBefore(parent,value,ref){const last=parent.childNodes[parent.childNodes.indexOf(ref)-1];if(last&&base.isTextNode(last)){mutate();last.value+=value;}else adapter.insertBefore(parent,adapter.createTextNode(value),ref);},
    detachNode(node){mutate();base.detachNode(node);},adoptAttributes(node,attrs){mutate();base.adoptAttributes(node,attrs);},
    setTemplateContent(node,content){mutate();observe(content);base.setTemplateContent(node,content);},
    setDocumentType(node,name,publicId,systemId){mutate();base.setDocumentType(node,name,publicId,systemId);for(const n of node.childNodes)observe(n);},
    onItemPush(){if(++open>limits.depth+8)fail("resource-limit");},onItemPop(){open--;},
  };
  // A document parse retains authored html/body attributes in Office wrappers.
  // Missing doctype is ordinary for a clipboard fragment, not a conversion loss; neither is a
  // legacy HTML 4 doctype (LibreOffice, Cocoa HTML Writer), which repairs no content.
  // Office "downlevel-revealed" conditional markers (`<![if !supportLists]>`, `<![endif]>`)
  // are bogus comments by design; their revealed content stays ordinary parsed markup.
  const document=parse(source,{scriptingEnabled:false,treeAdapter:adapter,onParseError(error){if(error.code==="missing-doctype"||error.code==="non-conforming-doctype"||error.code==="incorrectly-opened-comment"&&officeConditional(source,error.startOffset))return;if(++errors>limits.parsedNodes)fail("resource-limit");}});
  const root=document.childNodes.find((n):n is HtmlElement=>"tagName" in n),nodes=root?[root]:[];
  if(errors)b.loss("html-repaired",errors);
  const todo:{node:HtmlNode;depth:number}[]=nodes.map(node=>({node,depth:1}));let visited=0;
  while(todo.length){const item=todo.pop()!;if(++visited>limits.parsedNodes||item.depth>limits.depth)fail("resource-limit");if(isElement(item.node)){for(const node of item.node.childNodes)todo.push({node,depth:item.depth+1});}}
  return nodes;
}
