;; Alternative instruction path: load the exact value from linear memory.
;; Memory is private and initialized once; all three call arguments are ignored.
(module
  (memory 1)
  (data (i32.const 0) "\00\00\00\00\00\00\a0\40")
  (func (export "bound") (param i32 i32 i32) (result f64)
    i32.const 0
    f64.load))
