/** Stable cache union, not a causal order or a fabricated server catalog. Both original lists remain retained. */
import{sourceCoreMethods as native}from'../source_native_read.js';
import type{SharedRichEditor}from'../core.js';
import type{SharedSelectionPolicy}from'../types.js';
import{unionFailure as fail}from'./policy.js';
export function unionLocalVersions(core:SharedRichEditor<SharedSelectionPolicy>,a:readonly string[],b:readonly string[]):readonly string[]{
 const packets=new Map<string,string>();
 for(const packet of[...a,...b]){const info=native.readVersion.call(core,packet),known=packets.get(info.id);if(known!==undefined&&known!==packet)throw fail('independent_delivery_union_version_conflict');if(known===undefined)packets.set(info.id,packet);}
 if(packets.size>32)throw fail('independent_delivery_union_version_budget');return[...packets.values()];
}
