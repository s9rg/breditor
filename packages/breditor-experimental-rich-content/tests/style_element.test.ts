// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {createRichStyleElement,richDocumentCspNonce} from "../src/style_element.js";
import {mountRichCodeHighlighting} from "../src/code_highlighting.js";

const publish=(nonce:string):HTMLMetaElement=>{
 const meta=document.createElement("meta");meta.setAttribute("property","csp-nonce");meta.nonce=nonce;document.head.append(meta);return meta;
};
afterEach(()=>{document.head.replaceChildren();document.body.replaceChildren();});

describe("editor stylesheets under a nonce-based Content Security Policy",()=>{
 it("creates a plain style element when the host publishes no nonce",()=>{
  expect(richDocumentCspNonce(document)).toBeUndefined();
  const style=createRichStyleElement(document,"p{color:red}");
  expect(style.nonce).toBe("");expect(style.textContent).toBe("p{color:red}");expect(style.isConnected).toBe(false);
 });
 it("copies the published meta nonce, including the hidden-attribute IDL value",()=>{
  const meta=publish("cnVudGltZS1ub25jZS12YWx1ZQ==");
  expect(createRichStyleElement(document,"a{}").nonce).toBe("cnVudGltZS1ub25jZS12YWx1ZQ==");
  // Browsers blank the content attribute after a nonce-bearing policy applies; the IDL slot survives.
  meta.setAttribute("nonce","");meta.nonce="aGlkZGVuLW5vbmNlLXZhbHVlLXg=";
  expect(richDocumentCspNonce(document)).toBe("aGlkZGVuLW5vbmNlLXZhbHVlLXg=");
 });
 it("prefers an explicit feature nonce and ignores an empty carrier",()=>{
  publish("");
  expect(richDocumentCspNonce(document)).toBeUndefined();
  expect(createRichStyleElement(document,"",`explicit`).nonce).toBe("explicit");
 });
 it("reaches stylesheets created by mounted chrome",()=>{
  publish("bW91bnRlZC1jaHJvbWUtbm9uY2U=");
  vi.stubGlobal("Highlight",class{constructor(..._ranges:unknown[]){}});
  Object.defineProperty(window,"CSS",{configurable:true,value:{highlights:new Map()}});
  try{
   const surface=document.createElement("div");document.body.append(surface);
   const mounted=mountRichCodeHighlighting(surface);
   expect(mounted.supported).toBe(true);
   expect(document.head.querySelector("style")?.nonce).toBe("bW91bnRlZC1jaHJvbWUtbm9uY2U=");
   mounted.dispose();
  }finally{vi.unstubAllGlobals();}
 });
});
