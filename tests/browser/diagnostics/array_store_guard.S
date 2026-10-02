// Auditable arm64 post-store diagnostic, never linked into production.
// x3 tagged input; x9 double/int32 threshold; d0 result; d1 decoded double.
// x8 array backing storage, w2 index. Capture both the register and stored slot.
.text
.globl _breditor_array_store_guard
_breditor_array_store_guard:
    mrs x12, nzcv
    fmov x10, d0
    fmov x11, d1
    cmp x3, x9
    b.hi valid
    cmp x10, x11
    b.ne mismatch
    ldr x13, [x8, w2, uxtw #3]
    cmp x13, x11
    b.eq valid
mismatch:
    brk #0xbec
valid:
    ret
