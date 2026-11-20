/** Chrome text with document-derived values (headings, names, comment text) kept in their own bidi context. */
import type {RichUiLocale,RichUiStringKey} from "./ui_locale.js";
/**
 * Write one catalog template into a chrome element. When the catalog names a chrome direction, the `isolate`
 * values are wrapped in `<bdi>` so an English heading or author name keeps its own direction inside RTL chrome
 * (and vice versa). Without a catalog direction this is exactly `textContent = ui.text(key, values)`.
 */
export function setRichChromeText(element:HTMLElement,ui:RichUiLocale,key:RichUiStringKey,values:Readonly<Record<string,string|number>>,isolate:readonly string[]):void{
 if(ui.direction===null||!isolate.length){element.textContent=ui.text(key,values);return;}
 const template=ui.strings[key],nodes:(string|Node)[]=[];let last=0;
 for(const match of template.matchAll(/\{([A-Za-z]+)\}/g)){
  nodes.push(template.slice(last,match.index));last=match.index+match[0].length;const name=match[1]!;
  if(!Object.prototype.hasOwnProperty.call(values,name))nodes.push(match[0]);
  else if(isolate.includes(name)){const node=element.ownerDocument.createElement("bdi");node.textContent=String(values[name]);nodes.push(node);}
  else nodes.push(String(values[name]));
 }
 nodes.push(template.slice(last));element.replaceChildren(...nodes.filter(node=>node!==""));
}
