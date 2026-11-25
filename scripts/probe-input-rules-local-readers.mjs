/** Recover current native checkpoints with both exact historical local readers. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {compileStandardLayoutRichProfileV3, RichCommandError} from "../packages/breditor-experimental-rich-content/index.js";
import {loadHistoricalLocalInputRuleRuntimes} from "./input-rule-historical-references.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const history = ["undo", "redo", "undo", "redo"];

function expectCheckpointRefusal(open) {
  let owner;
  try {
    assert.throws(() => { owner = open(); },
      error => error instanceof RichCommandError && error.code === "breditor_rich.checkpoint_rejected");
  } finally {
    owner?.dispose();
  }
}

function checkReader({module, sha256, reference}, fixture) {
  const foreign = JSON.parse(fixture.bootstrap);
  foreign.schema.version++;
  const profile = compileStandardLayoutRichProfileV3(module, fixture.bootstrap);
  const programmaticRules = reference.generation === "programmatic";
  let exactRestores = 0, exactHistorySteps = 0, profileRefusals = 0, historyPolicyRefusals = 0;
  try {
    const foreignProfile = compileStandardLayoutRichProfileV3(module, JSON.stringify(foreign));
    try {
      for (const trial of fixture.trials) {
        const restore = trial.natural ? "restoreTypingEditor" : "restoreEditor";
        const wrongHistory = trial.natural ? "restoreEditor" : "restoreTypingEditor";
        const owner = profile[restore](trial.checkpoint);
        try {
          assert.equal(owner.supportsMarkdownInputRules(), programmaticRules);
          assert.equal(owner.supportsMarkdownInputRouting(), false);
          assert.equal(owner.checkpointJson(), trial.checkpoint);
          exactRestores++;
          assert.deepEqual(trial.history.map(step => step.command), history);
          for (const step of trial.history) {
            owner.execute({kind: step.command});
            assert.equal(owner.checkpointJson(), step.checkpoint);
            exactHistorySteps++;
          }
        } finally {
          owner.dispose();
        }
        expectCheckpointRefusal(() => foreignProfile[restore](trial.checkpoint));
        profileRefusals++;
        expectCheckpointRefusal(() => profile[wrongHistory](trial.checkpoint));
        historyPolicyRefusals++;
      }
    } finally {
      foreignProfile.dispose();
    }
  } finally {
    profile.dispose();
  }
  return {generation: reference.generation, files: reference.files, wasmSha256: sha256, programmaticRules,
    browserRouting: false, exactRestores, exactHistorySteps, profileRefusals, historyPolicyRefusals};
}

const [earlierDirectory, programmaticDirectory, executable] = process.argv.slice(2);
assert.ok(earlierDirectory && programmaticDirectory && executable && process.argv.length === 5,
  "Usage: probe-input-rules-local-readers.mjs EARLIER_LOCAL PROGRAMMATIC_LOCAL NATIVE_LOCAL_PROBE");
const runtimes = await loadHistoricalLocalInputRuleRuntimes(earlierDirectory, programmaticDirectory);
const nativeProbe = resolve(executable);
const executableSha256 = digest(readFileSync(nativeProbe));
const data = execFileSync(nativeProbe, [], {maxBuffer: 8 * 1024 * 1024, timeout: 120000});
assert.equal(digest(readFileSync(nativeProbe)), executableSha256, "Native fixture producer changed during the probe");
const fixture = JSON.parse(data);
assert.equal(fixture.format, "breditor/input-rules-native-local-checkpoints");
assert.equal(fixture.formatVersion, 1);
assert.equal(fixture.trials.filter(trial => trial.natural === false).length, 8);
assert.equal(fixture.trials.filter(trial => trial.natural === true).length, 8);
assert.equal(fixture.trials.length, 16);
const readers = runtimes.map(runtime => checkReader(runtime, fixture));
console.log(JSON.stringify({format: "breditor/input-rules-pinned-local-readers", formatVersion: 1,
  passed: true, readers, nativeFixture: {bytes: data.length, sha256: digest(data), executableSha256},
  sharedReadersQualified: false, browserRoutingQualified: false}, null, 2));
