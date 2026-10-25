/** Actual native owners only. SDK/native modules are explicit so the same laws
 * can run against source output, an offline-installed package and its bundle. */
import assert from 'node:assert/strict';
export async function writerPrefixLaws({sdk,native,prefixAt,captured,sourceNativeRecoveryRead,documentRoot,oldPrefixAt,legacy=false}){
 const A='9007199254740993',B='9007199254740995',S='101',unknown='333';
 const content=documentRoot;
 let cases=0,queries=0,coldRestores=0,oldWrongAuthorReproductions=0,futureHistorySteps=0;
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const command=(block,text)=>({kind:'insert_text',data:{block,offset:0,text}});
 const head=(core,id,v)=>v===1?core.writerClock(id):core.writerClockV2(id);
 for(const language of [1,2,3])for(const standard of [false,true])for(const segmented of [false,true]){
  const schema={name:'example/author-prefix',version:1},config=JSON.stringify({format:'breditor/shared-rich-profile',formatVersion:language,schema,extensions:[]});
  const factory=language===1?(standard?'from_standard_configuration_json_v1':'from_configuration_json'):(standard?'from_standard_configuration_json_v':'from_configuration_json_v')+language;
  const profile=native.SharedRichProfile[factory](config),owners=[];let released,seed;
  const own=raw=>{const core=new sdk.SharedRichEditor(raw,segmented&&raw.segmented_history_enabled()?{segmentedHistory:'segmented-v1'}:{});owners.push(core);return core;};
  try{
   const descriptor=JSON.parse(profile.descriptor_json()),document=JSON.stringify({format:'breditor/document',formatVersion:2,schema,schemaFingerprint:descriptor.schemaFingerprint,root:canonical(content)});
   seed=profile.create(document,S);const seedFrame=seed.update_frame(),seedHeads=[JSON.parse(seed.writer_clock(S)),JSON.parse(seed.writer_clock_v2(S))];assert.ok(BigInt(seedHeads[0].through)>0n,'The server-author seed must actually contain applied operations');
   const a=own(profile.join_frame('room',A,seedFrame)),b=own(profile.join_frame('room',B,seedFrame));
   if(segmented){a.enableSegmentedHistory('a-root','a-one');b.enableSegmentedHistory('b-root','b-one');}
   assert.equal(b.supportsWriterPrefixRead(),!legacy);
   const empty=[head(a,A,1),head(a,A,2)];
   // Identical action size creates the old numeric-counter collision for two
   // distinct authors. The actual old implementation must return the wrong digest.
   for(const c of [a,b])c.dispatch({commands:[command('p','Same length 日本 🙂 ')]});
   const accepted=[head(a,A,1),head(a,A,2)],ownAccepted=[head(b,B,1),head(b,B,2)];
   assert.equal(accepted[0].through,ownAccepted[0].through);assert.notEqual(accepted[0].prefixDigest,ownAccepted[0].prefixDigest);
   if(segmented){a.sealHistoryGeneration('a-two');b.sealHistoryGeneration('b-two');}
   a.dispatch({commands:[command('caption','Later A ')]});
   b.dispatch({commands:[command('caption','Later B ')]});
   await b.receiveFrame(a.updateFrame());
   const observed=seed.observe();try{seed.dispatch(observed,JSON.stringify({commands:[command('p','Server later ')]}));}finally{observed.free();}await b.receiveFrame(seed.update_frame());assert.ok(BigInt(head(b,S,1).through)>BigInt(seedHeads[0].through),'The selected server prefix is historical, not its current head');
   if(segmented)b.sealHistoryGeneration('b-three');
   b.setReadOnly(true);const before=b.checkpointJson(),view=structuredClone(b.view());let publications=0;const unsubscribe=b.subscribe(()=>publications++);
   const borrow={};if(captured)captured.registerCapturedNativeHistory(borrow,b,{document:{kind:segmented?'segmented-v1':'original',checkpoint:before},review:null},()=>{});
   const readers=[b,...(captured?[captured.capturedNativeHistoryRead(borrow).document]:[]),...(sourceNativeRecoveryRead?[sourceNativeRecoveryRead(b)]:[])];
   for(const version of [1,2]){
    const expected=accepted[version-1],own=ownAccepted[version-1];
    if(oldPrefixAt){const mistaken=oldPrefixAt(b,A,expected.through,version);assert.equal(mistaken,own.prefixDigest);assert.notEqual(mistaken,expected.prefixDigest);oldWrongAuthorReproductions++;}
    for(const reader of readers){
     if(legacy){assert.throws(()=>reader.writerClockAt(A,expected.through,version),error=>error.code==='writer_prefix_unavailable');if(prefixAt){assert.throws(()=>prefixAt(reader,A,expected.through,version),error=>error.code==='writer_prefix_unavailable');assert.equal(prefixAt(reader,B,own.through,version),own.prefixDigest);}}
     else{
      for(const value of [empty[version-1],expected,seedHeads[version-1],head(b,A,version)]){assert.deepEqual(reader.writerClockAt(value.writer,value.through,version),value);queries++;if(prefixAt){assert.equal(prefixAt(reader,value.writer,value.through,version),value.prefixDigest);queries++;}}
      assert.deepEqual(reader.writerClockAt(unknown,'0',version),head(b,unknown,version));queries++;
      for(const id of ['', '0','01','-1','18446744073709551615','18446744073709551616','１２'])assert.throws(()=>reader.writerClockAt(id,'0',version));
      for(const counter of ['', '00','01','-1','2147483648','1 ','１'])assert.throws(()=>reader.writerClockAt(A,counter,version));
      assert.throws(()=>reader.writerClockAt(unknown,'1',version));
      assert.throws(()=>reader.writerClockAt(A,(BigInt(head(b,A,version).through)+1n).toString(),version));
      assert.throws(()=>reader.writerClockAt(A,expected.through,3),error=>error.code==='writer_transport_invalid');
     }
    }
   }
   assert.equal(b.checkpointJson(),before);assert.deepEqual(b.view(),view);assert.equal(publications,0);unsubscribe();
   if(captured){released=captured.capturedNativeHistoryRead(borrow);captured.releaseCapturedNativeHistory(borrow);assert.throws(()=>released.document.writerClockAt(A,'0',1),error=>error.code==='captured_history_source');released=undefined;}
   const cold=own(segmented?profile.restore_segmented('room',before):profile.restore('room',before));coldRestores++;
   assert.equal(cold.checkpointJson(),before);
   if(!legacy)for(const version of [1,2])assert.deepEqual(cold.writerClockAt(A,accepted[version-1].through,version),accepted[version-1]);
   cold.setReadOnly(false);const text=cold.documentJson();assert.equal(cold.undo(),true);assert.ok(cold.documentJson().includes('Same length 日本'));assert.equal(cold.redo(),true);assert.equal(cold.documentJson(),text);futureHistorySteps+=2;
   const disposed=own(profile.join_frame('room','987',seedFrame));disposed.dispose();assert.throws(()=>disposed.writerClockAt(A,'0',1));cases++;
  }finally{for(const core of owners.reverse())core.dispose();seed?.free();profile.free();}
 }
 assert.equal(cases,12);assert.equal(coldRestores,12);assert.equal(futureHistorySteps,24);if(oldPrefixAt)assert.equal(oldWrongAuthorReproductions,24);
 return{passed:true,legacy,cases,queries,coldRestores,futureHistorySteps,oldWrongAuthorReproductions,scope:'All six native compiler profiles, original/segmented histories, both digest families; actual local/peer/genesis clocks, unchanged checkpoints/read-only views/publications, genuine capture lifecycle where selected, exact cold restore and future selective Undo/Redo. No network activation or V1 approval.'};
}
