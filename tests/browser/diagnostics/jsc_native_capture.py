"""LLDB command for our standalone child only; never attaches to other apps.

Record a bounded register/stack snapshot, then terminate a stopped diagnostic
child. Called after `process launch`; an exited process is never killed.
"""
import json
import struct
import sys
import lldb

guard_state = None


def install_guard(debugger, command, exe_ctx, result, internal_dict):
    """Instrument only this launched child, after its first fcsel, before d1 is
    overwritten. No on-disk mutation. Preserve every displaced instruction.
    The guard changes timing/code layout, so a pass never exonerates the engine.
    """
    global guard_state
    target = debugger.GetSelectedTarget()
    process = target.GetProcess()
    frame = process.GetSelectedThread().GetFrameAtIndex(0)
    if process.GetState() != lldb.eStateStopped or frame.GetPCAddress().GetFileAddress() != 0x112ce24:
        result.SetError("Guard requires the pinned function-entry stop")
        return
    module = frame.GetModule()
    site = module.ResolveFileAddress(0x112ce9c).GetLoadAddress(target)
    error = lldb.SBError()
    original = process.ReadMemory(site, 20, error)
    # scvtf d1,w2; add x8,x2,x8; fmov d2,x8; cmp x2,x9.
    expected = struct.pack("<5I", 0x1e620041, 0x8b080048, 0x9e670102, 0xeb09005f, 0x1e628c21)
    if error.Fail() or original != expected:
        result.SetError("Displaced instruction bytes do not match pinned code: " + original.hex())
        return
    # Debugger writes executable memory through its process API. Do not request
    # a persistent writable+executable mapping or weaken host protections.
    address = process.AllocateMemory(4096, lldb.ePermissionsReadable | lldb.ePermissionsExecutable, error)
    if error.Fail() or address == lldb.LLDB_INVALID_ADDRESS:
        result.SetError("Diagnostic allocation failed: " + str(error))
        return
    # cmp x0,x9; b.hi resume; fmov x3,d0; fmov x4,d1; cmp x3,x4;
    # b.eq resume; brk #0xbed. Integer bits also compare NaNs/signed zero.
    guard = struct.pack("<8I", 0xd53b420a, 0xeb09001f, 0x540000c8, 0x9e660003, 0x9e660024,
                        0xeb04007f, 0x54000040, 0xd4217da0)
    control = command.strip() == "control"
    if control:
        # Test the trap plumbing by replacing ONLY the diagnostic x3 snapshot
        # with zero. This deliberate mismatch is never real fault evidence.
        guard = guard[:12] + struct.pack("<I", 0xd2800003) + guard[16:]
    second = struct.pack("<9I", 0x9e660025, 0x9e660046, 0xd53b4207, 0x1e628c21,
                         0x9e660028, 0x9a8680a5, 0xeb0800bf, 0x54000040, 0xd4217dc0)
    def jump(destination):
        return struct.pack("<2IQ", 0x58000050, 0xd61f0200, destination)
    payload = guard + original[:16] + second + jump(site + 20)
    if process.WriteMemory(address, payload, error) != len(payload) or error.Fail():
        result.SetError("Cannot write diagnostic guard: " + str(error))
        return
    patch = jump(address)
    if process.WriteMemory(site, patch, error) != len(patch) or error.Fail():
        result.SetError("Cannot redirect diagnostic child: " + str(error))
        return
    if process.ReadMemory(site, len(patch), error) != patch or error.Fail():
        result.SetError("Diagnostic redirection readback failed")
        return
    guard_state = {"site": hex(site), "address": hex(address), "trap": hex(address + 28),
                   "secondTrap": hex(address + 32 + 16 + 32), "control": control,
                   "originalHex": original.hex(), "payloadHex": payload.hex(), "patchHex": patch.hex()}
    # Registered breakpoints let LLDB run the normal capture command rather
    # than abort its batch on an unregistered EXC_BREAKPOINT instruction.
    target.BreakpointCreateByAddress(address + 28)
    target.BreakpointCreateByAddress(address + 32 + 16 + 32)
    # Remove only our entry breakpoint, keeping all failure breakpoints.
    for i in range(target.GetNumBreakpoints() - 1, -1, -1):
        bp = target.GetBreakpointAtIndex(i)
        if bp.GetNumLocations() == 1 and bp.GetLocationAtIndex(0).GetAddress().GetFileAddress() == 0x112ce24:
            target.BreakpointDelete(bp.GetID())
    result.PutCString("BREDITOR_NATIVE_GUARD=" + json.dumps(guard_state))


def registers(frame):
    return {name: frame.FindRegister(name).GetValue()
            for name in ("x0", "x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x9", "x10", "x11", "x12", "x13", "x14", "x15", "x17", "d0", "d1", "d2", "cpsr", "fpcr", "fpsr", "pc")}


def replay_numeric_path(target, process, thread, report):
    """Bounded destructive replay ONLY in the already-failed diagnostic child.

    Preserve the original snapshot first. Never run expressions in the child,
    repair a result, or resume normal JS execution. Starting at +92 reloads
    all numeric temporaries from the still-live input registers. Caller pins
    the framework SHA before launching. Kill the child after this trace.
    """
    if (report["fileAddress"] != "0x112cf60" or
            report["registers"]["x0"] != "0x40a2000000000000" or
            report["registers"]["x2"] != "0xfffe000000000800"):
        return {"outcome": "not-applicable"}
    frame = thread.GetFrameAtIndex(0)
    module = frame.GetModule()
    start = module.ResolveFileAddress(0x112ce80).GetLoadAddress(target)
    error = lldb.SBError()
    code = process.ReadMemory(start, 60, error)
    if error.Fail():
        return {"outcome": "code-read-failed", "error": str(error)}
    frame_address = frame.FindRegister("x1").GetValueAsUnsigned()
    call_frame = process.ReadMemory(frame_address + 0x20, 32, error)
    if error.Fail():
        return {"outcome": "frame-read-failed", "error": str(error)}
    if not frame.SetPC(start):
        return {"outcome": "set-pc-failed"}
    snapshots = []
    for _ in range(24):
        frame = thread.GetFrameAtIndex(0)
        address = frame.GetPCAddress().GetFileAddress()
        snapshots.append({"fileAddress": hex(address), "registers": registers(frame)})
        if address in (0x112ce64, 0x112cf60):
            return {"outcome": "reached-true-return" if address == 0x112ce64 else "reached-false-return",
                    "codeHex": code.hex(), "callFrameHex": call_frame.hex(), "steps": snapshots}
        if not 0x112ce80 <= address <= 0x112cf44:
            break
        thread.StepInstruction(False)
        if process.GetState() != lldb.eStateStopped:
            break
    return {"outcome": "incomplete-replay", "codeHex": code.hex(), "callFrameHex": call_frame.hex(), "steps": snapshots}


def capture(debugger, command, exe_ctx, result, internal_dict):
    target = debugger.GetSelectedTarget()
    process = target.GetProcess()
    stopped = process.GetState() == lldb.eStateStopped
    report = {
        "stopped": stopped,
        "exited": process.GetState() == lldb.eStateExited,
        "exitStatus": process.GetExitStatus(),
        "breakpointHits": sum(target.GetBreakpointAtIndex(i).GetHitCount()
                              for i in range(target.GetNumBreakpoints())),
    }
    if guard_state is not None:
        report["guard"] = guard_state
    select_module = sys.modules.get("jsc_native_select_patch")
    if select_module is not None and select_module.state is not None:
        report["selectPatch"] = select_module.state
    if stopped:
        thread = process.GetSelectedThread()
        frame = thread.GetFrameAtIndex(0)
        report["breakpointStop"] = thread.GetStopReason() == lldb.eStopReasonBreakpoint
        report["fileAddress"] = hex(frame.GetPCAddress().GetFileAddress())
        report["module"] = frame.GetModule().GetFileSpec().GetFilename()
        report["registers"] = registers(frame)
        report["guardStop"] = guard_state is not None and frame.GetPC() in (
            int(guard_state["trap"], 16), int(guard_state["secondTrap"], 16))
        if report["guardStop"]:
            report["guardPhase"] = "first" if frame.GetPC() == int(guard_state["trap"], 16) else "second"
        report["stack"] = [thread.GetFrameAtIndex(i).GetFunctionName()
                           for i in range(min(thread.GetNumFrames(), 8))]
        if command.strip() == "replay" and report["breakpointStop"]:
            report["replay"] = replay_numeric_path(target, process, thread, report)
    result.PutCString("BREDITOR_NATIVE_CAPTURE=" + json.dumps(report))
    if stopped:
        error = process.Kill()
        if error.Fail():
            result.SetError("Could not terminate diagnostic child: " + str(error))


def __lldb_init_module(debugger, internal_dict):
    debugger.HandleCommand("command script add -f jsc_native_capture.capture breditor-native-capture")
    debugger.HandleCommand("command script add -f jsc_native_capture.install_guard breditor-install-native-guard")
