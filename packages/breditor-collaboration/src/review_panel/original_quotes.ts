/** Lazy native historical reads; no replicated quote store or per-keystroke historical forks. */
import type {PanelContext} from "./types.js";
import {button} from "./dom.js";
export function originalQuotes(context:PanelContext){
 const d=context.document,element=d.createElement("section"),output=d.createElement("div"),cache=new Map<string,{text:string;pending:boolean}>();
 let targets:readonly {packet:string}[]=[],showing=false;
 const show=button(d,"Show original quotes",()=>context.run(()=>{showing=true;render(true);}));
 show.disabled=context.core.supportsReviewQuotes?.()!==true||typeof context.core.readReviewQuote!=="function";
 element.append(show,output);
 function render(read:boolean){
  const active=new Set(targets.map(t=>t.packet));for(const packet of cache.keys())if(!active.has(packet))cache.delete(packet);
  if(!showing)return;output.replaceChildren();
  for(const target of targets){let entry=cache.get(target.packet);
   if(read&&(entry===undefined||entry.pending)){const quote=context.core.readReviewQuote!(target.packet);
    const text=quote.kind==="quoted"?`Original quote: ${quote.plainText||"(caret — no selected text)"}`:quote.kind==="document"?"Document discussion — no selected quote":quote.kind==="pending"?"Original quote is waiting for document history; retry after catchup.":"Original quote exceeds the 64 KiB limit.";
    entry={text,pending:quote.kind==="pending"};cache.set(target.packet,entry);
   }
   const line=d.createElement("p");line.textContent=entry?.text??"Original quote not loaded; choose Show original quotes to read this captured target.";output.append(line);
  }
 }
 return {element,render(next:readonly {packet:string}[]){targets=next;render(false);}};
}
