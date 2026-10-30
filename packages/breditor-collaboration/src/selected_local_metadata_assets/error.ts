/** Keep payloads and private source diagnostics out of dependency errors. */
export class LocalMetadataAssetError extends Error {
 constructor(readonly code='local_metadata_assets_source'){
  super('Use the exact native history and complete retained metadata at this recorded point');
  this.name='LocalMetadataAssetError';
 }
}
export const fail=(code?:string)=>new LocalMetadataAssetError(code);
