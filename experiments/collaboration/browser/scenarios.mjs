// The browser runs the real Rust/Wasm session. No JavaScript replica or undo stack.
export const caseNames = ["mixed-history", "unicode-anchors", "atomic-rejection", "offline-cell", "writer-and-journal", "partition-schedules", "directional-selection", "same-field-selective-undo", "owned-formatting"];

export function runCase(name, ProbeSession) {
  const owned = [];
  let assertions = 0;
  // Object member order is not a semantic contract. Array order, field names,
  // exact scalar values and directional endpoints remain significant.
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value !== null && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const eq = (actual, expected, label) => {
    assertions += 1;
    if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) throw new Error(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  };
  const throws = (callback, label) => {
    assertions += 1;
    let rejected = false;
    try { callback(); } catch { rejected = true; }
    if (!rejected) throw new Error(`${label}: accepted unexpectedly`);
  };
  const make = writer => { const value = new ProbeSession("probe-room", String(writer)); owned.push(value); return value; };
  const restore = checkpoint => { const value = ProbeSession.restore(checkpoint); owned.push(value); return value; };
  const apply = (session, ...commands) => session.apply(JSON.stringify(commands));
  const insert = (offset, text, target = { kind: "body" }) => ({ kind: "insert_text", data: { target, offset, text } });
  const width = value => ({ kind: "resize_column", data: { column: "column-1", width: value } });
  const asset = value => ({ kind: "set_image_asset", data: { image: "image-1", asset: value } });
  const alt = value => ({ kind: "set_image_alt", data: { image: "image-1", alt: value } });
  const strong = (offset, length, enabled) => ({ kind: "set_strong", data: { target: { kind: "body" }, offset, length, enabled } });
  const view = session => JSON.parse(session.view());
  const restartOracle = session => {
    const recovered = restore(session.checkpoint());
    eq(view(recovered), view(session), "restart content");
    eq(recovered.version(), session.version(), "restart causal state");
    eq(recovered.undo_count(), session.undo_count(), "restart undo count");
    eq(recovered.redo_count(), session.redo_count(), "restart redo count");
    return recovered;
  };
  const converge = sessions => {
    const messages = sessions.map(session => session.updates());
    for (const session of sessions) for (const message of messages) session.receive(message);
    for (const session of sessions) {
      eq(view(session), view(sessions[0]), "converged content");
      eq(session.version(), sessions[0].version(), "converged causal state");
    }
  };

  try {
    switch (name) {
      case "mixed-history": {
        const a = make(1001), b = make(1002);
        apply(a, insert(0, "a🙂b"));
        apply(a, insert(3, " local"));
        restartOracle(a);
        b.receive(a.updates());
        apply(b, insert(0, "remote "), alt("remote description"));
        a.receive(b.updates());
        apply(a, width(260), asset("asset-1"));
        eq(a.undo_count(), 3, "one group across containers");
        eq(a.undo(), true, "undo group");
        const recovered = restartOracle(a);
        eq(recovered.redo(), true, "recovered redo");
        for (let index = 0; index < 3; index += 1) eq(recovered.undo(), true, "recovered undo");
        eq(recovered.body(), "remote ", "selective undo removes all local scalars");
        eq(view(recovered).images["image-1"].alt, "remote description", "remote metadata retained");
        for (let index = 0; index < 3; index += 1) eq(recovered.redo(), true, "recovered redo");
        eq(recovered.body(), "remote a🙂 localb", "exact redo");
        converge([recovered, b]);
        restartOracle(recovered);
        break;
      }
      case "unicode-anchors": {
        const a = make(2001), b = make(2002);
        for (const invalid of [-1, -0, 0.5, 2 ** 32, Number.NaN, Number.POSITIVE_INFINITY, "0", null, false, undefined]) {
          throws(() => a.anchor(invalid, false), "strict Wasm offset");
          throws(() => a.set_selection(0, invalid), "strict Wasm selection offset");
        }
        throws(() => a.anchor(0, "false"), "strict Wasm affinity");
        apply(a, insert(0, "a🙂é👩‍👩‍👧‍👧終"));
        let boundary = 0;
        for (const scalar of a.body()) {
          const anchor = a.anchor(boundary, false);
          eq(a.resolve_anchor(anchor), boundary, "scalar anchor round trip");
          if (scalar.length === 2) {
            const checkpoint = a.checkpoint();
            throws(() => a.anchor(boundary + 1, false), "surrogate anchor");
            throws(() => apply(a, insert(boundary + 1, "bad")), "surrogate insertion");
            eq(a.checkpoint(), checkpoint, "rejected insertion atomic");
          }
          boundary += scalar.length;
        }
        eq(a.resolve_anchor(a.anchor(boundary, false)), boundary, "end anchor");
        const before = a.anchor(3, true), after = a.anchor(3, false);
        eq(a.resolve_anchor(before), 3, "before affinity origin");
        b.receive(a.updates());
        apply(b, insert(3, "X"));
        a.receive(b.updates());
        eq(a.resolve_anchor(before), 3, "before affinity remote insert");
        eq(a.resolve_anchor(after), 4, "after affinity remote insert");
        const resumed = restartOracle(a);
        eq(resumed.resolve_anchor(before), 3, "restored before affinity");
        eq(resumed.resolve_anchor(after), 4, "restored after affinity");
        break;
      }
      case "atomic-rejection": {
        const a = make(3001);
        apply(a, insert(0, "retained"));
        a.undo();
        const checkpoint = a.checkpoint(), version = a.version();
        throws(() => apply(a, insert(0, "must-not-appear"), width(0)), "second step invalid");
        eq(a.checkpoint(), checkpoint, "entire journal retained");
        eq(a.version(), version, "causal state retained");
        eq(a.body(), "", "no partial text");
        eq(a.redo_count(), 1, "redo owner retained");
        throws(() => a.receive(Uint8Array.of(0, 1, 2)), "malformed remote");
        eq(a.checkpoint(), checkpoint, "malformed import isolation");
        eq(a.redo(), true, "redo still works");
        eq(a.body(), "retained", "redo content");
        break;
      }
      case "offline-cell": {
        const a = make(4001), b = make(4002), c = make(4003);
        const target = { kind: "cell", table: "t", row: "r", column: "c" };
        apply(a, insert(0, "alpha", target));
        apply(b, insert(0, "beta", target));
        apply(c, insert(0, "gamma", target));
        converge([a, b, c]);
        const merged = view(a).cells["1:t1:r1:c"].body;
        for (const text of ["alpha", "beta", "gamma"]) eq(merged.includes(text), true, "each offline body retained");
        eq(a.undo(), true, "cell author undo");
        eq(view(a).cells["1:t1:r1:c"].body.includes("alpha"), false, "own cell text removed");
        eq(view(a).cells["1:t1:r1:c"].body.includes("beta"), true, "other cell text retained");
        const recovered = restartOracle(a);
        eq(recovered.redo(), true, "cell recovered redo");
        eq(view(recovered).cells["1:t1:r1:c"].body, merged, "cell exact restoration");
        converge([recovered, b, c]);
        break;
      }
      case "writer-and-journal": {
        const a = make("18446744073709551614");
        apply(a, insert(0, "saved"));
        const impostor = make("18446744073709551614");
        apply(impostor, insert(0, "collision"));
        const checkpoint = a.checkpoint();
        throws(() => a.receive(impostor.updates()), "writer counter collision");
        eq(a.checkpoint(), checkpoint, "collision does not mutate");
        const tampered = JSON.parse(checkpoint);
        tampered.entries[0].commands[0].data.text = "changed";
        throws(() => restore(JSON.stringify(tampered)), "exact replay mismatch");
        tampered.version = 2;
        throws(() => restore(JSON.stringify(tampered)), "future journal version");
        throws(() => make("01"), "noncanonical writer");
        throws(() => make("18446744073709551615"), "engine-reserved writer");
        throws(() => make("18446744073709551616"), "writer overflow");
        eq(a.body(), "saved", "source retained");
        restartOracle(a);
        break;
      }
      case "partition-schedules": {
        for (let seed = 1; seed <= 24; seed += 1) {
          let random = seed;
          const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random; };
          const peers = [make(seed * 10 + 1), make(seed * 10 + 2), make(seed * 10 + 3)];
          for (let peer = 0; peer < 3; peer += 1) {
            apply(peers[peer], insert(0, `writer-${peer}🙂`));
            apply(peers[peer], width(200 + peer), alt(`alt-${peer}`));
            restartOracle(peers[peer]);
          }
          const messages = peers.map(peer => peer.updates());
          for (const peer of peers) {
            const order = [0, 1, 2];
            for (let index = 2; index > 0; index -= 1) {
              const swap = next() % (index + 1);
              [order[index], order[swap]] = [order[swap], order[index]];
            }
            for (const index of order) { peer.receive(messages[index]); if (next() % 2) peer.receive(messages[index]); }
          }
          converge(peers);
          for (let peer = 0; peer < 3; peer += 1) eq(peers[0].body().includes(`writer-${peer}🙂`), true, "partition text survives");
          const resumed = restartOracle(peers[0]);
          eq(resumed.undo(), true, "partition local metadata undo");
          eq(resumed.undo(), true, "partition local text undo");
          eq(resumed.body().includes("writer-0🙂"), false, "partition removes own text");
          eq(resumed.body().includes("writer-1🙂"), true, "partition retains remote text");
          converge([resumed, peers[1], peers[2]]);
        }
        break;
      }
      case "directional-selection": {
        const a = make(8001), b = make(8002);
        a.set_selection(0, 0);
        apply(a, insert(0, "a🙂b"));
        a.set_selection(3, 1);
        apply(a, insert(3, "X"));
        a.set_selection(4, 4);
        b.receive(a.updates());
        apply(b, insert(0, "remote "));
        a.receive(b.updates());
        eq(JSON.parse(a.selection()), [11, 11], "remote-mapped caret");
        const recovered = restartOracle(a);
        eq(recovered.undo(), true, "selection undo");
        eq(recovered.body(), "remote a🙂b", "selection undo text");
        eq(JSON.parse(recovered.selection()), [10, 8], "backward range retained");
        eq(recovered.redo(), true, "selection redo");
        eq(JSON.parse(recovered.selection()), [11, 11], "redo caret retained");
        eq(JSON.parse(restore(recovered.checkpoint()).selection()), [11, 11], "restart redo caret");
        break;
      }
      case "same-field-selective-undo": {
        const a = make(9001), b = make(9002);
        apply(a, width(260), alt("first description"), asset("asset-first"));
        b.receive(a.updates());
        apply(b, width(300), alt("second description"), asset("asset-second"));
        a.receive(b.updates());
        eq(view(a).columns["column-1"].width, 300, "later remote width");
        eq(a.undo(), true, "retract masked local contributions");
        eq(a.undo_count(), 0, "masked action consumed");
        eq(view(a).columns["column-1"].width, 300, "remote width retained");
        eq(view(a).images["image-1"].alt, "second description", "remote alt retained");
        eq(view(a).images["image-1"].asset, "asset-second", "remote asset retained");
        b.receive(a.updates());
        b.undo();
        a.receive(b.updates());
        eq(view(a).columns["column-1"].width, undefined, "both undone means no resurrected width");
        eq(view(a).images["image-1"].alt, undefined, "both undone means no resurrected alt");
        const recovered = restartOracle(a);
        recovered.redo();
        eq(view(recovered).columns["column-1"].width, 260, "reactivate original local priority");
        b.receive(recovered.updates());
        b.redo();
        recovered.receive(b.updates());
        eq(view(recovered).columns["column-1"].width, 300, "remote redo priority retained");
        converge([recovered, b]);
        break;
      }
      case "owned-formatting": {
        const a = make(10001), b = make(10002);
        apply(a, insert(0, "a🙂b"));
        b.receive(a.updates());
        apply(a, strong(0, 4, true));
        apply(b, strong(1, 2, true));
        converge([a, b]);
        a.undo();
        const remoteRuns = [{ text: "a", strong: false }, { text: "🙂", strong: true }, { text: "b", strong: false }];
        eq(view(a).body_runs, remoteRuns, "undo keeps remote formatting");
        const recovered = restartOracle(a);
        recovered.redo();
        eq(view(recovered).body_runs, [{ text: "a🙂b", strong: true }], "format redo canonical seam");
        recovered.undo();
        recovered.undo();
        eq(recovered.body(), "", "own insertion undo");
        recovered.redo();
        eq(view(recovered).body_runs, remoteRuns, "text restoration retains remote format");
        const checkpoint = recovered.checkpoint();
        throws(() => apply(recovered, strong(1, 1, true)), "format splits emoji");
        eq(recovered.checkpoint(), checkpoint, "bad format atomic");
        restartOracle(recovered);
        break;
      }
      default: throw new Error(`Unknown contract case: ${name}`);
    }
    return { name, assertions, passed: true };
  } finally {
    for (const session of owned) session.free();
  }
}
