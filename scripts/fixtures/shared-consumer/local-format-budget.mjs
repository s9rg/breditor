// An installed-binary regression, not a handwritten owner or workspace import.
import assert from "node:assert/strict";

export function assertLocalFormatBudget(profile){
 const binding=profile.descriptor(),kinds=["breditor/strong","breditor-inline/italic","breditor-inline/underline","breditor-inline/strike"],count=257;
 const root={kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"installed-format-budget"},children:Array.from({length:count},(_,i)=>({kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":`p${i}`},children:[{kind:"text",text:"x",formats:[]}]}))};
 const owner=profile.createEditor(JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,root}));
 try{
  const before=owner.documentJson();owner.execute({kind:"changeInlineFormats",data:{changes:kinds.map(type=>({kind:"set",formatsJson:JSON.stringify([{type,properties:{}}])})),targets:Array.from({length:count},(_,i)=>({block:`p${i}`,start:"0",end:"1"}))}});
  // 257 block patches fit 1,024 operations, even though 257 × 4 keys do not.
  assert.equal(owner.view().undoDepth,1);assert.equal(owner.view().revision,"1");
  const after=owner.documentJson();for(const paragraph of JSON.parse(after).root.children)assert.deepEqual(paragraph.children[0].formats.map(format=>format.type),[...kinds].sort());
  owner.execute({kind:"undo"});assert.equal(owner.documentJson(),before);
  owner.execute({kind:"redo"});assert.equal(owner.documentJson(),after);
 }finally{owner.dispose();}
}
