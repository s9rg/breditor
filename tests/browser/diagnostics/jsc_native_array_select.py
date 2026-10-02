"""Paired selection-path experiments in an owned, pinned WebProcess only.

Both redirect only FCSEL and return to the original comparison/store. The
relocated control retains FCSEL; the candidate replaces it with B.HI/FMOV.
This is diagnostic evidence, never an installed-engine or editor patch.
"""
import json
import struct
import lldb
import jsc_native_array_capture as capture


def branch(source, destination):
    offset = destination - source
    if offset % 4 or not -(1 << 27) <= offset < (1 << 27):
        raise ValueError("Direct branch out of range")
    return 0x14000000 | ((offset // 4) & 0x3ffffff)


def install(debugger, command, exe_ctx, result, internal_dict):
    variant = command.strip()
    if variant not in ("select-relocated", "select-branch", "select-entry-control", "select-allocation-control"):
        result.SetError("Expected select-relocated|select-branch|select-entry-control|select-allocation-control")
        return
    target = debugger.GetSelectedTarget()
    process = target.GetProcess()
    frame = process.GetSelectedThread().GetFrameAtIndex(0)
    if process.GetState() != lldb.eStateStopped or frame.GetPCAddress().GetFileAddress() != 0xf7c074:
        result.SetError("Requires pinned initializer entry")
        return
    site = frame.GetModule().ResolveFileAddress(0xf7c130).GetLoadAddress(target)
    error = lldb.SBError()
    original = process.ReadMemory(site, 20, error)
    expected = struct.pack("<5I", 0x1e618c00, 0x1e602000, 0x54000066, 0xfc225900, 0xd65f03c0)
    if error.Fail() or original != expected:
        result.SetError("Pinned conversion/store differ")
        return
    entry_only = variant == "select-entry-control"
    unchanged = variant in ("select-entry-control", "select-allocation-control")
    address = None if entry_only else capture.allocate_near(process, frame, site, result)
    if not entry_only and address is None:
        return
    # Same 12-byte allocation footprint and same return branch. The original
    # CMP's flags survive; B.HI chooses the already converted integer in d0.
    words = [0x1e618c00, 0xd503201f] if variant == "select-relocated" else [0x54000048, 0x1e604020]
    payload = b"" if unchanged else struct.pack("<3I", *words, branch(address + 8, site + 4))
    patch = b"" if unchanged else struct.pack("<I", branch(site, address))
    if not unchanged and (process.WriteMemory(address, payload, error) != len(payload) or error.Fail() or process.ReadMemory(address, len(payload), error) != payload):
        result.SetError("Candidate payload write/readback failed")
        return
    if not unchanged and (process.WriteMemory(site, patch, error) != 4 or error.Fail() or process.ReadMemory(site, 4, error) != patch):
        result.SetError("Candidate redirection failed")
        return
    if process.ReadMemory(site + 4, 16, error) != original[4:] or error.Fail():
        result.SetError("Original comparison/store changed")
        return
    if unchanged and (process.ReadMemory(site, 20, error) != original or error.Fail()):
        result.SetError("Control instruction bytes changed")
        return
    for index in range(target.GetNumBreakpoints() - 1, -1, -1):
        bp = target.GetBreakpointAtIndex(index)
        if bp.GetNumLocations() == 1 and bp.GetLocationAtIndex(0).GetAddress().GetFileAddress() == 0xf7c074:
            target.BreakpointDelete(bp.GetID())
    capture.state = {"variant": "probe", "placement": variant, "pid": process.GetProcessID(),
                     "site": hex(site), "address": hex(address) if address is not None else None, "trap": None,
                     "patchHex": patch.hex(), "payloadHex": payload.hex(), "originalHex": original.hex(),
                     "checkKind": "unchanged-selection-control" if unchanged else "selection-candidate-not-a-guard"}
    result.PutCString("BREDITOR_ARRAY_GUARD=" + json.dumps(capture.state))


def __lldb_init_module(debugger, internal_dict):
    debugger.HandleCommand("command script add -f jsc_native_array_select.install breditor-array-select")
