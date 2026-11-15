/** Use existing image upload and suggestion decisions for exact rich content from an archive. */
import assert from 'node:assert/strict';
import {recoveredText, publishRecoveredSuggestion} from './relay-segment-recovered-text.mjs';
import {recoveredAsset,recoveredPixel} from './review-assets/pixels.mjs';

const element=(name,id,properties,children)=>({kind:'element',type:'breditor/'+name,entityId:null,
  properties:{'breditor/block-id':id,...properties},children});
const paragraph=(id,text,formats=[])=>element('paragraph',id,{},[{kind:'text',text,formats}]);
const strong={type:'breditor/strong',properties:{}};
const originalGeneration='recovered-raster-original';
const caption='Archive-only image 🙂';
const point=(block,offset=0)=>({block,offset:String(offset),affinity:'after'});

export function authorRecoveredRich(core) {
  const image=element('image','recovered-raster-block',{
    'breditor/image-id':'recovered-raster-image',
    'breditor/asset-id':recoveredAsset,'breditor/asset-generation':originalGeneration,
    'breditor/decorative':false,'breditor/alt-text':'Recovered chart',
  },[paragraph('recovered-raster-caption',caption)]);
  core.dispatch({commands:[{kind:'insert_blocks',data:{parent:null,before:null,nodes:[
    paragraph('recovered-rich-head',recoveredText,[strong]),image,
    paragraph('recovered-rich-tail','Unselected trailing text'),
  ]}}]});
}

export function assertRecoveredRich(document,generation) {
  const {children}=JSON.parse(document).root;
  const styled=children.flatMap(node=>node.children??[]).find(node=>node.kind==='text'&&node.text===recoveredText);
  assert.ok(styled?.formats.some(format=>format.type==='breditor/strong'));
  const images=children.filter(node=>node.type==='breditor/image'&&node.properties['breditor/asset-id']===recoveredAsset);
  assert.equal(images.length,1);
  assert.equal(images[0].properties['breditor/asset-generation'],generation);
  assert.equal(images[0].children[0].children[0].text,caption);
  assert.doesNotMatch(document,/Unselected trailing text/);
}

export async function reviewRecoveredRich({api,session,queue,transport,source,policy,assetUrl,headers}) {
  const before=session.core.documentJson();
  const absent=await fetch(assetUrl,{headers});
  assert.equal(absent.status,404);
  await absent.arrayBuffer();
  const prepared=await api.prepareSharedRecoveredBranchRichSuggestion({
    ...policy,source,
    sourceSelection:{kind:'text',anchor:point('recovered-rich-head'),focus:point('recovered-rich-tail')},
    target:session,targetRange:{kind:'text',anchor:point('p'),focus:point('p')},targetRevision:session.core.view().revision,
    namespace:'retained-offline-rich',title:'Recover selected rich content',createdAtMs:'80',
  });
  assert.deepEqual(prepared.source.selection,source.selection);
  assert.equal(prepared.assets.length,1);
  const [asset]=prepared.assets;
  assert.deepEqual(asset.source,{asset:recoveredAsset,generation:originalGeneration});
  assert.equal(asset.target.asset,recoveredAsset);
  assert.notEqual(asset.target.generation,originalGeneration);
  assert.equal(asset.contentAsset,recoveredAsset);
  assert.deepEqual(Buffer.from(await asset.blob.arrayBuffer()),recoveredPixel);
  assert.equal(session.core.documentJson(),before);
  const staged=await fetch(assetUrl,{method:'PUT',headers:{...headers,'Content-Type':asset.blob.type},body:asset.blob});
  assert.equal(staged.status,200);
  assert.equal((await staged.json()).asset,recoveredAsset);
  await publishRecoveredSuggestion({api,session,queue,transport,prepared,
    verify:document=>assertRecoveredRich(document,asset.target.generation)});
  return asset.target.generation;
}
