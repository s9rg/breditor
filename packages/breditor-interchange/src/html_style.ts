import {generate,lexer,parse,type Declaration} from "css-tree";
import {Budget,bytes,fail,limits} from "./budget.js";
import {attribute,type HtmlElement} from "./html_tree.js";
import {format,type Literal} from "./wire.js";
import {safeUrl} from "./safe_url.js";
export interface StyleState {formats:Map<string,Literal>;layout:Record<string,unknown>;whiteSpace:"normal"|"pre"|"pre-line"}
export const initialStyle=():StyleState=>({formats:new Map(),layout:{},whiteSpace:"normal"});
const freeTags:Readonly<Record<string,string>>={b:"strong",strong:"strong",i:"italic",em:"italic",u:"underline",s:"strike",strike:"strike",del:"strike",code:"code",sub:"subscript",sup:"superscript"};
const colors:Readonly<Record<string,number>>={black:0,white:0xffffff,red:0xff0000,green:0x008000,blue:0x0000ff,yellow:0xffff00,gray:0x808080,grey:0x808080,silver:0xc0c0c0,maroon:0x800000,purple:0x800080,fuchsia:0xff00ff,lime:0x00ff00,olive:0x808000,navy:0x000080,teal:0x008080,aqua:0x00ffff,orange:0xffa500};
export function rgb(value:string):number|null {
  value=value.toLowerCase();if(typeof colors[value]==="number")return colors[value]!;
  if(/^#[\da-f]{3}$/.test(value))return Number.parseInt(value.slice(1).split("").map(c=>c+c).join(""),16);
  if(/^#[\da-f]{6}$/.test(value))return Number.parseInt(value.slice(1),16);
  const parts=/^rgba?\((.*)\)$/.exec(value)?.[1]?.trim().split(/\s*[,/]\s*|\s+/);
  if(!parts||parts.length<3||parts.length>4||parts[3]!==undefined&&!['1','100%'].includes(parts[3]))return null;
  const channels=parts.slice(0,3).map(p=>/^\d+(?:\.\d+)?%?$/.test(p)?Number.parseFloat(p)*(p.endsWith("%")?2.55:1):NaN);
  if(channels.some(c=>!Number.isFinite(c)||c<0||c>255+1e-8))return null;
  return Math.round(channels[0]!)*65536+Math.round(channels[1]!)*256+Math.round(channels[2]!);
}
const fontLonghands = [
  ["font-style", "normal"], ["font-variant", "normal"], ["font-weight", "normal"],
  ["font-stretch", "normal"], ["line-height", "normal"], ["font-size", ""], ["font-family", ""],
] as const;
const matchedFontParts = [
  ["font-style", "font-style"], ["font-variant-css2", "font-variant"], ["font-weight", "font-weight"],
  ["font-width-css3", "font-stretch"], ["line-height", "line-height"],
  ["font-size", "font-size"], ["font-family", "font-family"],
] as const;
const decorationLonghands = [
  ["text-decoration-line", "none"], ["text-decoration-style", "solid"],
  ["text-decoration-color", "currentcolor"], ["text-decoration-thickness", "auto"],
] as const;

/** Expand before the cascade so shorthand and longhand share ordering and !important. */
export function declarationValues({property,value}:Declaration): Array<[string,string]> {
  const name=property.toLowerCase(), source=generate(value);
  const unexpanded: Array<[string,string]> = [[name,source]];
  if(name==="text-decoration"&&value.type==="Value"){
    const matched=lexer.matchProperty(name,value);
    if(matched.error!==null)return unexpanded;
    const keyword=source.toLowerCase();
    if(["inherit","initial","unset","revert","revert-layer"].includes(keyword)){
      return decorationLonghands.map(([key])=>[key,keyword]);
    }
    const parts=new Map<string,string[]>();
    for(const node of value.children){
      const key=decorationLonghands.find(([part])=>matched.isProperty(node,part))?.[0];
      if(key===undefined)return unexpanded;
      const items=parts.get(key)??[];
      items.push(generate(node));
      parts.set(key,items);
    }
    return decorationLonghands.map(([key,reset])=>[key,parts.get(key)?.join(" ")??reset]);
  }
  if(name!=="font"||value.type!=="Value")return unexpanded;
  if(["inherit","unset"].includes(source.toLowerCase())){
    return fontLonghands.map(([key])=>[key,"inherit"]);
  }
  const matched=lexer.matchProperty("font",value);
  if(matched.error!==null)return unexpanded;
  const parts=new Map<string,string[]>();
  for(const node of value.children){
    const token=generate(node);
    const key=matchedFontParts.find(([part])=>matched.isProperty(node,part)||matched.isType(node,part))?.[1];
    if(key!==undefined){
      const items=parts.get(key)??[];
      items.push(token);
      parts.set(key,items);
    }else if(node.type==="Operator"&&token===","){
      parts.get("font-family")?.push(token);
    }else if(node.type!=="Operator"||token!=="/"){
      return unexpanded;
    }
  }
  if(!parts.has("font-size")||!parts.has("font-family"))return unexpanded;
  return fontLonghands.map(([key,reset])=>[key,parts.get(key)?.join(" ")??reset]);
}
/** Parse CSS as inert data. Only individually recognized bounded values enter native literals. */
export function declarations(node:HtmlElement,b:Budget,important?:Set<string>):Map<string,string> {
  const raw=attribute(node,"style");if(!raw)return new Map();if(raw.length>limits.styleBytes||bytes(raw)>limits.styleBytes)fail("resource-limit");
  const values=new Map<string,{value:string;important:boolean}>();
  try{
    const tree=parse(raw,{context:"declarationList",positions:false,onParseError(){b.loss("unsupported-style");}});
    if(tree.type!=="DeclarationList")return new Map();
    tree.children.forEach(entry=>{
      if(entry.type!=="Declaration"){b.loss("unsupported-style");return;}
      for(const [key,value]of declarationValues(entry)){
        if(!values.get(key)?.important||entry.important)values.set(key,{value,important:Boolean(entry.important)});
      }
    });
  }catch{b.loss("unsupported-style");}
  for(const [key,value]of values)if(value.important)important?.add(key);
  return new Map([...values].map(([key,v])=>[key,v.value]));
}
const olListStyles:ReadonlySet<string>=new Set(["lower-alpha","lower-latin","upper-alpha","upper-latin","lower-roman","upper-roman"]);
const align:Readonly<Record<string,number>>={start:1,center:2,end:3,justify:4,left:5,right:6};
const direction:Readonly<Record<string,number>>={ltr:1,rtl:2,auto:3};
export function styleFor(node:HtmlElement,parent:StyleState,b:Budget,css:Map<string,string>):StyleState {
  const state:StyleState={formats:new Map(parent.formats),layout:{...parent.layout},whiteSpace:parent.whiteSpace};
  const set=(name:string,properties:Record<string,unknown>={})=>{const f=format(name,properties);state.formats.set(f.type,f);};
  const remove=(name:string)=>state.formats.delete(format(name).type);
  const initial=freeTags[node.tagName];if(typeof initial==="string")set(initial);
  if(node.tagName==="mark")set("background-color",{"breditor-inline/rgb24":0xffff00});
  if(node.tagName==="a"){
    const target=attribute(node,"target")?.toLowerCase(),newWindow=target==="_blank",rel=(attribute(node,"rel")??"").toLowerCase().split(/\s+/).filter(Boolean);
    if(target!==undefined&&!['_blank','_self'].includes(target)||rel.some(v=>!['noopener','noreferrer'].includes(v))||rel.includes("noreferrer")&&!newWindow)b.loss("unsupported-attribute");
    const raw=attribute(node,"href");if(raw!==undefined){const href=safeUrl(raw);if(href)set("link",{"breditor-inline/href":href,"breditor-inline/new-window":newWindow});else{remove("link");b.loss("unsafe-link");}}
  }
  const rawAlign=attribute(node,"align"),rawDir=attribute(node,"dir");
  if(rawAlign){if(typeof align[rawAlign]==="number")state.layout["breditor/block-align"]=align[rawAlign];else b.loss("unsupported-attribute");}
  if(rawDir){if(typeof direction[rawDir]==="number")state.layout["breditor/block-direction"]=direction[rawDir];else b.loss("unsupported-attribute");}
  const centered=node.tagName==="center";
  if(centered)state.layout["breditor/block-align"]=align["center"]!;
  let decorationLoss=false;
  for(const [name,source]of css){
    const value=source.trim().toLowerCase();
    if(value==="inherit"||centered&&name==="text-align"&&value==="unset"){
      // Font longhands override the element's intrinsic emphasis and weight.
      if(name==="font-weight"&&!parent.formats.has("breditor/strong"))remove("strong");
      if(name==="font-style"&&!parent.formats.has("breditor-inline/italic"))remove("italic");
      if(centered&&name==="text-align"){
        const inherited=parent.layout["breditor/block-align"];
        if(inherited===undefined)delete state.layout["breditor/block-align"];
        else state.layout["breditor/block-align"]=inherited;
      }
      continue;
    }
    switch(name){
      case "font-weight":if(value==="bold"||value==="bolder"||/^([6-9]00|1000)$/.test(value))set("strong");else if(value==="normal"||/^[1-5]00$/.test(value))remove("strong");else b.loss("unsupported-style");break;
      // Initial/no-op values Office and Docs write on every run are not presentation loss.
      case "font-variant":case "font-stretch":if(value!=="normal")b.loss("unsupported-style");break;
      case "vertical-align":
        if(value==="super"){remove("subscript");set("superscript");}else if(value==="sub"){remove("superscript");set("subscript");}
        else if(value==="baseline"){remove("superscript");remove("subscript");}else b.loss("unsupported-style");break;
      case "list-style-type":
        if(!["ul","ol","li"].includes(node.tagName))b.loss("unsupported-style");
        // An `<ol>` marker family is decided by list conversion, which knows the target owner's capability.
        else if(!["disc","circle","square","decimal"].includes(value)&&!(node.tagName==="ol"&&olListStyles.has(value)))b.loss("list-numbering");break;
      // Excel/Sheets: a <br> stays inside its cell, which is the only native meaning.
      case "mso-data-placement":if(node.tagName!=="br"||value!=="same-cell")b.loss("unsupported-style");break;
      case "font-style":if(value==="italic"||value==="oblique")set("italic");else if(value==="normal")remove("italic");else b.loss("unsupported-style");break;
      case "text-decoration":case "text-decoration-line":{
        const words=["initial","unset"].includes(value)?["none"]:value.split(/\s+/);
        if(words.includes("none")){remove("underline");remove("strike");}
        if(words.includes("underline"))set("underline");if(words.includes("line-through"))set("strike");
        if(words.some(v=>!["none","underline","line-through"].includes(v)))decorationLoss=true;break;
      }
      case "text-decoration-style":case "text-decoration-color":case "text-decoration-thickness":{
        const reset=decorationLonghands.find(([key])=>key===name)?.[1];
        if(value!==reset&&value!=="initial"&&value!=="unset")decorationLoss=true;
        break;
      }
      // Transparent paints nothing; an inherited highlight still shows through, so keep it.
      case "color":case "background-color":{if(name==="background-color"&&value==="transparent")break;const n=rgb(value);if(n!==null){set(name==="color"?"text-color":"background-color",{"breditor-inline/rgb24":n});if(name==="background-color"&&!["span","mark","font","b","strong","i","em","u","s","a"].includes(node.tagName))b.loss("style-approximation");}else b.loss("unsupported-style");break;}
      case "font-size":{
        const match=/^(\d+(?:\.\d+)?)(px|pt)$/.exec(value),pixels=match?Number(match[1])*(match[2]==="pt"?4/3:1):NaN;
        if(pixels>=8&&pixels<=96){if(!Number.isInteger(pixels))b.loss("style-approximation");set("text-size",{"breditor-inline/pixels":Math.round(pixels)});}else b.loss("unsupported-style");break;
      }
      case "font-family":{
        const names=value.split(",").map(v=>v.trim().replace(/^['"]|['"]$/g,""));
        const presets:Readonly<Record<string,number>>={"monospace":4,"courier new":4,courier:4,"system-ui":1,"-apple-system":1,blinkmacsystemfont:1,"sans-serif":2,arial:2,helvetica:2,calibri:2,serif:3,"times new roman":3,times:3,georgia:3};
        const first=names[0]??"",family=names.map(v=>presets[v]).find(v=>typeof v==="number")??null;
        if(family){set("font-family",{"breditor-inline/family":family});if(!["system-ui","sans-serif","serif","monospace"].includes(first))b.loss("style-approximation");}else b.loss("unsupported-style");break;
      }
      case "white-space":if(["pre","pre-wrap","break-spaces"].includes(value)){state.whiteSpace="pre";if(value==="break-spaces")b.loss("style-approximation");}else if(value==="pre-line")state.whiteSpace="pre-line";else if(value==="normal"||value==="nowrap"){state.whiteSpace="normal";if(value==="nowrap")b.loss("style-approximation");}else b.loss("unsupported-style");break;
      case "text-align":if(typeof align[value]==="number")state.layout["breditor/block-align"]=align[value];else if(centered&&value==="initial")state.layout["breditor/block-align"]=align["start"]!;else b.loss("unsupported-style");break;
      case "direction":if(typeof direction[value]==="number")state.layout["breditor/block-direction"]=direction[value];else b.loss("unsupported-style");break;
      case "line-height":{const percent=/^\d+(?:\.\d+)?%?$/.test(value)?Number.parseFloat(value)*(value.endsWith("%")?1:100):NaN;if(percent>=100&&percent<=300){state.layout["breditor/line-height-percent"]=Math.round(percent);if(!Number.isInteger(percent))b.loss("style-approximation");}else if(value==="normal")delete state.layout["breditor/line-height-percent"];else b.loss("unsupported-style");break;}
      case "margin-inline-start":{const n=/^\d+(?:\.\d+)?em$/.test(value)?Number.parseFloat(value)/2:NaN;if(Number.isInteger(n)&&n>=0&&n<=12)state.layout["breditor/block-indent"]=n;else b.loss("unsupported-style");break;}
      // Interpreted by structural conversion, not emitted as arbitrary style.
      case "mso-list":break;
      case "width":if(!["table","colgroup","col","td","th","img"].includes(node.tagName))b.loss("unsupported-style");break;
      case "height":if(node.tagName!=="img")b.loss("unsupported-style");break;
      case "caption-side":if(node.tagName!=="caption"||value!=="bottom")b.loss("unsupported-style");break;
      default:b.loss("unsupported-style");
    }
  }
  if(decorationLoss)b.loss("unsupported-style");
  return state;
}
