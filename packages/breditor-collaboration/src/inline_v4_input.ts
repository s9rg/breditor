/** Primitive snapshots of the shared V4 inline command inputs (the local slice intent JSON); Rust re-admits every value. */
/** The local `setImageLink` intent: `image` is the image's `breditor/image-id`. */
export type SharedImageLinkIntent={image:string;href:string;newWindow?:boolean}|{image:string;href:null};

const plain=(input:unknown,what:string):Record<string,unknown>=>{
 if(!input||typeof input!=="object"||Array.isArray(input)||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw new TypeError(`Expected plain ${what}`);
 return input as Record<string,unknown>;
};
/** `{"language": tag|null}`; Rust canonicalizes case and refuses malformed tags. */
export function sharedTextLanguageInput(language:unknown):string{
 if(language!==null&&typeof language!=="string")throw new TypeError("Text language must be a primitive string or null");
 return JSON.stringify({language});
}
/** `{"selection":{kind:"text",anchor,focus},"mention":{kind,id,label}}` (the local intent shape). */
export function sharedMentionInput(selection:unknown,mention:unknown):string{
 const s=plain(selection,"mention target selection"),m=plain(mention,"mention");
 if(s["kind"]!=="text")throw new TypeError("A mention replaces a text range");
 const point=(value:unknown)=>{const p=plain(value,"text point");if(typeof p["block"]!=="string"||typeof p["offset"]!=="string"||(p["affinity"]!=="before"&&p["affinity"]!=="after"))throw new TypeError("Expected a text point");return {block:p["block"],offset:p["offset"],affinity:p["affinity"]};};
 const keys=Reflect.ownKeys(m);
 if(keys.length!==3||!["kind","id","label"].every(key=>keys.includes(key))||[m["kind"],m["id"],m["label"]].some(value=>typeof value!=="string"))throw new TypeError("A mention has exactly kind, id and label strings");
 return JSON.stringify({selection:{kind:"text",anchor:point(s["anchor"]),focus:point(s["focus"])},mention:{kind:m["kind"],id:m["id"],label:m["label"]}});
}
/** `{"image", "href", "newWindow"?}`; `newWindow` only with a target. */
export function sharedImageLinkInput(intent:unknown):string{
 const record=plain(intent,"image link intent"),keys=Reflect.ownKeys(record);
 if(keys.some(key=>typeof key!=="string"||!["image","href","newWindow"].includes(key))||!keys.includes("image")||!keys.includes("href"))throw new TypeError("Image link intent has image, href and optional newWindow fields");
 const image=record["image"],href=record["href"],newWindow=record["newWindow"];
 if(typeof image!=="string"||(href!==null&&typeof href!=="string")||(newWindow!==undefined&&typeof newWindow!=="boolean")||(href===null&&newWindow!==undefined))throw new TypeError("Expected an image identity, an href string or null and an optional Boolean newWindow with a target");
 return JSON.stringify(newWindow===undefined?{image,href}:{image,href,newWindow});
}
