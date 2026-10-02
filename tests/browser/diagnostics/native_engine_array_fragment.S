// Diagnostic only: call the verified finite-number fragment at its original
// loaded-engine address. No copied engine instructions or executable writes.
// The fragment uses x3 as encoded input, x8 as backing storage, w2 as index,
// and returns through our caller's LR. Only caller-saved registers are touched.
.text
.p2align 2
.globl _breditor_engine_array_fragment
_breditor_engine_array_fragment:
    mov x16, x0
    mov x3, x1
    mov x8, x2
    mov x2, #0
    br x16
