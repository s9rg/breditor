/**
 * Email HTML vocabulary shared by the inline-style exporter and the importer.
 *
 * Every presentation the email exporter adds without a native meaning is a fixed, library-owned
 * declaration prefix chosen from this closed table. The importer removes exactly these prefixes
 * (and the fixed table attributes) inside a recognized email content root before ordinary
 * conversion, so the remaining semantic declarations re-import as they would from `exportHtml`.
 */
import {bytes,fail} from "./budget.js";
import {escapeText} from "./safe_url.js";
import type {HtmlPageMetadata} from "./html_page.js";
import type {ImportedAsset} from "./types.js";

/** Marker attribute and its closed values. */
export const emailMarker="data-breditor-email";
export const emailMarkerValues=Object.freeze({content:"content",wrapper:"wrapper",preheader:"preheader"} as const);
export const emailLimits=Object.freeze({preheaderBytes:512,minWidth:320,maxWidth:1200});

const font="font-family:Arial,Helvetica,sans-serif";
const monospace="font-family:Consolas,'Courier New',monospace";
const muted="color:#57606a",rule="#d0d7de",panel="background-color:#f6f8fa";
const headingSizes=[32,26,22,18,16,14] as const;
const cell=`border:1px solid ${rule};padding:6px 8px;vertical-align:top;text-align:left`;

/**
 * Per-tag decoration prefixes. Index 0 is the default; `p` index 1 is the compact paragraph used
 * inside list items, table cells and captions; `ul` index 1 is the task list without markers.
 */
export const emailDecoration:Readonly<Record<string,readonly string[]>>=Object.freeze({
  div:[`${font};font-size:16px;line-height:1.5;color:#1f2328`],
  p:["margin:0 0 16px","margin:0"],
  ...Object.fromEntries(headingSizes.map((size,i)=>[`h${i+1}`,[`margin:0 0 12px;font-size:${size}px;line-height:1.25;font-weight:bold`]])),
  blockquote:[`margin:0 0 16px;padding:0 0 0 12px;border-left:4px solid ${rule};${muted}`],
  details:["margin:0 0 16px"],
  summary:["font-weight:bold"],
  pre:[`margin:0 0 16px;padding:12px;${panel};${monospace};font-size:14px;line-height:1.45`],
  code:[`padding:1px 4px;${panel};${monospace};font-size:90%`],
  hr:[`border:0;border-top:1px solid ${rule};margin:16px 0;height:0`],
  ul:["margin:0 0 16px;padding:0 0 0 28px","margin:0 0 16px;padding:0 0 0 4px;list-style-type:none"],
  ol:["margin:0 0 16px;padding:0 0 0 28px"],
  li:["margin:0 0 4px"],
  input:["margin:0 6px 0 0"],
  figure:["margin:0 0 16px"],
  img:["display:block;max-width:100%;height:auto;border:0"],
  figcaption:[`margin:8px 0 0;font-size:14px;${muted}`],
  table:["border-collapse:collapse;margin:0 0 16px"],
  caption:[`padding:6px 0;font-size:14px;${muted}`],
  td:[cell],
  th:[`${cell};font-weight:bold;${panel}`],
  a:["color:#0969da;text-decoration:underline"],
});
/** Fixed legacy data-table attributes for clients that ignore CSS borders. */
export const emailTableAttributes=Object.freeze([["border","1"],["cellpadding","6"],["cellspacing","0"]] as const);
export const emailPreheaderStyle="display:none;max-height:0;overflow:hidden;mso-hide:all";
export const emailViewport='<meta name="viewport" content="width=device-width, initial-scale=1">';

/** The `style` value for one decorated element: decoration first, then semantic declarations. */
export function emailStyle(tag:string,semantic:readonly string[]=[],variant=0):string {
  const decoration=emailDecoration[tag]?.[variant];if(decoration===undefined)fail("native-admission");
  return [decoration,...semantic].join(";");
}

/** Optional centered fixed-width email layout around the content root. */
export interface EmailHtmlPreset {
  /** Content column width in CSS pixels, 320–1200. Default 600. */
  readonly width?:number;
  /** Page background as `#rrggbb`. Default `#f4f4f5`. */
  readonly background?:string;
  /** Content column background as `#rrggbb`. Default `#ffffff`. */
  readonly contentBackground?:string;
  /** Hidden inbox preview text, at most 512 bytes of UTF-8. */
  readonly preheader?:string;
}
/** `exportEmailHtml` options. `preset` requires `page`; both are validated before native reads. */
export interface EmailHtmlOptions {
  /** Same explicit image publication policy as `exportHtml`. */
  readonly exportImage?:(asset:ImportedAsset)=>string|undefined;
  /** Complete page metadata. Without it the result is the content root fragment. */
  readonly page?:HtmlPageMetadata;
  /** Centered fixed-width layout, preheader and backgrounds around the content root. */
  readonly preset?:EmailHtmlPreset;
}
/** A validated preset with defaults applied; `importHtmlPage` returns this for an exact preset page. */
export interface ResolvedEmailPreset {
  readonly width:number;readonly background:string;readonly contentBackground:string;readonly preheader?:string;
}
const presetFields=new Set(["width","background","contentBackground","preheader"]);
const hexColor=/^#[0-9a-f]{6}$/;
export function emailColor(value:unknown):string|undefined {
  if(typeof value!=="string")return undefined;const lower=value.toLowerCase();return hexColor.test(lower)?lower:undefined;
}
export function emailWidth(value:unknown):number|undefined {
  return typeof value==="number"&&Number.isInteger(value)&&value>=emailLimits.minWidth&&value<=emailLimits.maxWidth?value:undefined;
}
export function emailPreheader(value:unknown):string {
  if(typeof value!=="string"||value.includes("\u0000"))fail("unsupported-content");
  if(value.length>emailLimits.preheaderBytes||bytes(value)>emailLimits.preheaderBytes)fail("resource-limit");
  return value;
}
export function resolveEmailPreset(preset:EmailHtmlPreset):ResolvedEmailPreset {
  if(!preset||typeof preset!=="object"||Array.isArray(preset)||Object.keys(preset).some(name=>!presetFields.has(name)))fail("unsupported-content");
  const width=preset.width===undefined?600:emailWidth(preset.width),background=preset.background===undefined?"#f4f4f5":emailColor(preset.background);
  const contentBackground=preset.contentBackground===undefined?"#ffffff":emailColor(preset.contentBackground);
  if(width===undefined||background===undefined||contentBackground===undefined)fail("unsupported-content");
  const preheader=preset.preheader===undefined?undefined:emailPreheader(preset.preheader);
  return Object.freeze({width,background,contentBackground,...(preheader===undefined?{}:{preheader})});
}
/** Content root around the converted body. */
export function emailContent(body:string):string {
  return `<div ${emailMarker}="${emailMarkerValues.content}" style="${emailStyle("div")}">${body}</div>`;
}
export function emailBodyStyle(preset:ResolvedEmailPreset):string {return `margin:0;padding:0;background-color:${preset.background}`;}
/** Preheader and the two presentation tables around the content root. `align` follows the page direction. */
export function emailLayout(preset:ResolvedEmailPreset,content:string,align:"left"|"right"):string {
  const {width,background,contentBackground,preheader}=preset;
  const hidden=preheader===undefined?"":`<div ${emailMarker}="${emailMarkerValues.preheader}" style="${emailPreheaderStyle}">${escapeText(preheader)}</div>`;
  return hidden+`<table ${emailMarker}="${emailMarkerValues.wrapper}" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${background}" style="background-color:${background}">`+
    `<tr><td align="center" style="padding:24px 12px">`+
    `<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" bgcolor="${contentBackground}" style="width:${width}px;max-width:100%;background-color:${contentBackground}">`+
    `<tr><td style="padding:24px;text-align:${align}">${content}</td></tr></table></td></tr></table>`;
}
