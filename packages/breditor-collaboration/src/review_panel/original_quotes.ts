/** Lazy native historical reads; no replicated quote store or per-keystroke historical forks. */
import type {PanelContext} from "./types.js";
import {button} from "./dom.js";
import {setRichChromeText,type RichUiStringKey} from "@breditor/experimental-rich-content/rendering";
export function originalQuotes(context:PanelContext){
 const d=context.document,ui=context.ui,element=d.createElement("section"),output=d.createElement("div"),cache=new Map<string,{key:RichUiStringKey;text?:string;pending:boolean}>();
 let targets:readonly {packet:string}[]=[],showing=false;
 const show=button(d,ui.text("reviewShowQuotes"),()=>context.run(()=>{showing=true;render(true);}));
 show.disabled=context.core.supportsReviewQuotes?.()!==true||typeof context.core.readReviewQuote!=="function";
 element.append(show,output);
 function render(read:boolean){
  const active=new Set(targets.map(t=>t.packet));for(const packet of cache.keys())if(!active.has(packet))cache.delete(packet);
  if(!showing)return;output.replaceChildren();
  for(const target of targets){let entry=cache.get(target.packet);
   if(read&&(entry===undefined||entry.pending)){const quote=context.core.readReviewQuote!(target.packet);
    const key:RichUiStringKey=quote.kind==="quoted"?(quote.plainText?"reviewQuote":"reviewQuoteCaret"):quote.kind==="document"?"reviewQuoteDocument":quote.kind==="pending"?"reviewQuotePending":"reviewQuoteTooLarge";
    entry={key,...(quote.kind==="quoted"&&quote.plainText?{text:quote.plainText}:{}),pending:quote.kind==="pending"};cache.set(target.packet,entry);
   }
   const line=d.createElement("p");if(entry)setRichChromeText(line,ui,entry.key,entry.text===undefined?{}:{text:entry.text},["text"]);else line.textContent=ui.text("reviewQuoteNotLoaded");output.append(line);
  }
 }
 return {element,render(next:readonly {packet:string}[]){targets=next;render(false);}};
}
