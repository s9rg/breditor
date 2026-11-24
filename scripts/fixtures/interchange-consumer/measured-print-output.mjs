import {createLocalProfileV4, initializeLocalRuntime} from "@breditor/editor";
import {renderStaticDocument} from "@breditor/editor/static";
import {mountRichPrintPreview} from "@breditor/experimental-rich-content";

const element = (type, id, properties, children=[]) => ({kind:"element",type:`breditor/${type}`,entityId:null,
  properties:{"breditor/block-id":id,...properties},children});
const paragraph = (id,value) => element("paragraph",id,{},[{kind:"text",text:value,formats:[]}]);
const row = (id,label,header=false) => element("table-row",`row-${id}`,{"breditor/row-id":id},[
  element("table-cell",`cell-${id}`,{"breditor/column-id":"only","breditor/header":header},[paragraph(`cell-text-${id}`,label)]),
]);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value==="object" ?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;

globalThis.createMeasuredPrintFixture = async ({asset,raster,runningHeader}) => {
  const bytes = await (await fetch("/fixture.wasm")).arrayBuffer();
  await initializeLocalRuntime(bytes);
  const profile = await createLocalProfileV4();
  const {schema,schemaFingerprint} = profile.descriptor();
  const root = canonical({
    kind:"element",type:"breditor/document",entityId:null,properties:{"breditor/document-id":"print-qualification"},children:[
      paragraph("intro","BeforeForcedBreak"),
      element("image","raster",{"breditor/image-id":"figure","breditor/asset-id":asset,"breditor/asset-generation":"g1",
        "breditor/decorative":false,"breditor/alt-text":"Raster fixture","breditor/width":120,"breditor/height":56}),
      element("page-break","split",{}),
      paragraph("next","AfterForcedBreak"),
      element("table","table",{"breditor/table-id":"table-id","breditor/columns":[{id:"only",width:240}],
        "breditor/merges":[],"breditor/retracted-merges":[]},[
        row("head","RepeatFixtureHeader",true),
        ...Array.from({length:16},(_,index)=>row(`item-${index}`,`FixtureRow${String(index+1).padStart(2,"0")}`)),
      ]),
    ],
  });
  const seed = JSON.stringify({format:"breditor/document",formatVersion:2,schema,schemaFingerprint,root});
  let owner = profile.createEditor(seed);
  const states = {initial:owner.documentJson()};
  const initial = owner.checkpointJson();
  const point = {block:"intro",offset:String("BeforeForcedBreak".length),affinity:"after"};
  owner.execute({kind:"setSelection",selection:{kind:"text",anchor:point,focus:point}});
  owner.execute({kind:"insertPlainText",text:" reader".repeat(940)});
  states.edited = owner.documentJson();
  owner.execute({kind:"undo"});
  states.undone = owner.documentJson();
  owner.execute({kind:"resizeImage",data:{image:"figure",size:{width:280,height:360}}});
  states.resized = owner.documentJson();
  owner.execute({kind:"undo"});
  const saved = owner.checkpointJson();
  const savedHistory = owner.view().redoDepth;
  owner.dispose();
  owner = profile.restoreEditor(saved);
  states.reopened = owner.documentJson();

  let preview;
  const show = async name => {
    preview?.dispose();
    const frame = document.querySelector("main");
    frame.innerHTML = renderStaticDocument(states[name],{print:{runningHeader,pageNumbers:true},resolveAsset:binding=>binding.asset===asset?raster:undefined});
    const surface = frame.firstElementChild;
    surface.classList.add("breditor-rich-surface");
    const image = surface.querySelector("img");
    await image.decode();
    await document.fonts.ready;
    preview = mountRichPrintPreview(surface,{print:false});
    const measured = preview.measure();
    const measurementPreserved = owner.checkpointJson()===saved;
    return {measured, rasterHeight:image.getBoundingClientRect().height, measurementPreserved};
  };
  return {show, undone:states.undone===states.initial, reopened:states.reopened===states.initial,
    journalExact:owner.checkpointJson()===saved,redoPreserved:savedHistory>0&&owner.view().redoDepth===savedHistory,
    edited:states.edited!==states.initial,resized:states.resized!==states.initial,hadHistory:initial!==saved};
};
