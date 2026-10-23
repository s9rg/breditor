/** Private flat local provenance data. A canonical manifest commits ordered raw
 * payloads, never permissions or native ownership. Prefix recipes reconstruct
 * exact prior graph files without nesting archives or cumulative headers. */
export interface FlatLocalPayload{readonly offset:number;readonly bytes:number;readonly sha256:string}
export interface FlatLocalSeedRecipe{readonly kind:'snapshot';readonly prefix:number;readonly parts:readonly number[];readonly mime:string;readonly bytes:number;readonly sha256:string}
export interface FlatLocalPrefixRecipe{readonly kind:'prefix';readonly payloads:number;readonly recipes:number;readonly states:number;readonly root:number;readonly bytes:number;readonly manifestSha256:string}
export type FlatLocalRecipe=FlatLocalSeedRecipe|FlatLocalPrefixRecipe;
export interface FlatLocalStateReference{readonly input:number;readonly additions:readonly number[];readonly state:number}
export interface FlatLocalBody{readonly format:'breditor/shared-flat-local-operation-backup';readonly formatVersion:1;readonly payloads:readonly FlatLocalPayload[];readonly recipes:readonly FlatLocalRecipe[];readonly states:readonly FlatLocalStateReference[];readonly root:number}
export interface FlatLocalManifestSelection{readonly manifestSha256:string}
export interface FlatLocalEncoded{readonly file:Blob;readonly manifestSha256:string}
/** In-memory immutable data caches do not retain grants or native pointers. */
export interface FlatLocalFramingState extends FlatLocalEncoded{readonly header:FlatLocalBody;readonly blobs:readonly Blob[];readonly recipeFiles:Map<number,Blob>;readonly payloadIndices:ReadonlyMap<string,number>}
