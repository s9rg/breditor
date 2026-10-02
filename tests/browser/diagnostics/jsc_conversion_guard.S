/* Auditable instruction source for jsc_native_capture.py's child-only guard.
 * Assemble/disassemble on arm64 macOS; the Python script fills jump addresses.
 * No engine library is patched on disk. x3..x8/x16 are caller-clobbered and
 * unused by the remaining numeric fast path before its own writes.
 */
.text
.globl _breditor_first_guard
_breditor_first_guard:
    mrs x10, nzcv
    cmp x0, x9
    b.hi 1f
    fmov x3, d0
    fmov x4, d1
    cmp x3, x4
    b.eq 1f
    brk #0xbed
1:
    scvtf d1, w2
    add x8, x2, x8
    fmov d2, x8
    cmp x2, x9
.globl _breditor_second_guard
_breditor_second_guard:
    fmov x5, d1
    fmov x6, d2
    mrs x7, nzcv
    fcsel d1, d1, d2, hi
    fmov x8, d1
    csel x5, x5, x6, hi
    cmp x5, x8
    b.eq 2f
    brk #0xbee
2:
    ldr x16, 3f
    br x16
3:
    .quad 0
