/**
 * Minimal deterministic ZIP writer (PKWARE APPNOTE 6.3, STORE method only).
 *
 * - No compression: identical entries produce identical bytes on every engine (a platform deflate
 *   implementation could differ between browsers and Node versions).
 * - Fixed DOS timestamp 1980-01-01 00:00, no extra fields, no comments, no data descriptors, no ZIP64.
 * - Entry order is the caller's order; names must be unique ASCII part names without a leading `/`.
 */
const table=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
/** CRC-32 (ISO-HDLC, reflected 0xEDB88320), as required by ZIP. */
export function crc32(data:Uint8Array):number {
  let c=0xffffffff;for(let i=0;i<data.length;i++)c=table[(c^data[i]!)&0xff]!^(c>>>8);return (c^0xffffffff)>>>0;
}
export interface ZipEntry {readonly name:string;readonly data:Uint8Array}
/** 1980-01-01 00:00:00 in MS-DOS date/time encoding. */
export const zipDosDate=0x0021,zipDosTime=0x0000;
/** Upper bound for a STORE archive without ZIP64 (well below 4 GiB; callers apply tighter limits). */
export const zipMaxBytes=0xffff_ff00;
export function zipStore(entries:readonly ZipEntry[]):Uint8Array {
  if(entries.length>0xfffe)throw new RangeError("Too many ZIP entries");
  const names=new Set<string>(),encoder=new TextEncoder(),prepared=entries.map(entry=>{
    if(!/^[A-Za-z0-9_\-.[\]]+(?:\/[A-Za-z0-9_\-.[\]]+)*$/.test(entry.name)||names.has(entry.name))throw new TypeError("Invalid or duplicate ZIP entry name");
    names.add(entry.name);return{name:encoder.encode(entry.name),data:entry.data,crc:crc32(entry.data)};
  });
  let size=22;for(const e of prepared)size+=30+e.name.length+e.data.length+46+e.name.length;
  if(size>zipMaxBytes)throw new RangeError("ZIP archive too large");
  const out=new Uint8Array(size),view=new DataView(out.buffer);let at=0;
  const u16=(v:number)=>{view.setUint16(at,v,true);at+=2;},u32=(v:number)=>{view.setUint32(at,v>>>0,true);at+=4;},raw=(b:Uint8Array)=>{out.set(b,at);at+=b.length;};
  const offsets:number[]=[];
  for(const e of prepared){
    offsets.push(at);
    u32(0x04034b50);u16(20);u16(0);u16(0);u16(zipDosTime);u16(zipDosDate);u32(e.crc);u32(e.data.length);u32(e.data.length);u16(e.name.length);u16(0);raw(e.name);raw(e.data);
  }
  const central=at;
  for(const [i,e]of prepared.entries()){
    u32(0x02014b50);u16(20);u16(20);u16(0);u16(0);u16(zipDosTime);u16(zipDosDate);u32(e.crc);u32(e.data.length);u32(e.data.length);u16(e.name.length);u16(0);u16(0);u16(0);u16(0);u32(0);u32(offsets[i]!);raw(e.name);
  }
  const centralSize=at-central;
  u32(0x06054b50);u16(0);u16(0);u16(prepared.length);u16(prepared.length);u32(centralSize);u32(central);u16(0);
  if(at!==size)throw new Error("ZIP size accounting mismatch");
  return out;
}
