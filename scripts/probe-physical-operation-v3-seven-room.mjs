/** Actual same-room seven-writer matrix. Both wire modes, all normal profile
 * configurations and all four independent document/review history pairs are
 * required. No environment variable may silently reduce this workload. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {sevenNativeFixtures} from './fixtures/physical-operation-v3/seven-native.mjs';
import {sevenRoomProbe} from './fixtures/physical-operation-v3/seven-room-probe.mjs';

const fixtures = await sevenNativeFixtures();
assert.equal(fixtures.manifest.cases.length, 10);
const configurations = fixtures.manifest.cases.map(item => ({item, data: fixtures.fixture(item)}));
assert.deepEqual(configurations.map(({data}) => [data.language, data.standard, data.atomic]),
  [1, 2, 3].flatMap(language => (language === 1 ? [false] : [false, true]).flatMap(standard => [false, true].map(atomic => [language, standard, atomic]))));
let index = 0;
for (const {item, data} of configurations) {
  for (const documentSegmented of [false, true]) {
    for (const reviewSegmented of [false, true]) {
      const tag = 'actual-seven-' + index++;
      test(tag + ' profile=' + data.language + ' atomic=' + data.atomic + ' doc=' + documentSegmented + ' review=' + reviewSegmented, async () => {
        assert.deepEqual(await sevenRoomProbe({fixtures, item, documentSegmented, reviewSegmented, tag}), {
          participants: 7, coldParticipants: 7, historyPairs: 7, uploadStores: 7, postJobContinuations: 7,
        });
      });
    }
  }
}
assert.equal(index, 40);
