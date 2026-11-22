import {expect,it} from "vitest";
import {renderStaticDocument,staticCodeHighlightingStyles} from "../src/static_document.js";
import {el,envelope,text} from "./static_document_fixture.js";

const block=(id:string,language:string,source:string)=>el("code-block",{"block-id":id,language},[text(source)]);

it("adds opt-in syntax colors and preserves literal code in static HTML",()=>{
 const source='const label = "<tag>&🌱";\n// code';
 const input=envelope([block("code","ts",source)]);
 expect(renderStaticDocument(input,{codeHighlighting:false})).toBe(renderStaticDocument(input));
 const root=document.createElement("div");
 root.innerHTML=renderStaticDocument(input,{codeHighlighting:true});
 expect(root.querySelector("code")?.textContent).toBe(source);
 expect(root.querySelector("[data-breditor-code-token='keyword']")?.textContent).toBe("const");
 expect(root.querySelector("[data-breditor-code-token='string']")?.textContent).toBe('"<tag>&🌱"');
 expect(root.querySelector("tag")).toBeNull();
 expect(root.querySelector("style")?.textContent).toBe(staticCodeHighlightingStyles);
});

it("leaves unsupported and oversized code plain, with the palette available for fragments",()=>{
 const huge="const ".repeat(2_800);
 const root=document.createElement("div");
 root.innerHTML=renderStaticDocument(envelope([
  block("unknown","other","const x = 1;"),block("large","js",huge),block("ok","json",'{"enabled":true}'),
 ]),{fragment:true,codeHighlighting:true});
 expect(root.querySelector("style")).toBeNull();
 expect(root.querySelector('[data-rich-text="unknown"] span')).toBeNull();
 expect(root.querySelector('[data-rich-text="large"] code')?.textContent).toBe(huge);
 expect(root.querySelector('[data-rich-text="large"] span')).toBeNull();
 expect(root.querySelector('[data-rich-text="ok"] [data-breditor-code-token="literal"]')?.textContent).toBe("true");
 expect(staticCodeHighlightingStyles).toContain("--breditor-code-literal");
});
