/** @internal Owner-local provenance for an async host capture; parsed/copied DTOs are not proofs. */
import {parseRichRetainedAssetReferences} from "./retained_asset_references_metadata.js";
import type {RichRetainedAssetReferencesRead} from "./retained_asset_references_types.js";
export class RichRetainedAssetReferenceRegistry {
 readonly #reads=new WeakSet<RichRetainedAssetReferencesRead>();
 retain(input:string,revision:string,retention:RichRetainedAssetReferencesRead["retention"],documentJson:string):RichRetainedAssetReferencesRead {
  const read=parseRichRetainedAssetReferences(input);
  // The current native document supplies only the source binding, never the inventory.
  const document=JSON.parse(documentJson) as {schema:{name:string;version:number};schemaFingerprint:string;root:{properties:Record<string,unknown>}};
  if(read.revision!==revision||read.retention!==retention||read.schema.name!==document.schema.name||read.schema.version!==document.schema.version||read.schema.fingerprint!==document.schemaFingerprint||read.document!==document.root.properties["breditor/document-id"])throw Error("Retained asset references belong to another source publication");
  this.#reads.add(read);return read;
 }
 check(read:RichRetainedAssetReferencesRead,revision:string):void {
  if(!this.#reads.has(read)||read.revision!==revision)throw Error("Use this owner's exact current retained asset reference read");
 }
}
