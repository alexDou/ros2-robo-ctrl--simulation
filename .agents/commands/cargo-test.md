---
description: "Run workspace tests via cargo-nextest with structured output"
---
1. Execute: `cargo nextest run --workspace --all-targets`
2. If any test fails, run the exact failing test under isolated output:
   `cargo nextest run -E 'test(test_name)' --no-capture`
3. Identify whether failure stems from coordinate conversion drift or state timeout.
