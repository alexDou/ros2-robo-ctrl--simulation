# Codebase Organization & Directory Structure

Enforce clean separation of concerns and uniform directory layout across all tiers:

1. **Tests Folder**:
   - All tests MUST live in designated `tests/` directories.
   - Never colocate test files (`*.test.ts`, `*_test.rs`, `test_*.py`) next to source implementation files.
   - Python: `tests/`
   - Rust: `src/gateway/tests/`
   - Web: `web/tests/` (with `web/tests/unit/` and `web/tests/e2e/`).

2. **Utils Folder**:
   - Shared helper functions, environment checks (`isBrowser`), and URL parameter parsers (`getParam`, `getAllParams`) MUST reside in `utils/` (e.g. `web/src/utils/`).

3. **Components Folder**:
   - User interface components and views MUST reside in `components/` (e.g. `web/src/components/`).
