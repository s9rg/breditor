/**
 * Recognize this library's own email HTML before ordinary conversion.
 *
 * Inside an exact content root (`data-breditor-email="content"` with the fixed root style), each
 * element's leading fixed decoration from `html_email.ts` and the fixed data-table attributes are
 * removed, leaving the semantic markup and declarations that `exportHtml` would have written. An
 * exact preset wrapper is replaced by its content, and its preheader and geometry are returned for
 * the host. Anything that does not match exactly is left untouched and converts (and is reported)
 * as ordinary HTML.
 */
import {attribute,isElement,plainText,type HtmlElement,type HtmlNode} from "./html_tree.js";
import {emailColor,emailDecoration,emailMarker,emailMarkerValues,emailPreheader,emailPreheaderStyle,emailStyle,emailTableAttributes,emailWidth,type ResolvedEmailPreset} from "./html_email.js";

const blank=(node:HtmlNode)=>!isElement(node)&&!/[^\t\n\f\r ]/.test(plainText(node));
/** The single element child of `node` with the given tag, ignoring blank text, or undefined. */
function only(node:HtmlElement,tag:string):HtmlElement|undefined {
  const elements=node.childNodes.filter(isElement);
  if(elements.length!==1||elements[0]!.tagName!==tag||node.childNodes.some(child=>!isElement(child)&&!blank(child)))return undefined;
  return elements[0];
}
/** `table > tbody > tr > td` as parse5 builds it, or undefined. */
function soleCell(table:HtmlElement):HtmlElement|undefined {
  const body=only(table,"tbody"),row=body&&only(body,"tr");return row&&only(row,"td");
}
function removeAttributes(node:HtmlElement,names:readonly string[]):void {node.attrs=node.attrs.filter(attr=>!names.includes(attr.name));}
function replace(node:HtmlElement,children:HtmlNode[]):void {
  const parent=node.parentNode;if(!parent)return;
  const index=parent.childNodes.indexOf(node);if(index<0)return;
  for(const child of children)child.parentNode=parent;
  parent.childNodes.splice(index,1,...children);
}
function elements(nodes:readonly HtmlNode[]):HtmlElement[] {
  const found:HtmlElement[]=[],todo=[...nodes].reverse();
  while(todo.length){const node=todo.pop()!;if(!isElement(node))continue;found.push(node);for(let i=node.childNodes.length-1;i>=0;i--)todo.push(node.childNodes[i]!);}
  return found;
}
/** Remove one fixed decoration prefix from an element's own `style`. */
function strip(node:HtmlElement):void {
  const style=attribute(node,"style"),choices=emailDecoration[node.tagName];
  if(style===undefined||!choices)return;
  for(const decoration of choices){
    if(style===decoration){removeAttributes(node,["style"]);return;}
    if(style.startsWith(decoration+";")){
      const rest=style.slice(decoration.length+1);
      node.attrs=node.attrs.map(attr=>attr.name==="style"&&attr.namespace===undefined?{...attr,value:rest}:attr);return;
    }
  }
}
function content(root:HtmlElement):void {
  removeAttributes(root,[emailMarker,"style"]);
  for(const node of elements(root.childNodes)){
    if(attribute(node,emailMarker)!==undefined)continue;
    strip(node);
    if(node.tagName==="table"&&emailTableAttributes.every(([name,value])=>attribute(node,name)===value))removeAttributes(node,emailTableAttributes.map(([name])=>name));
  }
}
interface Wrapper {readonly preset:ResolvedEmailPreset;readonly cell:HtmlElement;readonly preheader?:HtmlElement}
function wrapper(table:HtmlElement):Wrapper|undefined {
  const outer=soleCell(table),inner=outer&&only(outer,"table"),cell=inner&&soleCell(inner);
  const background=emailColor(attribute(table,"bgcolor")),contentBackground=inner&&emailColor(attribute(inner,"bgcolor"));
  const rawWidth=inner&&attribute(inner,"width"),width=rawWidth!==undefined&&/^\d{3,4}$/.test(rawWidth)?emailWidth(Number(rawWidth)):undefined;
  if(!cell||background===undefined||contentBackground===undefined||width===undefined)return undefined;
  const root=only(cell,"div");if(!root||attribute(root,emailMarker)!==emailMarkerValues.content)return undefined;
  // The optional preheader is the wrapper's previous element sibling.
  const siblings=table.parentNode?.childNodes??[],index=siblings.indexOf(table);
  let previous:HtmlNode|undefined;for(let i=index-1;i>=0;i--){if(!blank(siblings[i]!)){previous=siblings[i];break;}}
  const hidden=previous&&isElement(previous)&&previous.tagName==="div"&&attribute(previous,emailMarker)===emailMarkerValues.preheader&&
    attribute(previous,"style")===emailPreheaderStyle&&previous.attrs.length===2&&previous.childNodes.every(child=>!isElement(child))?previous:undefined;
  const preheader=hidden?emailPreheader(plainText(hidden)):undefined;
  return {cell,...(hidden?{preheader:hidden}:{}),preset:Object.freeze({width,background,contentBackground,...(preheader===undefined?{}:{preheader})})};
}
/**
 * Rewrite recognized email markup in the inert tree. Returns the preset of the first exact
 * wrapper, if any. The tree budget already bounds this walk.
 */
export function unwrapEmailPresentation(nodes:readonly HtmlNode[]):ResolvedEmailPreset|undefined {
  const all=elements(nodes);if(!all.some(node=>attribute(node,emailMarker)!==undefined))return undefined;
  let preset:ResolvedEmailPreset|undefined;
  for(const table of all.filter(node=>node.tagName==="table"&&attribute(node,emailMarker)===emailMarkerValues.wrapper)){
    const found=wrapper(table);if(!found)continue;
    preset??=found.preset;
    if(found.preheader)replace(found.preheader,[]);
    const body=table.parentNode;
    if(body&&isElement(body as HtmlNode)&&(body as HtmlElement).tagName==="body"&&attribute(body as HtmlElement,"style")===`margin:0;padding:0;background-color:${found.preset.background}`)removeAttributes(body as HtmlElement,["style"]);
    replace(table,[...found.cell.childNodes]);
  }
  if(preset){
    // The fixed responsive viewport the preset writes is presentation, not host metadata.
    const head=all.find(node=>node.tagName==="head");
    if(head)head.childNodes=head.childNodes.filter(node=>!(isElement(node)&&node.tagName==="meta"&&node.attrs.length===2&&
      attribute(node,"name")==="viewport"&&attribute(node,"content")==="width=device-width, initial-scale=1"));
  }
  const root=emailStyle("div");
  for(const node of all)if(node.tagName==="div"&&attribute(node,emailMarker)===emailMarkerValues.content&&attribute(node,"style")===root&&node.attrs.length===2)content(node);
  return preset;
}
