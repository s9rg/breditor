"""Post-conversion guard for one hash-pinned, owned diagnostic process.

The original FCSEL stays at its original address. The post-conversion guard
redirects its following four instructions; the post-store guard redirects
only the return after the unchanged store. No installed file is modified.
Timing/layout change, so a passing guarded run is not an engine qualification.
"""
import json
import struct
import lldb

state = None


def allocate_near(process, frame, site, result):
    """Hint a fresh anonymous RX page into a verified gap; never MAP_FIXED.

    Used only by the explicit post-store-near diagnostic in an owned child.
    It must fit a direct branch so the original conversion/store stay intact.
    """
    page = 16384  # Pinned arm64 macOS host page size.
    cursor = (max(page, site - (1 << 27) + page) + page - 1) & ~(page - 1)
    upper = site + (1 << 27) - page
    for _ in range(512):
        region = lldb.SBMemoryRegionInfo()
        error = process.GetMemoryRegionInfo(cursor, region)
        if error.Fail() or region.GetRegionEnd() <= cursor or cursor >= upper:
            break
        if not region.IsMapped() and min(region.GetRegionEnd(), upper) - cursor >= page:
            options = lldb.SBExpressionOptions()
            options.SetTimeoutInMicroSeconds(2000000)
            options.SetTryAllThreads(False)
            options.SetIgnoreBreakpoints(True)
            options.SetUnwindOnError(True)
            expression = "((void*(*)(void*,unsigned long,int,int,int,long long))mmap)((void*)%s, 16384, 5, 0x1002, -1, 0)" % hex(cursor)
            value = frame.EvaluateExpression(expression, options)
            address = value.GetValueAsUnsigned(lldb.LLDB_INVALID_ADDRESS)
            if value.GetError().Fail() or address == lldb.LLDB_INVALID_ADDRESS:
                result.SetError("Near allocation failed: " + str(value.GetError()))
                return None
            if address % page or not -(1 << 27) <= address - site < (1 << 27):
                result.SetError("OS did not honor near allocation hint; no engine patch installed")
                return None
            return address
        cursor = (region.GetRegionEnd() + page - 1) & ~(page - 1)
    result.SetError("No free page within direct-branch range")
    return None


def install(debugger, command, exe_ctx, result, internal_dict):
    global state
    target = debugger.GetSelectedTarget()
    process = target.GetProcess()
    frame = process.GetSelectedThread().GetFrameAtIndex(0)
    args = command.split()
    if len(args) not in (1, 2) or args[0] not in ("probe", "control") or (len(args) == 2 and args[1] not in ("post-conversion", "post-store", "post-store-near", "post-store-pattern")):
        result.SetError("Expected probe|control [post-conversion|post-store|post-store-near|post-store-pattern]")
        return
    control = args[0] == "control"
    placement = args[1] if len(args) == 2 else "post-conversion"
    if process.GetState() != lldb.eStateStopped or frame.GetPCAddress().GetFileAddress() != 0xf7c074:
        result.SetError("Requires the pinned array initializer entry in our launched child")
        return
    module = frame.GetModule()
    site = module.ResolveFileAddress(0xf7c134).GetLoadAddress(target)
    error = lldb.SBError()
    original = process.ReadMemory(site, 16, error)
    expected = struct.pack("<4I", 0x1e602000, 0x54000066, 0xfc225900, 0xd65f03c0)
    if error.Fail() or original != expected:
        result.SetError("Pinned post-conversion instructions differ")
        return
    select = process.ReadMemory(site - 4, 4, error)
    if error.Fail() or select != struct.pack("<I", 0x1e618c00):
        result.SetError("Original FCSEL differs")
        return
    address = allocate_near(process, frame, site + 12, result) if placement in ("post-store-near", "post-store-pattern") else process.AllocateMemory(4096, lldb.ePermissionsReadable | lldb.ePermissionsExecutable, error)
    if address is None:
        return
    if error.Fail() or address == lldb.LLDB_INVALID_ADDRESS:
        result.SetError("Cannot allocate child-only guard")
        return
    def jump(destination):
        return struct.pack("<2IQ", 0x58000050, 0xd61f0200, destination)
    # mrs x12,nzcv; fmov x10,d0; fmov x11,d1; cmp x3,x9;
    # b.hi valid (int32); cmp x10,x11; b.eq valid; brk #0xbec.
    # x10-x12 and x16 are caller-saved and dead on the displaced paths.
    guard = [0xd53b420c, 0x9e66000a, 0x9e66002b, 0xeb09007f,
             0x54000088, 0xeb0b015f, 0x54000040, 0xd4217d80]
    if control:
        # Deliberately alter ONLY the diagnostic snapshot, never d0 or input.
        guard[1] = 0xd280000a
    # Retain original fcmp, store and return; NaN branches through an absolute
    # jump to the original conversion fallback. Original FCSEL is untouched.
    payload = struct.pack("<8I", *guard) + original[:4] + struct.pack("<I", 0x54000066) + original[8:16] + jump(site + 16)
    patch_site = site
    patch = jump(address)
    trap_offset = 28
    if placement.startswith("post-store"):
        # Branch from the original RET, preserving FCSEL/FCMP/B.VS/STR in situ.
        # At this point saved NZCV is from FCMP, not the original integer CMP.
        patch_site = site + 12
        offset = address - patch_site
        if offset % 4 or not -(1 << 27) <= offset < (1 << 27):
            result.SetError("Guard allocation is outside direct-branch range")
            return
        patch = struct.pack("<I", 0x14000000 | ((offset // 4) & 0x3ffffff))
        payload = struct.pack("<8I", *guard) + original[12:16]
    if placement == "post-store-pattern":
        # Assembled/audited in array_pattern_guard.S. Observe stored bytes,
        # not agreement with x3: an already-wrong input is also interesting.
        pattern = [0xd53b420c, 0x7100105f, 0x54000221, 0xf940110a,
                   0xb50001ea, 0xd2e8140b, 0xf940010d, 0xeb0b01bf,
                   0x54000161, 0xf940050d, 0xeb0b01bf, 0x54000101,
                   0xf940090d, 0xeb0b01bf, 0x540000a1, 0xf9400d0d,
                   0xeb0b01bf, 0x54000041, 0xd4217d80, 0xd65f03c0]
        if control:
            pattern[3] = 0xd280000a  # Snapshot only; stored slot remains intact.
        payload = struct.pack("<20I", *pattern)
        trap_offset = 72
    if process.WriteMemory(address, payload, error) != len(payload) or error.Fail():
        result.SetError("Cannot install guard payload")
        return
    if process.WriteMemory(patch_site, patch, error) != len(patch) or error.Fail():
        result.SetError("Cannot redirect post-conversion child path")
        return
    if process.ReadMemory(patch_site, len(patch), error) != patch or error.Fail():
        result.SetError("Guard patch readback differs")
        return
    if process.ReadMemory(site - 4, 4, error) != select or error.Fail():
        result.SetError("Original FCSEL changed unexpectedly")
        return
    if placement.startswith("post-store") and (process.ReadMemory(site, 12, error) != original[:12] or error.Fail()):
        result.SetError("Original comparison/store changed unexpectedly")
        return
    state = {"variant": "control" if control else "probe", "pid": process.GetProcessID(),
             "placement": placement, "site": hex(patch_site), "address": hex(address), "trap": hex(address + trap_offset),
             "patchHex": patch.hex(),
             "originalHex": original.hex(), "selectHex": select.hex(), "payloadHex": payload.hex()}
    target.BreakpointCreateByAddress(address + trap_offset)
    for index in range(target.GetNumBreakpoints() - 1, -1, -1):
        bp = target.GetBreakpointAtIndex(index)
        if bp.GetNumLocations() == 1 and bp.GetLocationAtIndex(0).GetAddress().GetFileAddress() == 0xf7c074:
            target.BreakpointDelete(bp.GetID())
    result.PutCString("BREDITOR_ARRAY_GUARD=" + json.dumps(state))


def capture(debugger, command, exe_ctx, result, internal_dict):
    process = debugger.GetSelectedTarget().GetProcess()
    stopped = process.GetState() == lldb.eStateStopped
    report = {"guard": state, "stopped": stopped,
              "exited": process.GetState() == lldb.eStateExited, "exitStatus": process.GetExitStatus()}
    if stopped:
        thread = process.GetSelectedThread()
        frame = thread.GetFrameAtIndex(0)
        report["guardStop"] = state is not None and state.get("trap") is not None and process.GetProcessID() == state["pid"] and frame.GetPC() == int(state["trap"], 16)
        report["registers"] = {name: frame.FindRegister(name).GetValue()
                               for name in ("x0", "x1", "x2", "x3", "x8", "x9", "x10", "x11", "x12", "x19", "x20", "x21", "x22", "lr", "d0", "d1", "cpsr", "fpcr", "fpsr", "pc")}
        report["stack"] = [thread.GetFrameAtIndex(i).GetFunctionName() for i in range(min(thread.GetNumFrames(), 10))]
        if report["guardStop"] and state["placement"].startswith("post-store"):
            # Cold-path evidence of the slot already written by the engine.
            slot = frame.FindRegister("x8").GetValueAsUnsigned() + (frame.FindRegister("x2").GetValueAsUnsigned() & 0xffffffff) * 8
            error = lldb.SBError()
            data = process.ReadMemory(slot, 8, error)
            report["storedSlot"] = {"address": hex(slot), "littleEndianHex": data.hex() if error.Success() else None}
            if state["placement"] == "post-store-pattern":
                backing = frame.FindRegister("x8").GetValueAsUnsigned()
                data = process.ReadMemory(backing, 40, error)
                report["storedArray"] = {"address": hex(backing), "littleEndianHex": data.hex() if error.Success() else None}
                # Read the five private source JSValues only for the verified
                # constructArrayNegativeIndexed call site/count/index. Its
                # post-decrement load leaves the just-used source at x20+8;
                # earlier source slots follow in reverse order. Cold reads
                # do not assert which earlier instruction first went wrong.
                return_address = frame.FindRegister("lr").GetValueAsUnsigned()
                caller = debugger.GetSelectedTarget().ResolveLoadAddress(return_address).GetFileAddress()
                report["callerFileAddress"] = hex(caller)
                if caller == 0xf7c400 and frame.FindRegister("x21").GetValueAsUnsigned() == 5 and frame.FindRegister("x22").GetValueAsUnsigned() == 4:
                    source = frame.FindRegister("x20").GetValueAsUnsigned() + 8
                    data = process.ReadMemory(source, 40, error)
                    report["sourceSlots"] = {"address": hex(source),
                        "slotOrderEncodedHex": [hex(value) for value in reversed(struct.unpack("<5Q", data))] if error.Success() and len(data) == 40 else None}
    result.PutCString("BREDITOR_ARRAY_CAPTURE=" + json.dumps(report))
    if stopped:
        # Controllers only target disposable children they created themselves.
        error = process.Kill()
        if error.Fail():
            result.SetError("Could not terminate diagnostic child: " + str(error))


def __lldb_init_module(debugger, internal_dict):
    debugger.HandleCommand("command script add -f jsc_native_array_capture.install breditor-array-install")
    debugger.HandleCommand("command script add -f jsc_native_array_capture.capture breditor-array-capture")
