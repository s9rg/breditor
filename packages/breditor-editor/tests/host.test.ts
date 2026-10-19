import {expect,it} from "vitest";
import {claimHost,awaitInitialization} from "../src/host.js";
it("retains original host nodes and excludes concurrent openings until rollback",()=>{
 const host=document.createElement("div"),node=document.createElement("button");host.append(node);const claim=claimHost(host);expect(()=>claimHost(host)).toThrow("pending opening");host.textContent="temporary";claim.rollback();expect(host.firstChild).toBe(node);const second=claimHost(host);second.release();
});
it("rollback leaves unchanged children connected, focused and selected without child mutations",()=>{
 const host=document.createElement("div"),input=document.createElement("input"),sibling=document.createElement("button");input.value="retained input";host.append(input,sibling);document.body.append(host);input.focus();input.setSelectionRange(1,8,"backward");
 const observer=new MutationObserver(()=>{});observer.observe(host,{childList:true});
 try{const claim=claimHost(host);host.dataset["breditorRich"]="";claim.rollback();expect(document.activeElement).toBe(input);expect(input.selectionStart).toBe(1);expect(input.selectionEnd).toBe(8);expect(input.selectionDirection).toBe("backward");expect(input.value).toBe("retained input");expect([...host.childNodes]).toEqual([input,sibling]);expect(host.hasAttribute("data-breditor-rich")).toBe(false);expect(observer.takeRecords()).toHaveLength(0);const next=claimHost(host);next.release();}
 finally{observer.disconnect();host.remove();}
});
it("rollback restores the original order when the same child nodes have been reordered",()=>{
 const host=document.createElement("div"),first=document.createElement("input"),second=document.createElement("button");host.append(first,second);const claim=claimHost(host);host.replaceChildren(second,first);claim.rollback();expect([...host.childNodes]).toEqual([first,second]);
});
it("unchanged rollback does not steal focus back after the user moves elsewhere",()=>{
 const host=document.createElement("div"),inside=document.createElement("input"),outside=document.createElement("input");host.append(inside);document.body.append(host,outside);
 try{inside.focus();const claim=claimHost(host);outside.focus();claim.rollback();expect(document.activeElement).toBe(outside);expect(host.firstChild).toBe(inside);}finally{host.remove();outside.remove();}
});
it("an old rollback cannot erase a newly claimed host",()=>{
 const host=document.createElement("div"),first=claimHost(host);first.release();const second=claimHost(host);host.textContent="new owner";first.rollback();expect(host.textContent).toBe("new owner");second.release();
});
it("abort cancels one wait without cancelling or leaking a rejection from shared initialization",async()=>{
 const abort=new AbortController();let finish!:(value:string)=>void;const shared=new Promise<string>(resolve=>{finish=resolve;}),a=awaitInitialization(shared,abort.signal),b=awaitInitialization(shared);abort.abort();await expect(a).rejects.toMatchObject({name:"AbortError"});finish("ready");expect(await b).toBe("ready");
});
