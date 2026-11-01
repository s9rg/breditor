/** Compare complete visible comment content and both native policy selections
 * after real future document/comment Undo and Redo on every owned client. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=value=>createHash('sha256').update(value).digest('hex');
const policies=core=>({document:core.segmentedHistoryPolicy()??'original',review:core.reviewHistoryPolicy()});
export function checkFutureNativeHistories(clients){
 assert.equal(clients.length,7);const rows=[];
 for(const {id,core} of clients){
  const document=core.documentJson(),review=core.reviewSnapshot().view,selected=policies(core);
  assert.equal(core.undo(),true,id);assert.equal(core.redo(),true,id);
  assert.equal(core.documentJson(),document,id);
  assert.equal(core.undoReview().kind,'committed',id);assert.equal(core.redoReview().kind,'committed',id);
  assert.deepEqual(core.reviewSnapshot().view,review,id+' exact comment projection and history depths');
  assert.deepEqual(policies(core),selected,id+' independently selected Native policies');
  rows.push({id,...selected,documentSha256:sha(document),reviewViewSha256:sha(JSON.stringify(review)),exactFutureDocumentRestored:true,exactFutureCommentViewRestored:true});
 }
 console.log('INDEPENDENT_FUTURE_NATIVE_HISTORIES '+JSON.stringify({participants:rows.length,rows}));
}
