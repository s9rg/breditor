/** Fixed OOXML package parts (ECMA-376 transitional WordprocessingML). Everything here is library-owned text. */
export const ns={
  w:"http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  r:"http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  wp:"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  a:"http://schemas.openxmlformats.org/drawingml/2006/main",
  pic:"http://schemas.openxmlformats.org/drawingml/2006/picture",
  rel:"http://schemas.openxmlformats.org/package/2006/relationships",
  ct:"http://schemas.openxmlformats.org/package/2006/content-types",
} as const;
export const relType={
  officeDocument:"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  core:"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
  app:"http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties",
  styles:"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
  numbering:"http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",
  settings:"http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings",
  image:"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
  hyperlink:"http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
} as const;
export const docxContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const xmlDeclaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
export function contentTypes(media:readonly {extension:string;contentType:string}[]):string {
  const defaults=[["rels","application/vnd.openxmlformats-package.relationships+xml"],["xml","application/xml"],...media.map(m=>[m.extension,m.contentType])];
  const overrides=[
    ["/word/document.xml","application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"],
    ["/word/styles.xml","application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"],
    ["/word/numbering.xml","application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"],
    ["/word/settings.xml","application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"],
    ["/docProps/core.xml","application/vnd.openxmlformats-package.core-properties+xml"],
    ["/docProps/app.xml","application/vnd.openxmlformats-officedocument.extended-properties+xml"],
  ];
  return `${xmlDeclaration}<Types xmlns="${ns.ct}">${defaults.map(([e,t])=>`<Default Extension="${e}" ContentType="${t}"/>`).join("")}${overrides.map(([p,t])=>`<Override PartName="${p}" ContentType="${t}"/>`).join("")}</Types>`;
}
export const packageRels=`${xmlDeclaration}<Relationships xmlns="${ns.rel}"><Relationship Id="rId1" Type="${relType.officeDocument}" Target="word/document.xml"/><Relationship Id="rId2" Type="${relType.core}" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${relType.app}" Target="docProps/app.xml"/></Relationships>`;
export const appXml=`${xmlDeclaration}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Breditor</Application></Properties>`;
/** No timestamps or authors: identical input must give identical bytes. */
export function coreXml(title:string|undefined,language:string|undefined):string {
  return `${xmlDeclaration}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${title!==undefined?`<dc:title>${title}</dc:title>`:""}${language!==undefined?`<dc:language>${language}</dc:language>`:""}</cp:coreProperties>`;
}
export const settingsXml=`${xmlDeclaration}<w:settings xmlns:w="${ns.w}"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
/** Paragraph/character styles referenced by document.xml. Built-in names map to Word's own styles. */
export function stylesXml(language:string|undefined):string {
  const heading=(n:number,size:number)=>`<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${n-1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  const mono='<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>';
  return `${xmlDeclaration}<w:styles xmlns:w="${ns.w}">`
    +`<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/>${language!==undefined?`<w:lang w:val="${language}"/>`:""}</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    +`<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
    +`<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>`
    +`<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>`
    +`<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>`
    +[[1,32],[2,28],[3,26],[4,24],[5,22],[6,22]].map(([n,s])=>heading(n!,s!)).join("")
    +`<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="A6A6A6"/></w:pBdr></w:pPr><w:rPr><w:color w:val="404040"/></w:rPr></w:style>`
    +`<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:spacing w:after="200" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="44546A"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>`
    +`<w:style w:type="paragraph" w:customStyle="1" w:styleId="BreditorCodeBlock"><w:name w:val="Breditor Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F3F3F3"/><w:spacing w:after="160" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr>${mono}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>`
    +`<w:style w:type="paragraph" w:customStyle="1" w:styleId="BreditorHorizontalRule"><w:name w:val="Breditor Horizontal Rule"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:style>`
    +`<w:style w:type="paragraph" w:customStyle="1" w:styleId="BreditorSectionSummary"><w:name w:val="Breditor Section Summary"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style>`
    +`<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>`
    +`</w:styles>`;
}
export type AbstractKind="bullet"|"decimal"|"lowerLetter"|"upperLetter"|"lowerRoman"|"upperRoman"|"taskOpen"|"taskDone";
const bullets=["•","◦","▪"];
/** One abstract definition per marker kind; all nine levels share the kind, indented by level. */
export function abstractNumXml(id:number,kind:AbstractKind):string {
  const levels=Array.from({length:9},(_,i)=>{
    const ind=`<w:pPr><w:ind w:left="${720*(i+1)}" w:hanging="360"/></w:pPr>`;
    if(kind==="bullet")return `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${bullets[i%3]}"/><w:lvlJc w:val="left"/>${ind}</w:lvl>`;
    if(kind==="taskOpen"||kind==="taskDone")return `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${kind==="taskOpen"?"☐":"☒"}"/><w:lvlJc w:val="left"/>${ind}<w:rPr><w:rFonts w:ascii="Segoe UI Symbol" w:hAnsi="Segoe UI Symbol" w:cs="Segoe UI Symbol" w:hint="default"/></w:rPr></w:lvl>`;
    return `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${kind}"/><w:lvlText w:val="%${i+1}."/><w:lvlJc w:val="left"/>${ind}</w:lvl>`;
  }).join("");
  return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
}
export interface NumInstance {readonly numId:number;readonly abstractId:number;readonly level:number;readonly start:number|null}
export function numberingXml(abstracts:readonly {id:number;kind:AbstractKind}[],nums:readonly NumInstance[]):string {
  return `${xmlDeclaration}<w:numbering xmlns:w="${ns.w}">${abstracts.map(a=>abstractNumXml(a.id,a.kind)).join("")}${nums.map(n=>`<w:num w:numId="${n.numId}"><w:abstractNumId w:val="${n.abstractId}"/>${n.start!==null?`<w:lvlOverride w:ilvl="${n.level}"><w:startOverride w:val="${n.start}"/></w:lvlOverride>`:""}</w:num>`).join("")}</w:numbering>`;
}
export const pageSizes={letter:{width:12240,height:15840},a4:{width:11906,height:16838}} as const;
export const pageMargin=1440;
export function documentXml(body:string,page:{width:number;height:number}):string {
  return `${xmlDeclaration}<w:document xmlns:w="${ns.w}" xmlns:r="${ns.r}" xmlns:wp="${ns.wp}" xmlns:a="${ns.a}" xmlns:pic="${ns.pic}"><w:body>${body}<w:sectPr><w:pgSz w:w="${page.width}" w:h="${page.height}"/><w:pgMar w:top="${pageMargin}" w:right="${pageMargin}" w:bottom="${pageMargin}" w:left="${pageMargin}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}
export function documentRels(rels:readonly {id:string;type:string;target:string;external:boolean}[]):string {
  return `${xmlDeclaration}<Relationships xmlns="${ns.rel}">${rels.map(r=>`<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"${r.external?' TargetMode="External"':""}/>`).join("")}</Relationships>`;
}
