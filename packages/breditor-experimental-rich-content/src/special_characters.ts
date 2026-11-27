/**
 * Special-character catalog and the accessible picker body. Inserting a character is ordinary native text
 * input (one history group); nothing here touches the document model. See docs/FORMATTING_PRODUCTIVITY.md.
 */
import {createRichStyleElement} from "./style_element.js";
import type {RichControlPanelPort} from "./toolbar_control_view.js";
import type {RichUiLocale} from "./ui_locale.js";

export interface RichSpecialCharacter {readonly character:string;readonly name:string}
export interface RichSpecialCharacterCategory {readonly id:string;readonly label:string;readonly characters:readonly RichSpecialCharacter[]}
export interface RichSpecialCharacterOptions {
 /** Host categories. An existing id (built-in or earlier) appends its characters; a new id adds a category. */
 readonly categories?:readonly RichSpecialCharacterCategory[];
 /** Category ids in display order; unlisted categories follow in registration order. Unknown ids reject. */
 readonly order?:readonly string[];
 /** Include the built-in categories (default true). */
 readonly builtIn?:boolean;
}
export interface RichSpecialCharacterCatalog {readonly categories:readonly RichSpecialCharacterCategory[]}

export const RICH_SPECIAL_CHARACTER_MAX_CATEGORIES=32;
export const RICH_SPECIAL_CHARACTER_MAX_CHARACTERS=4096;
const MAX_IN_CATEGORY=1024;

// Compact built-in data: "character|English name" entries separated by ";".
const data:readonly [string,string,string][]=[
 ["currency","Currency","$|Dollar sign;€|Euro sign;£|Pound sign;¥|Yen sign;¢|Cent sign;₹|Indian rupee sign;₽|Ruble sign;₩|Won sign;₪|New sheqel sign;₫|Dong sign;₺|Turkish lira sign;₴|Hryvnia sign;₦|Naira sign;₱|Peso sign;฿|Thai baht;₡|Colon sign;₲|Guarani sign;₵|Cedi sign;₸|Tenge sign;₼|Manat sign;₾|Lari sign;₿|Bitcoin sign;¤|Currency sign;ƒ|Florin sign"],
 ["mathematical","Mathematical","±|Plus-minus sign;×|Multiplication sign;÷|Division sign;−|Minus sign;∓|Minus-or-plus sign;≠|Not equal to;≈|Almost equal to;≡|Identical to;≤|Less-than or equal to;≥|Greater-than or equal to;∞|Infinity;√|Square root;∛|Cube root;∑|N-ary summation;∏|N-ary product;∫|Integral;∂|Partial differential;∆|Increment;∇|Nabla;∈|Element of;∉|Not an element of;∩|Intersection;∪|Union;⊂|Subset of;⊃|Superset of;⊆|Subset of or equal to;∅|Empty set;∀|For all;∃|There exists;¬|Not sign;∧|Logical and;∨|Logical or;∝|Proportional to;∠|Angle;⊥|Up tack;°|Degree sign;‰|Per mille sign;½|Vulgar fraction one half;⅓|Vulgar fraction one third;¼|Vulgar fraction one quarter;¾|Vulgar fraction three quarters;²|Superscript two;³|Superscript three;π|Greek small letter pi;µ|Micro sign;Ω|Ohm sign"],
 ["arrows","Arrows","←|Leftwards arrow;→|Rightwards arrow;↑|Upwards arrow;↓|Downwards arrow;↔|Left right arrow;↕|Up down arrow;↖|North west arrow;↗|North east arrow;↘|South east arrow;↙|South west arrow;⇐|Leftwards double arrow;⇒|Rightwards double arrow;⇑|Upwards double arrow;⇓|Downwards double arrow;⇔|Left right double arrow;↩|Leftwards arrow with hook;↪|Rightwards arrow with hook;↺|Anticlockwise open circle arrow;↻|Clockwise open circle arrow;➔|Heavy wide-headed rightwards arrow"],
 ["latin","Latin","À|Latin capital letter A with grave;Á|Latin capital letter A with acute;Â|Latin capital letter A with circumflex;Ä|Latin capital letter A with diaeresis;Å|Latin capital letter A with ring above;Æ|Latin capital letter AE;Ç|Latin capital letter C with cedilla;È|Latin capital letter E with grave;É|Latin capital letter E with acute;Ê|Latin capital letter E with circumflex;Ë|Latin capital letter E with diaeresis;Ñ|Latin capital letter N with tilde;Ö|Latin capital letter O with diaeresis;Ø|Latin capital letter O with stroke;Œ|Latin capital ligature OE;Ü|Latin capital letter U with diaeresis;à|Latin small letter a with grave;á|Latin small letter a with acute;â|Latin small letter a with circumflex;ä|Latin small letter a with diaeresis;å|Latin small letter a with ring above;æ|Latin small letter ae;ç|Latin small letter c with cedilla;è|Latin small letter e with grave;é|Latin small letter e with acute;ê|Latin small letter e with circumflex;ë|Latin small letter e with diaeresis;ì|Latin small letter i with grave;í|Latin small letter i with acute;ï|Latin small letter i with diaeresis;ñ|Latin small letter n with tilde;ò|Latin small letter o with grave;ó|Latin small letter o with acute;ô|Latin small letter o with circumflex;ö|Latin small letter o with diaeresis;ø|Latin small letter o with stroke;œ|Latin small ligature oe;ß|Latin small letter sharp s;ù|Latin small letter u with grave;ú|Latin small letter u with acute;û|Latin small letter u with circumflex;ü|Latin small letter u with diaeresis;ÿ|Latin small letter y with diaeresis;İ|Latin capital letter I with dot above;ı|Latin small letter dotless i;Ł|Latin capital letter L with stroke;ł|Latin small letter l with stroke;Š|Latin capital letter S with caron;š|Latin small letter s with caron;Ž|Latin capital letter Z with caron;ž|Latin small letter z with caron;Þ|Latin capital letter thorn;þ|Latin small letter thorn;Ð|Latin capital letter eth;ð|Latin small letter eth"],
 ["text","Text","…|Horizontal ellipsis;–|En dash;—|Em dash;‘|Left single quotation mark;’|Right single quotation mark;“|Left double quotation mark;”|Right double quotation mark;‚|Single low-9 quotation mark;„|Double low-9 quotation mark;«|Left-pointing double angle quotation mark;»|Right-pointing double angle quotation mark;‹|Single left-pointing angle quotation mark;›|Single right-pointing angle quotation mark;•|Bullet;·|Middle dot;†|Dagger;‡|Double dagger;§|Section sign;¶|Pilcrow sign;©|Copyright sign;®|Registered sign;™|Trade mark sign;℠|Service mark;№|Numero sign;¡|Inverted exclamation mark;¿|Inverted question mark;′|Prime;″|Double prime;\u00A0|No-break space;\u2009|Thin space;\u00AD|Soft hyphen;‑|Non-breaking hyphen"],
];
/** Frozen built-in categories (English names; the UI catalog localizes them). */
export const richSpecialCharacterCategories:readonly RichSpecialCharacterCategory[]=Object.freeze(data.map(([id,label,list])=>Object.freeze({id,label,characters:Object.freeze(list.split(";").map(entry=>{const index=entry.indexOf("|");return Object.freeze({character:entry.slice(0,index),name:entry.slice(index+1)});}))})));

const wellFormed=(value:string):boolean=>(value as unknown as {isWellFormed?:()=>boolean}).isWellFormed?.()??!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
const controls=/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
function plainRecord(value:unknown,what:string):Readonly<Record<string,unknown>>{
 if(value===null||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError(`Expected ${what} to be a plain object`);
 return value as Readonly<Record<string,unknown>>;
}
function text(value:unknown,what:string,max:number):string{
 if(typeof value!=="string"||!value.trim()||value.length>max||controls.test(value)||!wellFormed(value))throw new TypeError(`Expected ${what} to be a nonempty string of at most ${max} characters without control characters`);
 return value;
}
function character(value:unknown,what:string):string{
 if(typeof value!=="string"||!value||value.length>16||controls.test(value)||!wellFormed(value))throw new TypeError(`Expected ${what} to be one character or short sequence (at most 16 UTF-16 units) without control characters`);
 return value;
}
/** Validate and freeze a catalog: built-in categories (unless `builtIn:false`), host categories and order. */
export function createSpecialCharacterCatalog(options:RichSpecialCharacterOptions={}):RichSpecialCharacterCatalog{
 const input=plainRecord(options,"special-character options");
 for(const key of Object.keys(input))if(!["categories","order","builtIn"].includes(key))throw new TypeError(`Unknown special-character option ${JSON.stringify(key)}`);
 if(input["builtIn"]!==undefined&&typeof input["builtIn"]!=="boolean")throw new TypeError("Expected builtIn to be a boolean");
 const merged=new Map<string,{label:string;characters:RichSpecialCharacter[];seen:Set<string>}>();
 const add=(category:RichSpecialCharacterCategory,where:string)=>{
  const entry=plainRecord(category,where);for(const key of Object.keys(entry))if(!["id","label","characters"].includes(key))throw new TypeError(`Unknown ${where} key ${JSON.stringify(key)}`);
  const id=entry["id"];if(typeof id!=="string"||!/^[a-z][a-z0-9-]{0,31}$/.test(id))throw new TypeError(`Expected ${where}.id to match [a-z][a-z0-9-]{0,31}`);
  const label=text(entry["label"],`${where}.label`,64),list=entry["characters"];
  if(!Array.isArray(list)||list.length<1||list.length>MAX_IN_CATEGORY)throw new TypeError(`Expected ${where}.characters to hold 1 to ${MAX_IN_CATEGORY} entries`);
  let target=merged.get(id);if(!target){if(merged.size>=RICH_SPECIAL_CHARACTER_MAX_CATEGORIES)throw new RangeError("Too many special-character categories");target={label,characters:[],seen:new Set()};merged.set(id,target);}
  list.forEach((item,index)=>{
   const value=plainRecord(item,`${where}.characters[${index}]`);for(const key of Object.keys(value))if(!["character","name"].includes(key))throw new TypeError(`Unknown special-character key ${JSON.stringify(key)}`);
   const c=character(value["character"],`${where}.characters[${index}].character`),name=text(value["name"],`${where}.characters[${index}].name`,128);
   if(target.seen.has(c))throw new TypeError(`Duplicate special character ${JSON.stringify(c)} in category ${id}`);
   if(target.characters.length>=MAX_IN_CATEGORY)throw new RangeError(`Too many characters in category ${id}`);
   target.seen.add(c);target.characters.push(Object.freeze({character:c,name}));
  });
 };
 if(input["builtIn"]!==false)for(const category of richSpecialCharacterCategories)add(category,`built-in category ${category.id}`);
 const hosts=input["categories"];
 if(hosts!==undefined){if(!Array.isArray(hosts)||hosts.length>RICH_SPECIAL_CHARACTER_MAX_CATEGORIES)throw new TypeError("Expected categories to be an array of at most 32 categories");hosts.forEach((category,index)=>add(category as RichSpecialCharacterCategory,`categories[${index}]`));}
 const total=[...merged.values()].reduce((sum,entry)=>sum+entry.characters.length,0);
 if(total>RICH_SPECIAL_CHARACTER_MAX_CHARACTERS)throw new RangeError(`A special-character catalog holds at most ${RICH_SPECIAL_CHARACTER_MAX_CHARACTERS} characters`);
 if(merged.size===0)throw new TypeError("A special-character catalog needs at least one category");
 const order=input["order"];let ids=[...merged.keys()];
 if(order!==undefined){
  if(!Array.isArray(order)||order.length>RICH_SPECIAL_CHARACTER_MAX_CATEGORIES)throw new TypeError("Expected order to be an array of category ids");
  const listed=new Set<string>();for(const id of order){if(typeof id!=="string"||!merged.has(id)||listed.has(id))throw new TypeError(`Unknown or duplicate category id in order: ${JSON.stringify(id)}`);listed.add(id);}
  ids=[...listed,...ids.filter(id=>!listed.has(id))];
 }
 return Object.freeze({categories:Object.freeze(ids.map(id=>{const entry=merged.get(id)!;return Object.freeze({id,label:entry.label,characters:Object.freeze(entry.characters.slice())});}))});
}

/** "U+20AC" or "U+0041 U+030A" for a sequence. */
export function specialCharacterCode(value:string):string{return [...value].map(c=>`U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4,"0")}`).join(" ");}
export interface RichSpecialCharacterMatch {readonly category:string;readonly character:string;readonly name:string}
/**
 * Characters of `category` (or all categories) whose localized or English name, code point or character
 * matches every whitespace-separated query term (case-insensitive). Duplicates across categories appear once.
 */
export function filterSpecialCharacters(catalog:RichSpecialCharacterCatalog,query:string,category:string|null=null,ui?:RichUiLocale):readonly RichSpecialCharacterMatch[]{
 const terms=query.toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0,8),seen=new Set<string>(),result:RichSpecialCharacterMatch[]=[];
 for(const group of catalog.categories){
  if(category!==null&&group.id!==category)continue;
  for(const item of group.characters){
   if(seen.has(item.character))continue;
   const name=ui?.specialCharacterLabel?.("character",item.character,item.name)??item.name;
   const haystack=`${name} ${item.name} ${specialCharacterCode(item.character)} ${item.character}`.toLocaleLowerCase();
   if(terms.every(term=>haystack.includes(term))){seen.add(item.character);result.push(Object.freeze({category:group.id,character:item.character,name}));}
  }
 }
 return Object.freeze(result);
}

const COLUMNS=8;
export const richSpecialCharacterStyles=`:is([data-breditor-rich],[data-breditor-shared]) .breditor-special-characters{display:grid;gap:6px;min-width:260px}:is([data-breditor-rich],[data-breditor-shared]) .breditor-special-characters [role=grid]{display:grid;grid-template-columns:repeat(${COLUMNS},2.2em);gap:2px;max-height:14em;overflow:auto}:is([data-breditor-rich],[data-breditor-shared]) .breditor-special-characters [role=row]{display:contents}:is([data-breditor-rich],[data-breditor-shared]) .breditor-special-characters [role=gridcell]{font-size:1.1em;min-height:2em;padding:0}:is([data-breditor-rich],[data-breditor-shared]) .breditor-special-characters [role=gridcell]:focus{outline:2px solid #2d6a4f}`;

/**
 * Accessible picker body for a toolbar panel: a search field, a category choice, an ARIA grid with a
 * roving tab stop (arrows, Home/End, Ctrl+Home/End, PageUp/PageDown; Enter/Space inserts) and a live count.
 */
export function mountSpecialCharacterPicker(body:HTMLElement,port:RichControlPanelPort,catalog:RichSpecialCharacterCatalog):void{
 const d=body.ownerDocument,ui=port.ui,wrap=d.createElement("div");wrap.className="breditor-special-characters";
 const style=createRichStyleElement(d,richSpecialCharacterStyles);
 const search=d.createElement("input");search.type="search";search.maxLength=64;search.setAttribute("aria-label",ui.text("specialCharactersSearch"));search.placeholder=ui.text("specialCharactersSearch");search.dataset["specialCharacterSearch"]="";
 const select=d.createElement("select");select.setAttribute("aria-label",ui.text("specialCharactersCategory"));select.dataset["specialCharacterCategory"]="";
 const all=d.createElement("option");all.value="";all.textContent=ui.text("specialCharactersAll");select.append(all);
 for(const group of catalog.categories){const option=d.createElement("option");option.value=group.id;option.textContent=ui.specialCharacterLabel?.("category",group.id,group.label)??group.label;select.append(option);}
 const grid=d.createElement("div");grid.setAttribute("role","grid");grid.setAttribute("aria-label",ui.text("specialCharactersGrid"));grid.id=`breditor-special-${Math.random().toString(36).slice(2)}`;
 search.setAttribute("aria-controls",grid.id);
 const status=d.createElement("p");status.setAttribute("role","status");status.setAttribute("aria-live","polite");status.className="breditor-special-characters-status";
 wrap.append(style,search,select,grid,status);body.append(wrap);
 let cells:HTMLButtonElement[]=[],active=0;
 const focus=(index:number)=>{if(!cells.length)return;active=Math.max(0,Math.min(cells.length-1,index));cells.forEach((cell,i)=>cell.tabIndex=i===active?0:-1);cells[active]!.focus();};
 const draw=()=>{
  const matches=filterSpecialCharacters(catalog,search.value,select.value||null,ui);
  grid.replaceChildren();cells=[];active=0;
  for(let start=0;start<matches.length;start+=COLUMNS){
   const row=d.createElement("div");row.setAttribute("role","row");
   for(const match of matches.slice(start,start+COLUMNS)){
    const cell=d.createElement("button");cell.type="button";cell.setAttribute("role","gridcell");cell.tabIndex=cells.length===0?0:-1;
    cell.textContent=match.character;cell.title=match.name;cell.dataset["specialCharacter"]=match.character;
    cell.setAttribute("aria-label",ui.text("specialCharacterItem",{name:match.name,code:specialCharacterCode(match.character)}));
    const index=cells.length;cell.addEventListener("click",()=>{active=index;port.apply({value:match.character});},{signal:port.signal});
    row.append(cell);cells.push(cell);
   }
   grid.append(row);
  }
  grid.setAttribute("aria-rowcount",String(Math.ceil(matches.length/COLUMNS)));grid.setAttribute("aria-colcount",String(COLUMNS));
  status.textContent=matches.length===0?ui.text("specialCharactersEmpty"):matches.length===1?ui.text("specialCharactersCountOne"):ui.text("specialCharactersCount",{count:matches.length});
 };
 search.addEventListener("input",draw,{signal:port.signal});select.addEventListener("change",draw,{signal:port.signal});
 search.addEventListener("keydown",event=>{if(event.key==="ArrowDown"&&cells.length){event.preventDefault();focus(0);}else if(event.key==="Enter"&&cells.length){event.preventDefault();cells[0]!.click();}},{signal:port.signal});
 grid.addEventListener("keydown",event=>{
  const index=cells.indexOf(event.target as HTMLButtonElement);if(index<0)return;
  const row=Math.floor(index/COLUMNS),last=cells.length-1;let next:number|undefined;
  switch(event.key){
   case "ArrowRight":next=index+1;break;case "ArrowLeft":next=index-1;break;
   case "ArrowDown":next=index+COLUMNS<=last?index+COLUMNS:index;break;
   case "ArrowUp":if(index<COLUMNS){event.preventDefault();search.focus();return;}next=index-COLUMNS;break;
   case "Home":next=event.ctrlKey||event.metaKey?0:row*COLUMNS;break;
   case "End":next=event.ctrlKey||event.metaKey?last:Math.min(last,row*COLUMNS+COLUMNS-1);break;
   case "PageDown":next=Math.min(last,index+COLUMNS*4);break;case "PageUp":next=Math.max(0,index-COLUMNS*4);break;
   default:return;
  }
  event.preventDefault();focus(next);
 },{signal:port.signal});
 draw();
}
