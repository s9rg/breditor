//! Dedicated opt-in suggestion-review fixture; shares the real sealed-source
//! and durable-target host implementation with the original selected fixture.
#[path = "selected_delivery_functional.rs"]
mod selected;

fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    selected::main()
}
