# Tool Params — Strict

Never pass a parameter not in tool schema. Past failure: `AbsolutePath` sent to tools that do not define it. Every such call fails validation.

Exact per-tool params:
- `view_file` -> `AbsolutePath` (+ `StartLine`/`EndLine`/`ContentOffset`).
- `write_to_file` -> `TargetFile` (never `AbsolutePath`), `CodeContent`, `Description`, `toolSummary`, `toolAction` (+ `Overwrite`/`Append`).
- `replace_file_content` -> `TargetFile` (never `AbsolutePath`), `StartLine`, `EndLine`, `TargetContent`, `ReplacementContent`, `Instruction`, `Description`, `toolSummary`, `toolAction`.
- `run_command` -> `CommandLine`, `Cwd`, `WaitMsBeforeAsync`, `toolSummary`, `toolAction` (+ `RunPersistent`/`RequestedTerminalID`/`IsDaemon`). Never `AbsolutePath`.
- `call_mcp_tool` -> `ServerName`, `ToolName`, `Arguments`, `toolSummary`, `toolAction`. Payload inside `Arguments`. Never `AbsolutePath`/`code`/`language` top-level.
- `manage_task` -> `Action`, `toolSummary`, `toolAction` (+ `TaskId`/`Input`). Never `AbsolutePath`.
- `schedule` -> `Prompt`, `toolSummary`, `toolAction` (+ `DurationSeconds`/`CronExpression`/`TimerCondition`). Never `AbsolutePath`.

Before each call, verify names against list. When in doubt re-read schema or prior good call. Violation = stop, re-read this file, retry.
