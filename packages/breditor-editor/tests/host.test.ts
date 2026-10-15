import {expect,it} from "vitest";
import {claimHost,awaitInitialization} from "../src/host.js";
it("retains original host nodes and excludes concurrent openings until rollback",()=>{
 const host=document.createElement("div"),node=document.createElement("button");host.append(node);const claim=claimHost(host);expect(()=>claimHost(host)).toThrow("pending opening");host.textContent="temporary";claim.rollback();expect(host.firstChild).toBe(node);const second=claimHost(host);second.release();
});
it("an old rollback cannot erase a newly claimed host",()=>{
 const host=document.createElement("div"),first=claimHost(host);first.release();const second=claimHost(host);host.textContent="new owner";first.rollback();expect(host.textContent).toBe("new owner");second.release();
});
it("abort cancels one wait without cancelling or leaking a rejection from shared initialization",async()=>{
 const abort=new AbortController();let finish!:(value:string)=>void;const shared=new Promise<string>(resolve=>{finish=resolve;}),a=awaitInitialization(shared,abort.signal),b=awaitInitialization(shared);abort.abort();await expect(a).rejects.toMatchObject({name:"AbortError"});finish("ready");expect(await b).toBe("ready");
});
