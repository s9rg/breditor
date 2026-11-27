// @vitest-environment node
import {afterEach,describe,expect,it,vi} from "vitest";
import {renderStaticDocumentContents} from "../src/static_document.js";
import {envelope,p,text} from "./static_document_fixture.js";

const document=envelope([p("a",[text("Trusted <b>")])]);
const load=async()=>{vi.resetModules();const module=await import("../src/static_trusted_html.js"),{StaticDocumentError}=await import("../src/static_document.js");return {...module,StaticDocumentError};};
afterEach(()=>{vi.unstubAllGlobals();});

describe("static render under Trusted Types",()=>{
 it("returns the plain renderer string where Trusted Types are absent (server rendering)",async()=>{
  const {renderStaticDocumentTrustedContents}=await load();
  expect(renderStaticDocumentTrustedContents(document)).toBe(renderStaticDocumentContents(document));
 });
 it("wraps only renderer output through one lazily created policy named breditor-static-html",async()=>{
  const created:string[]=[],wrapped:string[]=[];
  vi.stubGlobal("trustedTypes",{createPolicy(name:string,rules:{createHTML(input:string):string}){
   created.push(name);
   return {createHTML:(input:string)=>{wrapped.push(input);return Object.freeze({trusted:rules.createHTML(input)});}};
  }});
  const {renderStaticDocumentTrustedContents,staticTrustedTypesPolicyName}=await load();
  expect(created).toEqual([]);
  const first=renderStaticDocumentTrustedContents(document),second=renderStaticDocumentTrustedContents(document);
  expect(staticTrustedTypesPolicyName).toBe("breditor-static-html");
  expect(created).toEqual(["breditor-static-html"]);
  expect(first).toEqual({trusted:renderStaticDocumentContents(document)});
  expect(second).toEqual(first);
  expect(wrapped.every(html=>html.includes("Trusted &lt;b&gt;"))).toBe(true);
 });
 it("reports a host policy that does not allow the name, and retries after the host fixes it",async()=>{
  let allowed=false;
  vi.stubGlobal("trustedTypes",{createPolicy(name:string){
   if(!allowed)throw new TypeError(`Policy "${name}" disallowed`);
   return {createHTML:(input:string)=>({input})};
  }});
  const {renderStaticDocumentTrustedContents,StaticDocumentError}=await load();
  let failure:unknown;
  try{renderStaticDocumentTrustedContents(document);}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(StaticDocumentError);
  expect((failure as {code:string}).code).toBe("trusted-types-policy");
  expect((failure as Error).cause).toBeInstanceOf(TypeError);
  allowed=true;
  expect(renderStaticDocumentTrustedContents(document)).toEqual({input:renderStaticDocumentContents(document)});
 });
});
