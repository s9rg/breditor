import type {RichProfileDescriptor} from "@breditor/experimental-rich-content";
/** An immutable seed envelope, not a second document model. Rust admits every field. */
export function emptyDocumentJson(binding:Pick<RichProfileDescriptor,"schema"|"schemaFingerprint">,documentId:string,blockId:string):string {
 return JSON.stringify({format:"breditor/document",formatVersion:2,schema:binding.schema,schemaFingerprint:binding.schemaFingerprint,
  root:{kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":documentId},children:[{kind:"element",type:"breditor/paragraph",entityId:null,properties:{"breditor/block-id":blockId},children:[]}]}});
}
