/** Exact public source selection; internal borrowed reads never create source custody. */
export function captureHistorySession(api,session,selected){
 if(selected.independent)return api.captureSharedIndependentSource({session});
 if(selected.segmentedDocument)return api.captureSharedGenerationSource({kind:selected.family==='relay'?'relay':selected.family==='retained'?'retained':'local',session});
 return api.captureSharedAssetReferences({core:session.core,...(selected.paired?{session}:{})});
}
export function borrowedHistoryOperations(reader,check){
 const doc=reader.document,rows=[()=>reader.check(),()=>check(reader),()=>doc.descriptor(),()=>doc.checkpointJson(),()=>doc.writerClock('101'),()=>doc.writerClockV2('101'),()=>doc.writerGroups('0'),()=>doc.writerGroupsV2('0')];
 if(reader.review.kind==='original'||reader.review.kind==='segmented-v1'){const review=reader.review;rows.push(()=>review.checkpointJson(),()=>review.localReviewClock(),()=>review.reviewWriterClock('comments','alice'));}return rows;
}
