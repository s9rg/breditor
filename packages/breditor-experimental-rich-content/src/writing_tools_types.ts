/** Detached native read metadata, never a writer, selection or mutation credential. */
export interface RichWritingCounts {
 readonly words:string;readonly graphemes:string;readonly unicodeScalars:string;
 readonly utf16Units:string;readonly utf8Bytes:string;readonly textBlocks:string;
}
export interface RichWritingHeading {readonly block:string;readonly level:number;readonly label:string;readonly labelTruncated:boolean}
export interface RichWritingToolsRead {
 readonly format:"breditor/rich-writing-tools";readonly formatVersion:1;
 readonly schema:Readonly<{name:string;version:number;fingerprint:string}>;
 readonly document:string;readonly revision:string;readonly counts:RichWritingCounts;
 readonly outline:readonly RichWritingHeading[];
}
