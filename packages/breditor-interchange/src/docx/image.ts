/**
 * Header-only raster sniffing for DOCX media. Nothing is decoded: the signature selects the part
 * extension/content type and the header supplies intrinsic pixel dimensions when the native image
 * has no display size. Only formats every mainstream DOCX consumer renders are admitted.
 */
export interface SniffedImage {readonly extension:"png"|"jpeg"|"gif";readonly contentType:string;readonly width:number;readonly height:number}
const be16=(b:Uint8Array,i:number)=>(b[i]!<<8)|b[i+1]!,be32=(b:Uint8Array,i:number)=>((b[i]!<<24)|(b[i+1]!<<16)|(b[i+2]!<<8)|b[i+3]!)>>>0,le16=(b:Uint8Array,i:number)=>b[i]!|(b[i+1]!<<8);
const valid=(w:number,h:number)=>Number.isInteger(w)&&Number.isInteger(h)&&w>=1&&h>=1&&w<=65535&&h<=65535;
export function sniffImage(b:Uint8Array):SniffedImage|undefined {
  if(b.length>=24&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47&&b[4]===0x0d&&b[5]===0x0a&&b[6]===0x1a&&b[7]===0x0a&&b[12]===0x49&&b[13]===0x48&&b[14]===0x44&&b[15]===0x52){
    const w=be32(b,16),h=be32(b,20);return valid(w,h)?{extension:"png",contentType:"image/png",width:w,height:h}:undefined;
  }
  if(b.length>=10&&b[0]===0x47&&b[1]===0x49&&b[2]===0x46&&b[3]===0x38&&(b[4]===0x37||b[4]===0x39)&&b[5]===0x61){
    const w=le16(b,6),h=le16(b,8);return valid(w,h)?{extension:"gif",contentType:"image/gif",width:w,height:h}:undefined;
  }
  if(b.length>=4&&b[0]===0xff&&b[1]===0xd8){
    // Walk marker segments to the first start-of-frame; bounded by the buffer length.
    let i=2;
    while(i+3<b.length){
      if(b[i]!==0xff)return undefined;
      const marker=b[i+1]!;
      if(marker===0xff){i++;continue;}
      if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7)){i+=2;continue;}
      if(marker===0xd9||marker===0xda)return undefined;
      const length=be16(b,i+2);if(length<2)return undefined;
      if(marker>=0xc0&&marker<=0xcf&&marker!==0xc4&&marker!==0xc8&&marker!==0xcc){
        if(i+9>=b.length)return undefined;const h=be16(b,i+5),w=be16(b,i+7);
        return valid(w,h)?{extension:"jpeg",contentType:"image/jpeg",width:w,height:h}:undefined;
      }
      i+=2+length;
    }
  }
  return undefined;
}
