import {generate,parse,type Declaration} from "css-tree";
import {Budget,ConversionFailure,bytes,fail} from "./budget.js";
import {attribute,isElement,plainText,type HtmlElement,type HtmlNode} from "./html_tree.js";
interface Value {value:string;important:boolean}
interface Selector {tag:string|undefined;id:string|undefined;classes:string[];specificity:number}
interface Rule {selector:Selector;declarations:Map<string,Value>;order:number}
function selector(source:string):Selector|null {
  if(!/^(?:[a-zA-Z][\w-]*|\*)?(?:[.#][a-zA-Z_][\w-]*)*$/.test(source)||!source)return null;
  const tag=/^[a-zA-Z][\w-]*/.exec(source)?.[0]?.toLowerCase(),ids=[...source.matchAll(/#([a-zA-Z_][\w-]*)/g)].map(m=>m[1]!);if(ids.length>1)return null;
  const classes=[...source.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(m=>m[1]!);if(classes.length>8)return null;
  return{tag,id:ids[0],classes,specificity:ids.length*100+classes.length*10+(tag?1:0)};
}
/** Closed simple selectors only; no DOM matching, external stylesheet loads, CSS evaluation or URL fetching. */
export class Stylesheets {
  #rules:Rule[]=[];#styleNodes=new WeakSet<HtmlElement>();#declarations=0;
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
          if(item.type!=="Rule"||item.prelude?.type!=="SelectorList"){b.loss("unsupported-style");return;}
          const declarations=new Map<string,Value>();item.block.children.forEach(d=>{
            if(d.type!=="Declaration"){b.loss("unsupported-style");return;}if(++this.#declarations>8192)fail("resource-limit");const declaration=d as Declaration,name=declaration.property.toLowerCase(),prior=declarations.get(name);if(!prior?.important||declaration.important)declarations.set(name,{value:generate(declaration.value),important:Boolean(declaration.important)});
          });
          item.prelude.children.forEach(s=>{const parsed=selector(generate(s));if(!parsed){b.loss("unsupported-style");return;}if(this.#rules.length>=256)fail("resource-limit");this.#rules.push({selector:parsed,declarations,order:this.#rules.length});});
        });
      }catch(error){if(error instanceof ConversionFailure)throw error;b.loss("unsupported-style");}
    }
  }
  consumed(node:HtmlElement):boolean{return this.#styleNodes.has(node);}
  apply(node:HtmlElement,inline:Map<string,string>,inlineImportant:ReadonlySet<string>):Map<string,string> {
    const classes=(attribute(node,"class")??"").split(/\s+/).filter(Boolean);if(classes.length>64)fail("resource-limit");const classSet=new Set(classes),id=attribute(node,"id"),values=new Map<string,Value&{specificity:number;order:number}>();
    for(const rule of this.#rules){const s=rule.selector;if(s.tag!==undefined&&s.tag!==node.tagName||s.id!==undefined&&s.id!==id||s.classes.some(c=>!classSet.has(c)))continue;
      for(const [name,value]of rule.declarations){const prior=values.get(name),replace=!prior||value.important&&!prior.important||value.important===prior.important&&(s.specificity>prior.specificity||s.specificity===prior.specificity&&rule.order>prior.order);if(replace)values.set(name,{...value,specificity:s.specificity,order:rule.order});}
    }
    const result=new Map([...values].map(([name,v])=>[name,v.value]));for(const [name,value]of inline){if(!values.get(name)?.important||inlineImportant.has(name))result.set(name,value);}return result;
  }
}
