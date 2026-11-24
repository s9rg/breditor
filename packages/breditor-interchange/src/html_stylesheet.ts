import {generate,parse} from "css-tree";
import {Budget,ConversionFailure,bytes,fail,limits} from "./budget.js";
import {declarationValues} from "./html_style.js";
import {attribute,isElement,plainText,type HtmlElement,type HtmlNode} from "./html_tree.js";
interface Value {value:string;important:boolean}
interface Compound {tag:string|undefined;id:string|undefined;classes:string[]}
interface Selector {parts:Compound[];specificity:number}
interface Rule {selector:Selector;declarations:Map<string,Value>;order:number}
function compound(source:string):Compound|null {
  if(!/^(?:[a-zA-Z][\w-]*|\*)?(?:[.#][a-zA-Z_][\w-]*)*$/.test(source)||!source)return null;
  const tag=/^[a-zA-Z][\w-]*/.exec(source)?.[0]?.toLowerCase(),ids=[...source.matchAll(/#([a-zA-Z_][\w-]*)/g)].map(m=>m[1]!);if(ids.length>1)return null;
  const classes=[...source.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m=>m[1]!);if(classes.length>8)return null;
  return{tag,id:ids[0],classes};
}
function selector(source:string):Selector|null {
  const tokens=source.split(/\s+/);if(tokens.length>3)return null;
  const parts:Compound[]=[];let specificity=0;
  for(const token of tokens){
    const part=compound(token);if(!part)return null;
    parts.push(part);
    // At most 24 classes and three types, so each column stays below 100.
    specificity+=(part.id===undefined?0:10_000)+part.classes.length*100+(part.tag===undefined?0:1);
  }
  return{parts,specificity};
}
/** Closed compound and descendant selectors over the inert HTML tree. */
export class Stylesheets {
  #rules:Rule[]=[];#styleNodes=new WeakSet<HtmlElement>();#declarations=0;
  #classes=new WeakMap<HtmlElement,Set<string>>();#ancestorChecks=0;
  constructor(nodes:readonly HtmlNode[],readonly b:Budget){
    const todo=[...nodes].reverse();let total=0;
    while(todo.length){const node=todo.pop()!;if(!isElement(node))continue;
      if(node.namespaceURI!=="http://www.w3.org/1999/xhtml"||["script","template","noscript","svg","math","iframe","object","embed","canvas","audio","video"].includes(node.tagName))continue;
      if(node.tagName!=="style"){todo.push(...[...node.childNodes].reverse());continue;}
      this.#styleNodes.add(node);if(attribute(node,"type")!==undefined&&attribute(node,"type")!=="text/css"||attribute(node,"media")!==undefined&&!['all','screen'].includes(attribute(node,"media")!)){b.loss("unsupported-style");continue;}
      const source=node.childNodes.map(plainText).join("");total+=bytes(source);if(total>65536)fail("resource-limit");
      try{
        const ast=parse(source,{context:"stylesheet",positions:false,onParseError(){b.loss("unsupported-style");}});if(ast.type!=="StyleSheet")continue;
        ast.children.forEach(item=>{
          // Legacy `<!-- … -->` hiding tokens (Word/Excel/Sheets wrap every sheet) carry no rules.
          if(item.type==="CDO"||item.type==="CDC")return;
          if(item.type!=="Rule"||item.prelude?.type!=="SelectorList"){b.loss("unsupported-style");return;}
          const declarations=new Map<string,Value>();item.block.children.forEach(d=>{
            if(d.type!=="Declaration"){b.loss("unsupported-style");return;}if(++this.#declarations>8192)fail("resource-limit");
            for(const [name,value]of declarationValues(d)){
              if(!declarations.get(name)?.important||d.important)declarations.set(name,{value,important:Boolean(d.important)});
            }
          });
          item.prelude.children.forEach(s=>{const parsed=selector(generate(s));if(!parsed){b.loss("unsupported-style");return;}if(this.#rules.length>=256)fail("resource-limit");this.#rules.push({selector:parsed,declarations,order:this.#rules.length});});
        });
      }catch(error){if(error instanceof ConversionFailure)throw error;b.loss("unsupported-style");}
    }
  }
  consumed(node:HtmlElement):boolean{return this.#styleNodes.has(node);}
  #classesOf(node:HtmlElement):Set<string>{
    let classes=this.#classes.get(node);
    if(!classes){
      const tokens=(attribute(node,"class")??"").split(/\s+/).filter(Boolean);if(tokens.length>64)fail("resource-limit");
      classes=new Set(tokens);this.#classes.set(node,classes);
    }
    return classes;
  }
  #matches(node:HtmlElement,part:Compound):boolean{
    return (part.tag===undefined||part.tag===node.tagName)&&(part.id===undefined||part.id===attribute(node,"id"))&&part.classes.every(c=>this.#classesOf(node).has(c));
  }
  #matchesSelector(node:HtmlElement,{parts}:Selector):boolean{
    if(!this.#matches(node,parts.at(-1)!))return false;
    let ancestor=node.parentNode;
    for(let i=parts.length-2;i>=0;i--){
      let matched=false;
      while(ancestor&&"tagName" in ancestor&&ancestor.namespaceURI==="http://www.w3.org/1999/xhtml"){
        if(++this.#ancestorChecks>8*limits.parsedNodes)fail("resource-limit");
        matched=this.#matches(ancestor,parts[i]!);ancestor=ancestor.parentNode;
        if(matched)break;
      }
      if(!matched)return false;
    }
    return true;
  }
  apply(node:HtmlElement,inline:Map<string,string>,inlineImportant:ReadonlySet<string>):Map<string,string> {
    this.#classesOf(node);
    const values=new Map<string,Value&{specificity:number;order:number}>();
    for(const rule of this.#rules){const s=rule.selector;if(!this.#matchesSelector(node,s))continue;
      for(const [name,value]of rule.declarations){const prior=values.get(name),replace=!prior||value.important&&!prior.important||value.important===prior.important&&(s.specificity>prior.specificity||s.specificity===prior.specificity&&rule.order>prior.order);if(replace)values.set(name,{...value,specificity:s.specificity,order:rule.order});}
    }
    const result=new Map([...values].map(([name,v])=>[name,v.value]));for(const [name,value]of inline){if(!values.get(name)?.important||inlineImportant.has(name))result.set(name,value);}return result;
  }
}
