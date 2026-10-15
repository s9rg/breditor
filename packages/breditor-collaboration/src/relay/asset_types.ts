/** Structural subset of RichAssetStore, so this provider never owns/disposes the host's cache. */
export interface SharedRelayAssetInfo {
 readonly asset:string;readonly mime:"image/png"|"image/jpeg"|"image/webp";
 readonly bytes:number;readonly width:number;readonly height:number;
}
export interface SharedRelayAssetCache {
 resolve:(asset:string)=>Promise<string|undefined>;
 cacheRemote:(asset:string,blob:Blob,storageRef:string)=>Promise<SharedRelayAssetInfo>;
 flush:(uploader:(info:Readonly<SharedRelayAssetInfo>,blob:Blob,signal:AbortSignal)=>Promise<string>)=>Promise<void>;
}
export interface SharedRelayAssetsOptions {
 /** Same pinned room endpoint and account as sync; no credential/query is stored in the AST. */
 endpoint:string;principal:string;getToken:(signal:AbortSignal)=>string|Promise<string>;
 store:SharedRelayAssetCache;requestTimeoutMs?:number;
}
