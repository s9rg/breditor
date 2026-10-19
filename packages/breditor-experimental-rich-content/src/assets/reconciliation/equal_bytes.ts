/** Exact synchronous byte equality for an active IDB transaction. Word comparison is
 * endian-independent here: both arrays are read on the same host, with no conversion. */
export function equalAssetBytes(a: ArrayBuffer,b: ArrayBuffer):boolean{
 if(a.byteLength!==b.byteLength)return false;
 const count=Math.floor(a.byteLength/4),x=new Uint32Array(a,0,count),y=new Uint32Array(b,0,count);
 for(let i=0;i<count;i++)if(x[i]!==y[i])return false;
 const ax=new Uint8Array(a),by=new Uint8Array(b);for(let i=count*4;i<ax.length;i++)if(ax[i]!==by[i])return false;
 return true;
}
