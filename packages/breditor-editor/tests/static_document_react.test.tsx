import {describe,expect,it} from "vitest";
import {renderToString,renderToStaticMarkup} from "react-dom/server";
import {BreditorStaticDocument} from "../src/static_document_react.js";
import {renderStaticDocument,StaticDocumentError} from "../src/static_document.js";
import {el,envelope,fullDocument,p,text} from "./static_document_fixture.js";

describe("BreditorStaticDocument",()=>{
 const resolveAsset=({image}:{image:string})=>image==="i1"?"/assets/i1.png":undefined;
 it("server-renders exactly the vanilla static string",()=>{
  const document=fullDocument();
  const expected=renderStaticDocument(document,{resolveAsset});
  expect(renderToString(<BreditorStaticDocument document={document} options={{resolveAsset}}/>)).toBe(expected);
  expect(renderToStaticMarkup(<BreditorStaticDocument document={JSON.stringify(document)} options={{resolveAsset}}/>)).toBe(expected);
 });
 it("includes the same code, list and print styles as the static string",()=>{
  const document=envelope([
   el("code-block",{"block-id":"sample",language:"javascript"},[text("const value = 3;")]),
   el("page-break",{"block-id":"page"}),
  ]);
  const options={codeHighlighting:true,legalListNumbering:true,print:{size:"Letter" as const}};
  const expected=renderStaticDocument(document,options);
  expect(expected).toContain("data-breditor-print");
  expect(expected).toContain("data-breditor-legal-lists");
  expect(expected).toContain("data-breditor-code-highlighting");
  expect(renderToStaticMarkup(<BreditorStaticDocument document={document} options={options}/>)).toBe(expected);
 });
 it("appends a host class and keeps the shared surface hooks",()=>{
  const html=renderToString(<BreditorStaticDocument document={envelope([p("x",[text("hi")])])} className="article"/>);
  expect(html).toBe('<div class="breditor-rich-surface article" data-breditor-rich="" data-breditor-static=""><p data-rich-block="x" data-rich-text="x">hi</p></div>');
 });
 it("is pure: repeated renders are identical and invalid input throws to the boundary",()=>{
  const element=<BreditorStaticDocument document={fullDocument()}/>;
  expect(renderToString(element)).toBe(renderToString(element));
  expect(()=>renderToString(<BreditorStaticDocument document={{format:"nope"}}/>)).toThrow(StaticDocumentError);
 });
});
