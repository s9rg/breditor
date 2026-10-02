// Cold trap for the independently observed [2048,2048,2048,2048,0] pattern.
// Enter after initializeIndex stores slot 4, with original x3 input intact.
// No source-value assumption: catches a zero already present at function entry.
// Only caller-saved registers are used. At index 4 all five slots are allocated.
// The deliberate control substitutes only x10's diagnostic snapshot at +12.
.text
.p2align 2
.globl _breditor_array_pattern_guard
_breditor_array_pattern_guard:
    mrs x12, nzcv
    cmp w2, #4
    b.ne 1f
    ldr x10, [x8, #32]
    cbnz x10, 1f
    mov x11, #0x40a0000000000000
    ldr x13, [x8]
    cmp x13, x11
    b.ne 1f
    ldr x13, [x8, #8]
    cmp x13, x11
    b.ne 1f
    ldr x13, [x8, #16]
    cmp x13, x11
    b.ne 1f
    ldr x13, [x8, #24]
    cmp x13, x11
    b.ne 1f
    brk #0xbec
1:
    ret
