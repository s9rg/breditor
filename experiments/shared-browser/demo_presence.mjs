// Same-page demonstration of the separate ephemeral channel, not network authentication.
import {SharedPresence} from "/shared.js";
export function installDemoPresence(a,b,report){
 const pa=new SharedPresence(a,{onError:report}),pb=new SharedPresence(b,{onError:report}),outputs=[];
 for(const [channel,id]of[[pa,"a"],[pb,"b"]]){
  const root=document.querySelector(`#${id}`),output=document.createElement("output");output.id=`presence-${id}`;root.before(output);outputs.push(output);
  const paint=()=>{const peers=channel.view();output.textContent=peers.map(peer=>{
   const r=peer.resolution;if(!r)return`${peer.label}: no active selection`;
   if(r.kind==="pending")return`${peer.label}: waiting for document updates`;
   if(r.kind==="cleared")return`${peer.label}: selection unavailable (${r.reason})`;
   const s=r.selection;if(!s)return`${peer.label}: no active selection`;
   if(s.kind==="node")return`${peer.label}: node ${s.block}`;
   if(s.kind==="grid")return`${peer.label}: cells ${s.anchor.table}/${s.anchor.row}/${s.anchor.column} → ${s.focus.row}/${s.focus.column}`;
   return s.anchor.block===s.focus.block&&s.anchor.offset===s.focus.offset?`${peer.label}: caret ${s.focus.block}@${s.focus.offset}`:`${peer.label}: text ${s.anchor.block}@${s.anchor.offset} → ${s.focus.block}@${s.focus.offset}`;
  }).join(" · ")||"No peer selection";};channel.subscribe(paint);paint();
 }
 const links=[{source:a,target:pb,writer:"101",label:"Writer A",session:"",sequence:0n},{source:b,target:pa,writer:"202",label:"Writer B",session:"",sequence:0n}];let connected=false;
 const local=core=>{if(!connected)return;const link=links.find(value=>value.source===core);if(link)link.target.receive(link.writer,link.session,String(++link.sequence),core.presenceFrame());};
 const connect=()=>{for(const link of links){link.session=crypto.randomUUID();link.sequence=0n;link.target.announce({writer:link.writer,session:link.session,label:link.label});}connected=true;local(a);local(b);};
 const disconnect=()=>{connected=false;for(const link of links)link.target.remove(link.writer,link.session);};
 const heartbeat=setInterval(()=>{try{local(a);local(b);}catch(error){report(error);}},5000);
 return {local,connect,disconnect,dispose(){connected=false;clearInterval(heartbeat);pa.dispose();pb.dispose();for(const output of outputs)output.remove();}};
}
