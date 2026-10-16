import {Budget,fail,limits} from "./budget.js";
import {attribute,htmlTree,isElement,plainText,type HtmlElement,type HtmlNode} from "./html_tree.js";
import {declarations,initialStyle,styleFor,type StyleState} from "./html_style.js";
import {append,element,nodeText,rootJson,type Element,type Node,type Text} from "./wire.js";
import type {InterchangeOptions} from "./types.js";
import {importTable,pixels} from "./html_table.js";
import {Stylesheets} from "./html_stylesheet.js";
const blocks=new Set(["p","div","h1","h2","h3","h4","h5","h6","ul","ol","li","pre","blockquote","table","figure","hr","section","article","main","header","footer"]);
const containers=new Set(["div","section","article","main","header","footer","html","head","body","center"]);
const removed=new Set(["script","style","iframe","object","embed","template","noscript","link","meta","base","title","canvas","audio","video","source"]);
const inlineTags=new Set(["span","b","strong","i","em","u","s","strike","del","code","sub","sup","a","small","big","font","label","abbr","mark","wbr"]);
const knownAttributes=new Set(["style","class","id","dir","align","lang","href","target","rel","src","alt","width","height","start","value","rowspan","colspan","span","type","checked","disabled","data-breditor-placeholder","data-breditor-cell-partition","data-breditor-cell-row","data-breditor-cell-column","data-breditor-cell-header"]);
interface WordItem {node:HtmlElement;level:number;group:string;start:number|null}
/** Conversion staging only. Native schema/clipboard admission is always required before publication. */
export class HtmlConversion {
  #css=new WeakMap<HtmlElement,Map<string,string>>();#blockDescendant=new WeakMap<HtmlElement,boolean>();#word=new WeakMap<HtmlElement,WordItem|null>();
  #markers=new WeakSet<HtmlElement>();#checkboxes=new WeakSet<HtmlElement>();
  #preservedEnd=new WeakSet<Text>();
  constructor(readonly b:Budget,readonly options:InterchangeOptions,readonly sheets:Stylesheets){}
  css(node:HtmlElement):Map<string,string>{let value=this.#css.get(node);if(!value){const important=new Set<string>();value=this.sheets.apply(node,declarations(node,this.b,important),important);this.#css.set(node,value);}return value;}
  style(node:HtmlElement,parent:StyleState):StyleState {
    for(const attr of node.attrs)if(attr.namespace!==undefined||attr.prefix!==undefined||!knownAttributes.has(attr.name))this.b.loss("unsupported-attribute");
    return styleFor(node,parent,this.b,this.css(node));
  }
  #safe(node:HtmlElement):boolean {
    if(node.tagName==="style"&&this.sheets.consumed(node))return false;
    if(node.namespaceURI!=="http://www.w3.org/1999/xhtml"||removed.has(node.tagName)||this.#hidden(node)){this.b.loss("removed-content");return false;}return true;
  }
  #hidden(node:HtmlElement):boolean {
    if(attribute(node,"hidden")!==undefined)return true;
    const css=this.css(node);return css.get("display")?.trim().toLowerCase()==="none"||["hidden","collapse"].includes(css.get("visibility")?.trim().toLowerCase()??"")||css.get("mso-hide")?.trim().toLowerCase()==="all";
  }
  excluded(node:HtmlElement):boolean{return this.#hidden(node);}
  #containsBlock(node:HtmlElement):boolean {
    let value=this.#blockDescendant.get(node);if(value===undefined){value=node.childNodes.some(n=>isElement(n)&&(blocks.has(n.tagName)||this.#containsBlock(n)));this.#blockDescendant.set(node,value);}return value;
  }
  #inlineText(output:Node[],value:string,state:StyleState):void {
    if(state.whiteSpace==="normal")value=value.replace(/[\t\n\f\r ]+/g," ");
    else if(state.whiteSpace==="pre-line")value=value.replace(/[\t\f\r ]+/g," ");
    if(state.whiteSpace!=="pre"&&(!output.length||output.at(-1)?.kind==="element"||output.at(-1)?.kind==="text"&&/[ \n]$/.test((output.at(-1) as Text).text)))value=value.replace(/^ +/,"");
    if(!value)return;
    append(this.b,output,value,[...state.formats.values()]);
    const last=output.at(-1);if(last?.kind==="text"){if(state.whiteSpace==="pre")this.#preservedEnd.add(last);else this.#preservedEnd.delete(last);}
  }
  inline(nodes:readonly HtmlNode[],state:StyleState):Node[] {
    const output:Node[]=[];
    const walk=(items:readonly HtmlNode[],parent:StyleState)=>{
      for(const node of items){
        if(!isElement(node)){if(node.nodeName==="#text")this.#inlineText(output,plainText(node),parent);continue;}
        if(!this.#safe(node)||this.#markers.has(node)||this.#checkboxes.has(node))continue;
        const next=this.style(node,parent);
        if(node.tagName==="br"){if(attribute(node,"data-breditor-placeholder")!=="1")append(this.b,output,"\n",[...next.formats.values()]);continue;}
        if(node.tagName==="img"){const image=this.image(node,next);if(image)output.push(image);else this.#inlineText(output,attribute(node,"alt")??"",next);continue;}
        if(node.tagName==="input"||node.tagName==="button"||node.tagName==="select"||node.tagName==="textarea"){this.b.loss("removed-content");continue;}
        if(!inlineTags.has(node.tagName))this.b.loss("unsupported-element");
        if(node.tagName==="small"||node.tagName==="big"||node.tagName==="font"||node.tagName==="abbr")this.b.loss("unsupported-style");
        walk(node.childNodes,next);
      }
    };
    walk(nodes,state);return output;
  }
  #trim(runs:Node[],state:StyleState):void {
    if(state.whiteSpace==="pre")return;
    const last=runs.at(-1);
    if(last?.kind==="text"&&!this.#preservedEnd.has(last))last.text=last.text.replace(/ +$/,"");
    while(runs[0]?.kind==="text"&&!(runs[0] as Text).text)runs.shift();while(runs.at(-1)?.kind==="text"&&!(runs.at(-1) as Text).text)runs.pop();
  }
  prose(nodes:readonly HtmlNode[],state:StyleState,heading?:number,allowEmpty=true):Element[] {
    const pieces=this.inline(nodes,state);this.#trim(pieces,state);
    // A sole native HTML placeholder is one empty paragraph, not a hard break.
    if(allowEmpty&&pieces.length===1&&pieces[0]?.kind==="text"&&pieces[0].text==="\n"&&nodes.length===1&&isElement(nodes[0]!)&&nodes[0]!.tagName==="br")pieces.length=0;
    if(!allowEmpty&&!pieces.length)return[];
    const output:Element[]=[],layout={...state.layout,...(heading===undefined?{}:{"breditor/level":heading})};let runs:Node[]=[];
    const flush=()=>{if(runs.length){output.push(element(this.b,heading===undefined?"paragraph":"heading",runs,layout));runs=[];}};
    for(const piece of pieces){if(piece.kind==="element"){flush();output.push(piece);}else runs.push(piece);}flush();
    if(pieces.some(p=>p.kind==="element"))this.b.loss("block-structure");
    if(!output.length)output.push(element(this.b,heading===undefined?"paragraph":"heading",[],layout));
    return output;
  }
  flow(nodes:readonly HtmlNode[],state=initialStyle(),insideTable=false):Element[] {
    const output:Element[]=[];let pending:HtmlNode[]=[];
    const flush=()=>{if(pending.some(n=>isElement(n)||plainText(n).trim()!=="")||state.whiteSpace==="pre"&&pending.length)output.push(...this.prose(pending,state,undefined,false));pending=[];};
    for(let i=0;i<nodes.length;i++){
      const node=nodes[i]!;
      if(!isElement(node)){pending.push(node);continue;}
      if(this.#hidden(node)&&node.tagName!=="style"){this.b.loss("removed-content");continue;}
      const word=this.#wordItem(node);
      if(word){flush();const items=[word];for(let j=i+1;j<nodes.length;j++){const n=nodes[j]!;if(!isElement(n)&&!plainText(n).trim()){i=j;continue;}const next=isElement(n)?this.#wordItem(n):null;if(!next||next.group!==word.group)break;items.push(next);i=j;}output.push(...this.#wordLists(items,state));continue;}
      if(!blocks.has(node.tagName)&&!containers.has(node.tagName)&&!this.#containsBlock(node)){pending.push(node);continue;}
      flush();if(!this.#safe(node))continue;
      const next=this.style(node,state),tag=node.tagName;
      if(containers.has(tag)){if(tag==="center")next.layout["breditor/block-align"]=2;output.push(...this.flow(node.childNodes,next,insideTable));}
      else if(tag==="p"||/^h[1-6]$/.test(tag))output.push(...this.prose(node.childNodes,next,tag==="p"?undefined:Number(tag[1])));
      else if(tag==="ul"||tag==="ol")output.push(...this.#list(node,next,insideTable));
      else if(tag==="blockquote"){const body=this.flow(node.childNodes,next,insideTable);output.push(element(this.b,"blockquote",body.length?body:[element(this.b,"paragraph")]));}
      else if(tag==="pre")output.push(this.#code(node,next));
      else if(tag==="hr")output.push(element(this.b,"horizontal-rule"));
      else if(tag==="table"){if(insideTable)fail("unsupported-content");output.push(...importTable(this,node,next));}
      else if(tag==="figure")output.push(...this.#figure(node,next,insideTable));
      else {if(!inlineTags.has(tag))this.b.loss("unsupported-element");output.push(...this.flow(node.childNodes,next,insideTable));}
    }
    flush();return output;
  }
  image(node:HtmlElement,_state:StyleState):Element|undefined {
    const src=attribute(node,"src")??"",rawAlt=attribute(node,"alt");let binding;
    try{binding=this.options.resolveImage?.(Object.freeze({src,alt:rawAlt??null}));}catch{fail("asset-policy");}
    if(!binding){this.b.loss("image-reference");return undefined;}
    if(typeof binding.asset!=="string"||typeof binding.generation!=="string")fail("asset-policy");
    const missing=rawAlt===undefined||rawAlt!==""&&!rawAlt.trim(),alt=missing?"Image":rawAlt!;if(missing)this.b.loss("image-alt");
    const props:Record<string,unknown>={"breditor/image-id":this.b.id(),"breditor/asset-id":binding.asset,"breditor/asset-generation":binding.generation,"breditor/decorative":alt==="","breditor/alt-text":alt};
    const rawWidth=attribute(node,"width")??this.css(node).get("width"),rawHeight=attribute(node,"height")??this.css(node).get("height"),width=pixels(rawWidth),height=pixels(rawHeight);
    if(rawWidth!==undefined||rawHeight!==undefined){if(width!==null&&height!==null&&width>=1&&width<=4096&&height>=1&&height<=4096){props["breditor/width"]=Math.round(width);props["breditor/height"]=Math.round(height);if(!Number.isInteger(width)||!Number.isInteger(height))this.b.loss("image-size");}else this.b.loss("image-size");}
    return element(this.b,"image",[],props);
  }
  #figure(node:HtmlElement,state:StyleState,insideTable:boolean):Element[] {
    const images:HtmlElement[]=[],captions:HtmlElement[]=[];let other=false;
    for(const n of node.childNodes){if(!isElement(n)){if(plainText(n).trim())other=true;}else if(n.tagName==="img")images.push(n);else if(n.tagName==="figcaption")captions.push(n);else other=true;}
    if(images.length!==1||captions.length>1||other){this.b.loss("block-structure");return this.flow(node.childNodes,state,insideTable);}
    const imageNode=images[0]!,caption=captions[0];
    const body=caption&&!this.#hidden(caption)?this.flow(caption.childNodes,this.style(caption,state),insideTable):[];
    if(caption&&this.#hidden(caption))this.b.loss("removed-content");
    if(this.#hidden(imageNode)){this.b.loss("removed-content");return body;}
    const image=this.image(imageNode,this.style(imageNode,state));
    if(!image){const runs:Node[]=[];append(this.b,runs,attribute(imageNode,"alt")??"",[]);return [...(runs.length?[element(this.b,"paragraph",runs)]:[]),...body];}
    if(body.length){const runs:Node[]=[];for(const [i,n]of body.entries()){if(i)append(this.b,runs,"\n",[]);if(n.type==="breditor/paragraph"||n.type==="breditor/heading"){for(const run of n.children){if(run.kind==="text")append(this.b,runs,run.text,run.formats);}}else{append(this.b,runs,nodeText(n),[]);this.b.loss("block-structure");}}if(body.length!==1||body[0]!.type!=="breditor/paragraph")this.b.loss("block-structure");image.children=[element(this.b,"paragraph",runs)];}
    return[image];
  }
  #code(node:HtmlElement,state:StyleState):Element {
    const code=node.childNodes.find(n=>isElement(n)&&n.tagName==="code"),language=code&&isElement(code)?attribute(code,"class")?.split(/\s+/).find(c=>c.startsWith("language-"))?.slice(9):undefined;
    const collect=(n:HtmlNode):string=>{
      if(!isElement(n))return plainText(n);if(!this.#safe(n))return"";
      if(n.tagName==="br")return"\n";if(n.tagName==="img"){this.b.loss("image-reference");return attribute(n,"alt")??"";}
      if(!["pre","code","span"].includes(n.tagName)||n.attrs.some(a=>a.name==="style"))this.b.loss("unsupported-style");
      return n.childNodes.map(collect).join("");
    };
    const text=node.childNodes.map(collect).join(""),runs:Node[]=[];append(this.b,runs,text,[]);
    const props={...state.layout};if(language){if(/^[a-zA-Z0-9][a-zA-Z0-9+_.#-]{0,63}$/.test(language))props["breditor/language"]=language;else this.b.loss("unsupported-attribute");}
    return element(this.b,"code-block",runs,props);
  }
  #checkbox(node:HtmlElement):HtmlElement|undefined {
    for(const child of node.childNodes){if(!isElement(child)){if(plainText(child).trim())return undefined;continue;}if(child.tagName==="input"&&attribute(child,"type")?.toLowerCase()==="checkbox")return child;if(["p","span"].includes(child.tagName))return this.#checkbox(child);return undefined;}return undefined;
  }
  #list(node:HtmlElement,state:StyleState,insideTable:boolean):Element[] {
    const output:Element[]=[];let current:Element|undefined,ordinal=Number(attribute(node,"start")??1);
    if(!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>1_000_000_000)fail("unsupported-content");
    const ordered=node.tagName==="ol";
    if(attribute(node,"type")!==undefined&&attribute(node,"type")!==(ordered?"1":"disc")||attribute(node,"reversed")!==undefined)this.b.loss("list-numbering");
    for(const child of node.childNodes){
      if(!isElement(child)){if(plainText(child).trim())fail("unsupported-content");continue;}if(child.tagName!=="li"||this.#hidden(child))fail("unsupported-content");
      const checkbox=this.#checkbox(child),task=checkbox!==undefined;if(checkbox)this.#checkboxes.add(checkbox);
      const explicit=attribute(child,"value");if(ordered&&explicit!==undefined){const n=Number(explicit);if(!Number.isSafeInteger(n)||n<1||n>1_000_000_000)fail("unsupported-content");if(n!==ordinal){current=undefined;ordinal=n;this.b.loss("list-numbering");}}
      const kind=task?"task-list":ordered?"ordered-list":"bullet-list";
      if(!current||current.type!==`breditor/${kind}`){current=element(this.b,kind,[],ordered&&!task?{"breditor/start":ordinal}:{});output.push(current);}
      if(task&&ordered)this.b.loss("list-numbering");
      const body=this.flow(child.childNodes,this.style(child,state),insideTable);
      if(!body.length||!['breditor/paragraph','breditor/heading'].includes(body[0]!.type))body.unshift(element(this.b,"paragraph"));
      current.children.push(element(this.b,task?"task-item":"list-item",body,task?{"breditor/checked":attribute(checkbox!,"checked")!==undefined}:{}));ordinal++;
    }
    if(!output.length)this.b.loss("block-structure");return output;
  }
  #wordItem(node:HtmlElement):WordItem|null {
    if(this.#word.has(node))return this.#word.get(node)!;
    let item:WordItem|null=null;
    if(node.tagName==="p"&&!this.#hidden(node)){
      const declaration=this.css(node).get("mso-list"),m=declaration?/\bl(\d+)\s+level(\d+)\s+lfo(\d+)\b/i.exec(declaration):null;
      if(m){const level=Number(m[2]);if(level<1||level>16)fail("unsupported-content");
        const todo=[...node.childNodes];let marker:HtmlElement|undefined;
        while(todo.length){const n=todo.shift()!;if(isElement(n)){if(this.css(n).get("mso-list")?.toLowerCase()==="ignore"){marker=n;break;}todo.unshift(...n.childNodes);}}
        if(marker){this.#markers.add(marker);const value=plainText(marker).trim(),number=/^(\d+)[.)]/.exec(value);item={node,level,group:`${m[1]}:${m[3]}`,start:number?Number(number[1]):null};if(!number&&!/^[·•●○▪\-o]$/.test(value))this.b.loss("list-numbering");}
        else this.b.loss("list-numbering");
      }
    }
    this.#word.set(node,item);return item;
  }
  #wordLists(items:WordItem[],state:StyleState):Element[] {
    const output:Element[]=[],stack:{level:number;list:Element;item:Element;next:number|null}[]=[];
    if(items[0]!.level!==1)this.b.loss("block-structure");
    for(const item of items){
      while(stack.length&&stack.at(-1)!.level>item.level)stack.pop();
      let top=stack.at(-1),list:Element;const kind=item.start===null?"bullet-list":"ordered-list";
      if(!top||top.level<item.level){if(top&&item.level!==top.level+1)fail("unsupported-content");list=element(this.b,kind,[],item.start===null?{}:{"breditor/start":item.start});if(top)top.item.children.push(list);else output.push(list);top={level:item.level,list,item:list,next:item.start};stack.push(top);}
      else if(top.list.type!==`breditor/${kind}`||item.start!==null&&item.start!==top.next){list=element(this.b,kind,[],item.start===null?{}:{"breditor/start":item.start});if(stack.length>1)stack[stack.length-2]!.item.children.push(list);else output.push(list);top.list=list;}
      const body=this.prose(item.node.childNodes,this.style(item.node,state));top.item=element(this.b,"list-item",body);top.list.children.push(top.item);top.next=item.start===null?null:item.start+1;
    }
    return output;
  }
}
export function importHtmlContent(source:string,b:Budget,options:InterchangeOptions):{root:string;kind:"text"|"flow"} {
  const sourceNodes=htmlTree(source,b),converter=new HtmlConversion(b,options,new Stylesheets(sourceNodes,b)),body=converter.flow(sourceNodes);
  const containsBlock=(n:HtmlNode):boolean=>isElement(n)&&(blocks.has(n.tagName)||n.childNodes.some(containsBlock));
  const inline=!sourceNodes.some(containsBlock)&&body.length===1&&body[0]!.type==="breditor/paragraph"&&Object.keys(body[0]!.properties).every(k=>k==="breditor/block-id")&&body[0]!.children.length>0&&body[0]!.children.every(n=>n.kind==="text");
  return{root:rootJson(b,body),kind:inline?"text":"flow"};
}
