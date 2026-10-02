;; Independent assembler input for auditing the hand-written 48-byte fixture.
(module
  (func (export "bound") (param i32 i32 i32) (result f64)
    f64.const 2048))
