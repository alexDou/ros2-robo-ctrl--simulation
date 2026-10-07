#!/usr/bin/env bash
# Lane contracts: the generated domain types (Python, Rust, TypeScript) match schemas/. Run it first; the
# other lanes build on these contracts.
source "$(dirname "$0")/_lib.sh"
checks() {
  step "codegen --check" python3 scripts/generate_domain.py --check ||
    echo "Codegen drift: edit schemas/ and run 'python3 scripts/generate_domain.py', never the generated files."
}
lane_main contracts checks
