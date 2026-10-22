/** Complete genuine native delivery owner seeded with an actual retained raster reference. */
import {deliverySession} from '../independent-delivery/session.mjs';
import {pixelAsset} from '../review-assets/pixels.mjs';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function deliveryParticipantSession(api,profile,rootFixture,{opaque=false,...input}={}){
 const selected=deliverySession(api,profile,input),descriptor=JSON.parse(profile.descriptor_json()),root=structuredClone(rootFixture),cell=root.children[0].children[0].children[0],paragraph=cell.children[0],image=cell.children[1];root.children=[paragraph,image];image.properties['breditor/asset-id']=opaque?'opaque-image':pixelAsset;
 const document=JSON.stringify({format:'breditor/document',formatVersion:2,schema:descriptor.schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(root)});selected.options.create=()=>profile.create(document,'101');return{...selected,document};
}
