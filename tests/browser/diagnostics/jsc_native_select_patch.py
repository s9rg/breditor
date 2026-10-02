"""Isolate FCSEL operand/condition dependence in a disposable JSC child.

The launcher pins the framework hash and stops at the function's first entry.
Control performs the same stop/read/resume but writes no bytes. Swap replaces
two instructions with equivalent source-swapped, condition-inverted FCSELs.
No installed files, existing processes, library signatures or policies change.
"""
import json
import struct
import lldb

state = None


def install(debugger, command, exe_ctx, result, internal_dict):
    global state
    variant = command.strip()
    if variant not in ("control", "swap", "relocated", "branch", "snapshot"):
        result.SetError("Expected control, swap, relocated, branch or snapshot")
        return
    target = debugger.GetSelectedTarget()
    process = target.GetProcess()
    frame = process.GetSelectedThread().GetFrameAtIndex(0)
    if process.GetState() != lldb.eStateStopped or frame.GetPCAddress().GetFileAddress() != 0x112ce24:
        result.SetError("Requires pinned function-entry stop")
        return
    module = frame.GetModule()
    changes = []
    error = lldb.SBError()
    # Audited with jsc_select_equivalence.S. Validate both before either write.
    for offset, original, swapped in ((0x112ce98, 0x1e618c00, 0x1e609c20),
                                       (0x112ceac, 0x1e628c21, 0x1e619c41)):
        address = module.ResolveFileAddress(offset).GetLoadAddress(target)
        before = process.ReadMemory(address, 4, error)
        if error.Fail() or before != struct.pack("<I", original):
            result.SetError("Instruction mismatch at " + hex(offset))
            return
        changes.append({"fileAddress": hex(offset), "address": address,
                        "originalHex": before.hex(), "replacementHex": struct.pack("<I", swapped).hex()})
    relocation = None
    if variant in ("relocated", "branch", "snapshot"):
        site = module.ResolveFileAddress(0x112ce80).GetLoadAddress(target)
        original = process.ReadMemory(site, 48, error)
        expected = bytes.fromhex("0000621ec8ffffd20900088b2101679e4900e0921f0009eb008c611e4100621e4800088b0201679e5f0009eb218c621e")
        if error.Fail() or original != expected:
            result.SetError("Conversion path differs from pinned instructions")
            return
        address = process.AllocateMemory(4096, lldb.ePermissionsReadable | lldb.ePermissionsExecutable, error)
        if error.Fail() or address == lldb.LLDB_INVALID_ADDRESS:
            result.SetError("Cannot allocate child-only executable diagnostic memory")
            return
        jump = lambda destination: struct.pack("<2IQ", 0x58000050, 0xd61f0200, destination)
        # Audited against jsc_branch_conversion.S; no calls or PC-relative data.
        branch = struct.pack("<14I", 0xd2ffffc8, 0x92e00049, 0xeb09001f, 0x54000088,
                             0x8b080003, 0x9e670060, 0x14000002, 0x1e620000,
                             0xeb09005f, 0x54000088, 0x8b080043, 0x9e670061,
                             0x14000002, 0x1e620041)
        # Register snapshots do not modify NZCV or add comparison branches.
        # See jsc_conversion_snapshots.S for the audited instruction snippets.
        snapshots = (original[:4] + struct.pack("<I", 0x9e660005) + original[4:24] +
                     struct.pack("<2I", 0x9e660024, 0xd53b4207) + original[24:28] +
                     struct.pack("<3I", 0xd53b420b, 0x9e66000c, 0x9e66002d) + original[28:44] +
                     struct.pack("<I", 0x9e660026) + original[44:] +
                     struct.pack("<3I", 0xd53b420e, 0x9e66002f, 0x9e660051))
        body = original if variant == "relocated" else snapshots if variant == "snapshot" else branch
        payload = body + jump(site + 48)
        if process.WriteMemory(address, payload, error) != len(payload) or error.Fail():
            result.SetError("Cannot write diagnostic conversion")
            return
        if process.ReadMemory(address, len(payload), error) != payload or error.Fail():
            result.SetError("Diagnostic conversion readback failed")
            return
        patch = jump(address)
        if process.WriteMemory(site, patch, error) != len(patch) or error.Fail():
            result.SetError("Cannot redirect conversion in child")
            return
        if process.ReadMemory(site, len(patch), error) != patch or error.Fail():
            result.SetError("Conversion redirection readback failed")
            return
        relocation = {"site": hex(site), "address": hex(address), "originalHex": original.hex(),
                      "payloadHex": payload.hex(), "patchHex": patch.hex()}
    elif variant == "swap":
        for item in changes:
            data = bytes.fromhex(item["replacementHex"])
            if process.WriteMemory(item["address"], data, error) != 4 or error.Fail():
                result.SetError("Cannot patch diagnostic child")
                return
            if process.ReadMemory(item["address"], 4, error) != data or error.Fail():
                result.SetError("Patch verification failed")
                return
    for i in range(target.GetNumBreakpoints() - 1, -1, -1):
        bp = target.GetBreakpointAtIndex(i)
        if bp.GetNumLocations() == 1 and bp.GetLocationAtIndex(0).GetAddress().GetFileAddress() == 0x112ce24:
            target.BreakpointDelete(bp.GetID())
    state = {"variant": variant, "changedInstructions": 2 if variant == "swap" else 0,
             "verifiedSelectInstructions": [{"fileAddress": item["fileAddress"], "originalHex": item["originalHex"]}
                                            for item in changes],
             "writes": changes if variant == "swap" else []}
    if relocation is not None:
        state["changedInstructions"] = 4
        state["relocation"] = relocation
    result.PutCString("BREDITOR_NATIVE_SELECT=" + json.dumps(state))


def __lldb_init_module(debugger, internal_dict):
    debugger.HandleCommand("command script add -f jsc_native_select_patch.install breditor-native-select")
