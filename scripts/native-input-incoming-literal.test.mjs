/** Fault injection for the private literal comparison used by incoming capture. */
import assert from 'node:assert/strict';
import test from 'node:test';

const original = Object.getOwnPropertyDescriptor(Blob.prototype, 'arrayBuffer');
let read;
let verify;
try {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    ...original,
    value() { return read(this); },
  });
  ({verifyNativeInputIncomingLiteral: verify} = await import(
    '../packages/breditor-collaboration/dist/native_input_operation/incoming_literal.js?test-short-reads'
  ));
} finally {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', original);
}

const chunkBytes = 64 * 1024;
const refused = {code: 'native_input_incoming_source'};
const actual = new Blob(['abcA']);
const expected = new Blob(['abcB']);
const fullRead = blob => original.value.call(blob);

test('a pair of empty host reads cannot prove two unequal files match', async () => {
  let calls = 0;
  read = async () => {
    calls++;
    return new ArrayBuffer(0);
  };
  await assert.rejects(verify(actual, expected, () => {}), refused);
  assert.equal(calls, 1);
});

test('identical short prefixes cannot prove two unequal files match', async () => {
  read = blob => fullRead(blob.slice(0, 3));
  await assert.rejects(verify(actual, expected, () => {}), refused);
});

test('a missing byte in the last chunk cannot pass after an equal full chunk', async () => {
  const prefix = new Uint8Array(chunkBytes);
  let calls = 0;
  read = blob => {
    calls++;
    return blob.size === chunkBytes ? fullRead(blob) : fullRead(blob.slice(0, 3));
  };
  await assert.rejects(
    verify(new Blob([prefix, actual]), new Blob([prefix, expected]), () => {}),
    refused,
  );
  assert.equal(calls, 3);
});

test('a host read longer than its requested range is refused', async () => {
  read = async blob => new ArrayBuffer(blob.size + 1);
  await assert.rejects(verify(actual, expected, () => {}), refused);
});

test('authority can invalidate both buffers after the second read', async () => {
  const buffers = [];
  let invalidated = false;
  read = async blob => {
    const buffer = (await fullRead(blob)).slice(0);
    buffers.push(buffer);
    return buffer;
  };
  await assert.rejects(verify(actual, expected, () => {
    if (buffers.length === 2 && !invalidated) {
      invalidated = true;
      structuredClone(buffers, {transfer: buffers});
    }
  }), refused);
  assert.equal(buffers.length, 2);
  assert.equal(invalidated, true);
});

test('complete reads compare all bytes, including a partial final chunk', async () => {
  read = fullRead;
  const prefix = new Uint8Array(chunkBytes);
  await verify(new Blob([prefix, actual]), new Blob([prefix, actual]), () => {});
  await assert.rejects(
    verify(new Blob([prefix, actual]), new Blob([prefix, expected]), () => {}),
    refused,
  );
});
