/** Explicit trusted native integrity factory. Files never select executable code. */
export interface SharedRustArchiveDigest {update(bytes:Uint8Array):void;finish():string;free():void}
export interface SharedArchiveDigestModule {
 readonly SharedArchiveDigest:{version():string;maximum_bytes():string;maximum_chunk_bytes():string;create(expectedBytes:string):SharedRustArchiveDigest};
}
export interface SharedArchiveIntegrityOptions {
 readonly wasm:SharedArchiveDigestModule;
 /** Must hold synchronously before and after every asynchronous read. */
 readonly checkAuthority:()=>void;
 readonly signal?:AbortSignal;
}
export interface SharedArchiveFileDigest {readonly bytes:number;readonly sha256:string}

/** Numerical transport facts only. Never includes archive bytes, names or paths. */
export interface SharedArchiveReadLengthFailure {
 readonly kind:'read-length';
 readonly offset:number;
 readonly expectedBytes:number;
 readonly observedBeforeAuthorityBytes:number;
 readonly actualBytes:number;
}
