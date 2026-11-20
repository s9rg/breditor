/** Test-only ZIP reader and strict XML 1.0 well-formedness parser (no dependencies). */
import {inflateRawSync} from "node:zlib";
const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc=(d:Uint8Array)=>{let c=0xffffffff;for(const b of d)c=crcTable[(c^b)&0xff]!^(c>>>8);return (c^0xffffffff)>>>0;};
export interface ZipFile {readonly name:string;readonly method:number;readonly data:Uint8Array;readonly time:number;readonly date:number}
/** Reads through the central directory, cross-checks every local header and verifies CRC-32. */
export function unzip(bytes:Uint8Array):ZipFile[] {
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),dec=new TextDecoder("utf-8",{fatal:true});
  const eocd=bytes.length-22;if(eocd<0||v.getUint32(eocd,true)!==0x06054b50)throw Error("No end of central directory (or archive comment present)");
  const count=v.getUint16(eocd+10,true),cdSize=v.getUint32(eocd+12,true),cdOffset=v.getUint32(eocd+16,true);
  if(v.getUint16(eocd+8,true)!==count||cdOffset+cdSize!==eocd)throw Error("Inconsistent end record");
  const files:ZipFile[]=[];let at=cdOffset;
  for(let i=0;i<count;i++){
    if(v.getUint32(at,true)!==0x02014b50)throw Error("Bad central header");
    const flags=v.getUint16(at+8,true),method=v.getUint16(at+10,true),time=v.getUint16(at+12,true),date=v.getUint16(at+14,true),c=v.getUint32(at+16,true),csize=v.getUint32(at+20,true),usize=v.getUint32(at+24,true),nlen=v.getUint16(at+28,true),xlen=v.getUint16(at+30,true),clen=v.getUint16(at+32,true),offset=v.getUint32(at+42,true);
    const name=dec.decode(bytes.subarray(at+46,at+46+nlen));at+=46+nlen+xlen+clen;
    if(flags&0x0001)throw Error("Encrypted entry");
    if(v.getUint32(offset,true)!==0x04034b50)throw Error("Bad local header");
    const lnlen=v.getUint16(offset+26,true),lxlen=v.getUint16(offset+28,true);
    if(dec.decode(bytes.subarray(offset+30,offset+30+lnlen))!==name||v.getUint16(offset+8,true)!==method||v.getUint32(offset+14,true)!==c)throw Error("Local/central mismatch");
    const raw=bytes.subarray(offset+30+lnlen+lxlen,offset+30+lnlen+lxlen+csize);
    const data=method===0?raw:method===8?new Uint8Array(inflateRawSync(raw)):(()=>{throw Error(`Unsupported method ${method}`);})();
    if(data.length!==usize||crc(data)!==c)throw Error(`CRC/size mismatch in ${name}`);
    files.push({name,method,data,time,date});
  }
  if(at!==cdOffset+cdSize)throw Error("Central directory size mismatch");
  return files;
}
export interface XmlElement {readonly name:string;readonly attributes:Readonly<Record<string,string>>;readonly children:(XmlElement|string)[]}
const nameChar=/^[A-Za-z_:][A-Za-z0-9_.:-]*$/;
const entities:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'"};
function decode(text:string):string{
  if(/&(?![^;&\s]+;)/.test(text))throw Error("Bare ampersand");
  return text.replace(/&([^;]*);/g,(_m,e:string)=>{
    if(e in entities)return entities[e]!;
    const m=/^#(?:x([0-9A-Fa-f]+)|([0-9]+))$/.exec(e);if(!m)throw Error(`Bad entity &${e};`);
    return String.fromCodePoint(m[1]?parseInt(m[1],16):Number(m[2]));
  });
}
const invalidChars=/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;
/** Strict subset parser: one root, balanced tags, unique attributes, declared namespace prefixes. */
export function parseXml(source:string):XmlElement {
  if(invalidChars.test(source))throw Error("Invalid XML character");
  let i=0;
  if(source.startsWith("<?xml")){i=source.indexOf("?>")+2;if(i<2)throw Error("Bad declaration");}
  const stack:{el:XmlElement;ns:Map<string,string>}[]=[];let root:XmlElement|undefined;
  const checkPrefix=(qname:string,scope:Map<string,string>,attribute:boolean)=>{
    const colon=qname.indexOf(":");if(colon<0)return;const prefix=qname.slice(0,colon);
    if(prefix==="xml"||(attribute&&prefix==="xmlns"))return;
    if(!scope.has(prefix))throw Error(`Undeclared prefix ${prefix} on ${qname}`);
  };
  while(i<source.length){
    const lt=source.indexOf("<",i);
    const text=source.slice(i,lt<0?source.length:lt);
    if(text){if(!stack.length){if(text.trim())throw Error("Text outside root");}else{if(text.includes(">")&&text.includes("]]>"))throw Error("]]> in text");stack.at(-1)!.el.children.push(decode(text));}}
    if(lt<0)break;
    if(source.startsWith("</",lt)){
      const gt=source.indexOf(">",lt);const name=source.slice(lt+2,gt).trim();const top=stack.pop();
      if(!top||top.el.name!==name)throw Error(`Mismatched </${name}>`);i=gt+1;continue;
    }
    if(source.startsWith("<!--",lt)||source.startsWith("<!",lt)||source.startsWith("<?",lt))throw Error("Unexpected markup declaration");
    const gt=source.indexOf(">",lt);if(gt<0)throw Error("Unterminated tag");
    let body=source.slice(lt+1,gt);const selfClosing=body.endsWith("/");if(selfClosing)body=body.slice(0,-1);
    const nm=/^[^\s/>]+/.exec(body);if(!nm||!nameChar.test(nm[0]))throw Error(`Bad tag name in <${body}>`);
    const attributes:Record<string,string>={};let rest=body.slice(nm[0].length);
    const attr=/^\s+([^\s=]+)\s*=\s*("([^"<]*)"|'([^'<]*)')/;
    for(;;){const m=attr.exec(rest);if(!m)break;if(!nameChar.test(m[1]!))throw Error(`Bad attribute ${m[1]}`);if(m[1]! in attributes)throw Error(`Duplicate attribute ${m[1]}`);attributes[m[1]!]=decode(m[3]??m[4]??"");rest=rest.slice(m[0].length);}
    if(rest.trim())throw Error(`Malformed attributes in <${body}>`);
    const scope=new Map(stack.at(-1)?.ns??[]);for(const [k,v]of Object.entries(attributes))if(k.startsWith("xmlns:"))scope.set(k.slice(6),v);
    checkPrefix(nm[0],scope,false);for(const k of Object.keys(attributes))checkPrefix(k,scope,true);
    const el:XmlElement={name:nm[0],attributes,children:[]};
    if(stack.length)stack.at(-1)!.el.children.push(el);else{if(root)throw Error("Multiple roots");root=el;}
    if(!selfClosing)stack.push({el,ns:scope});i=gt+1;
  }
  if(stack.length||!root)throw Error("Unclosed elements");
  return root;
}
export function all(el:XmlElement,name:string):XmlElement[]{const out:XmlElement[]=[];const walk=(e:XmlElement)=>{if(e.name===name)out.push(e);for(const c of e.children)if(typeof c!=="string")walk(c);};walk(el);return out;}
export function kids(el:XmlElement,name?:string):XmlElement[]{return el.children.filter((c):c is XmlElement=>typeof c!=="string"&&(name===undefined||c.name===name));}
export function textContent(el:XmlElement):string{return el.children.map(c=>typeof c==="string"?c:c.name==="w:t"||c.name==="w:r"||c.name==="w:hyperlink"?textContent(c):c.name==="w:br"?"\n":c.name==="w:tab"?"\t":"").join("");}
