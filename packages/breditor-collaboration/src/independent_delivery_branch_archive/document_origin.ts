/** Bind the archived reader to the same original accepted native seed. */
import {SharedRichEditor} from '../core.js';
import {clock} from '../relay/validation.js';
import type {SharedSelectionPolicy} from '../types.js';

const {writerClockV2, descriptor} = SharedRichEditor.prototype;

export function sameBranchDocumentOrigin(
  source: SharedRichEditor<SharedSelectionPolicy>,
  target: SharedRichEditor<SharedSelectionPolicy>,
): boolean {
  const a = clock(writerClockV2.call(source, '1'), '1');
  const b = clock(writerClockV2.call(target, '1'), '1');
  return a.through !== '0' && a.through === b.through && a.prefixDigest === b.prefixDigest &&
    descriptor.call(source).schemaFingerprint === descriptor.call(target).schemaFingerprint;
}
