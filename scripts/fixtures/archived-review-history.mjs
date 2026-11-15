/** Build an original thread with independent replies, reanchoring, and native history events. */
import assert from 'node:assert/strict';

export function authorArchivedReviewHistory(core) {
  const action = (kind, data) => {
    const result = core.dispatchReview({kind, data});
    assert.equal(result.kind, 'committed');
    return result.event;
  };
  const anchorJson = core.captureReviewAnchor({kind: 'document'});
  const thread = action('create_thread', {anchorJson, body: 'Originally authored offline'});
  action('create_thread', {anchorJson, body: 'Unrelated discussion'});
  let reply;
  for (let index = 0; index < 16; index++) {
    reply = action('reply', {thread, body: 'Offline reply ' + index});
  }
  const edited = action('edit_message', {message: reply, body: 'Edited archived reply'});
  action('retract_message', {message: reply});
  action('set_thread_state', {thread, resolved: true});
  action('reanchor_thread', {thread, anchorJson: core.captureReviewAnchor({
    kind: 'selection', selection: {kind: 'text',
      anchor: {block: 'p', offset: '0', affinity: 'after'},
      focus: {block: 'p', offset: '1', affinity: 'after'}},
  })});
  assert.equal(core.undoReview().kind, 'committed');
  assert.equal(core.redoReview().kind, 'committed');
  return {thread, reply, edited};
}
