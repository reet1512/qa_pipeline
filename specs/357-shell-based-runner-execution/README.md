---
status: complete
created: 2026-03-06
priority: high
tags:
- sessions
- runners
- cli
- shell-execution
- ux
created_at: 2026-03-06T14:44:05.798717Z
updated_at: 2026-03-07T02:46:12.579293Z
completed_at: 2026-03-07T02:46:12.579293Z
transitions:
- status: in-progress
  at: 2026-03-07T02:29:28.762655Z
- status: complete
  at: 2026-03-07T02:46:12.579293Z
---

# Shell-Based Runner Session Execution

## Overview

### Problem

The current ACP-based session display in the frontend is complex and doesn't provide a great UX for managing runner sessions. The ACP protocol integration (spec 330) introduces significant frontend complexity for streaming, permission dialogs, and structured event rendering — but the primary user need is simpler: **run an AI agent CLI with a prompt and see the results**.

Most AI coding agents (Copilot, Claude Code, Gemini CLI, etc.) already have excellent terminal UIs. Rather than reimplementing their UX in our frontend, we should leverage their native CLI experience.

### Solution

Implement shell-based execution for runner sessions using direct CLI invocation patterns like:

```bash
copilot --prompt "implement feature X" --allow-all
claude --print "implement feature X" --dangerously-skip-permissions
gemini "implement feature X"
```

Instead of managing ACP streams in the browser, LeanSpec should:
1. Compose the full shell command with the resolved prompt
2. Execute it in the user's terminal (or a managed shell)
3. Capture and display the output as plain logs
4. Track session lifecycle (started, running, completed, failed)

### Scope

**In Scope**:
- Shell command composition using runner registry definitions (`command`, `args`, `prompt_flag`)
- Direct terminal execution (subprocess spawn, no ACP handshake)
- Prompt injection via runner-specific flags (e.g., `--prompt`, `--print`, positional arg)
- Log capture from stdout/stderr
- Session status tracking
- CLI command for quick session execution: `lean-spec run --runner copilot -p "prompt"`
- Copy-to-clipboard of composed command for manual execution

**Out of Scope**:
- ACP protocol integration (leave as-is, don't remove)
- Frontend session streaming UI redesign
- Interactive terminal embedding in browser
- Permission/HITL flows (handled by the runner's own CLI)

## Design

### Command Composition

Use the existing `RunnerDefinition` fields to compose the shell command:

```
{command} {args...} {prompt_flag} "{resolved_prompt}"
```

Examples with current runner definitions:
- **Copilot**: `copilot --allow-all --prompt "implement the following specs: ..."`
- **Claude**: `claude --dangerously-skip-permissions --print "implement the following specs: ..."`
- **Gemini**: `gemini "implement the following specs: ..."`
- **Codex**: `codex "implement the following specs: ..."`

The `prompt_flag` field in `runners.json` already controls this:
- `"--prompt"` → `copilot --prompt "..."`
- `"--print"` → `claude --print "..."`
- `null` → positional argument: `codex "..."`
- `"-"` → suppress prompt injection

### Execution Modes

1. **Direct execution** (default): Spawn subprocess, capture output, track status
2. **Dry-run / Copy**: Compose the command string and copy to clipboard or display for manual execution
3. **Terminal passthrough**: Open in user's terminal for full interactive experience

### CLI Integration

```bash
# Quick run with inline prompt
lean-spec run -p "add error handling to auth module"

# Run with specific runner
lean-spec run --runner copilot -p "fix the login bug"

# Run with spec context
lean-spec run --spec 337 --runner claude

# Dry-run: show the command without executing
lean-spec run --runner copilot -p "add tests" --dry-run

# Use default runner from config
lean-spec run -p "refactor the database layer"
```

### Backend Changes

- Add `shell` execution mode alongside existing `acp` mode
- When mode is `shell`, skip ACP handshake and use simple subprocess spawn
- The `build_command` method on `RunnerDefinition` already produces the right command — just ensure prompt is injected via the correct flag
- Simplify log handling: plain stdout/stderr capture without ACP event parsing

### Runner Protocol Detection

Extend the existing `infer_runner_protocol()` to support a `shell` protocol:
- Default all runners to `shell` protocol
- Only use `acp` when explicitly configured or when `--acp` flag is requested
- Allow per-runner protocol override in `runners.json`

## Requirements

- [x] `lean-spec run` CLI command with `-p` flag for inline prompts
- [x] `--runner` flag to select runner (falls back to default)
- [x] `--spec` flag to attach spec context (uses `build_context_prompt`)
- [x] `--dry-run` flag to display composed command without executing
- [x] Shell execution uses `prompt_flag` from runner definition
- [x] stdout/stderr captured and stored as session logs
- [x] Session lifecycle tracked (created → running → completed/failed)
- [x] Exit code determines session status (0 = completed, non-zero = failed)
- [x] Model override via `--model` flag passed to runner if supported

## Non-Goals

- No removal or deprecation of ACP protocol support
- No frontend UI changes in this spec
- No interactive terminal embedding
- No real-time streaming to browser (logs captured post-completion)

## Technical Notes

### Key Files
- `rust/leanspec-core/src/sessions/runner.rs` — `RunnerDefinition`, `build_command()`, `prompt_flag`
- `rust/leanspec-core/src/sessions/manager/lifecycle.rs` — `start_session()`, `build_context_prompt()`
- `rust/leanspec-cli/src/commands/session.rs` — CLI session commands
- `schemas/runners.json` — runner schema with `prompt_flag` field

### Existing Infrastructure
- `RunnerDefinition.build_command()` already composes the command with args
- `build_context_prompt()` already resolves spec content into a prompt string
- `prompt_flag` field already exists in the runner schema and definitions
- `RunnerRegistry` already handles loading and merging runner configs

## Acceptance Criteria

- [x] `lean-spec run -p "prompt"` executes the default runner with the given prompt
- [x] `lean-spec run --runner copilot -p "prompt"` uses the specified runner
- [x] `lean-spec run --spec 337` resolves spec content as the prompt
- [x] `lean-spec run --dry-run` prints the composed command without executing
- [x] Session is created and tracked in the database with correct status
- [x] Runner output (stdout/stderr) is captured in session logs
- [x] Works with all built-in runners (copilot, claude, gemini, codex, opencode)

## Progress Verification - 2026-03-07

Verified against implementation and test execution.

Completed:
- Added top-level `lean-spec run` with `-p`, `--runner`, `--spec`, `--dry-run`, `--model`, and `--acp` support.
- Default runner sessions now resolve to shell protocol unless a runner or invocation explicitly selects ACP.
- Dry-run prints the composed command using runner `prompt_flag` and model override handling.
- Session creation persists selected protocol/model metadata and execution continues to capture stdout/stderr logs with exit-code-based status.
- Added Rust unit/integration coverage for protocol resolution, command previewing, model arg injection, top-level run flows, dry-run output, and spec-context prompts.

Validation:
- `cargo test --manifest-path rust/Cargo.toml -p leanspec-core --features 'sessions storage' --quiet`
- `cargo test --manifest-path rust/Cargo.toml -p leanspec-cli --test session --quiet`
- `pnpm typecheck`