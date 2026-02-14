# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-14

### Added

#### Resource Management
- **Automatic cleanup mechanism**: Added periodic cleanup of old task records (default: >7 days) and completed progress files
  - Cleanup interval: 6 hours (configurable)
  - Zero token consumption: Only writes to local logs
  - Configurable via `config.json`

- **Session timeout detection**: New tool `parallel_subagent_orchestrator_check_timeouts`
  - Detects sub-agent sessions running longer than threshold (default: 2 hours)
  - Default: report only (safety-first)
  - Optional auto-abort mode

- **Manual cleanup tool**: New tool `parallel_subagent_orchestrator_cleanup`
  - Clean old task records by time window
  - Clean completed/failed/aborted progress files
  - Detect zombie sessions (running but no progress)
  - Report-only mode for safe preview

- **Session-end progress cleanup**: Automatically delete progress files when sessions end
  - Prevents progress file accumulation
  - Fail-safe error handling

#### Configuration
- **New config fields**:
  - `enableAutoCleanup` (boolean): Enable automatic cleanup (default: true)
  - `cleanupIntervalMs` (number): Cleanup interval in milliseconds (default: 6 hours)
  - `sessionTimeoutMs` (number): Session timeout threshold (default: 2 hours)
  - `autoAbortTimeout` (boolean): Auto-abort timeout sessions (default: false, report-only)

- **Config file support**: Optional `config.json` to override defaults

#### Documentation
- Updated README with new resource management features
- Configuration examples and usage documentation
- Testing summary document created

### Changed

#### TaskStateManager
- Enhanced `deleteOldTasks()`: Now returns count of deleted tasks
  - Added operation duration logging
  - Added state file backup before deletion (>10 tasks)

- Added `getTimeoutSubtasks()` method: Detects running subtasks exceeding timeout threshold

#### ProgressManager
- Enhanced `cleanupCompletedProgress()`: Now returns count of cleaned files
  - Added JSON validation and error handling
  - Added detailed cleanup logging
  - Skip corrupted files with warnings

### Fixed

- Fixed API logger warnings: Corrected parameter counts in error logging
- Removed unload event handler (not supported in current OpenClaw version)
- Enhanced error isolation for all cleanup operations

### Security

- **Safety-first defaults**: Auto-abort disabled by default (report-only)
- **Backup before deletion**: State files backed up when deleting >10 tasks
- **Validation**: All parameters validated before processing
- **Error isolation**: Cleanup failures don't affect plugin functionality

### Performance

- **Zero token waste**: Automatic cleanup only writes local logs
- **Lightweight operations**: Each cleanup < 100ms
- **6-hour interval**: Balances promptness and resource usage

## [0.1.0] - Previous Releases

### Core Features
- Task decomposition and parallel sub-agent execution
- Intelligent model selection based on task difficulty and cost
- Transparent progress monitoring and reporting
- Message injection and history tracking
- Session binding and management

### Tools
- `parallel_subagent_orchestrator_orchestrate`: Create and manage orchestration tasks
- `parallel_subagent_orchestrator_orchestrate_status`: Query task and sub-task status
- `parallel_subagent_orchestrator_orchestrate_bind_session`: Bind sub-agent session to main task
- `parallel_subagent_orchestrator_orchestrate_inject`: Inject messages into sub-agent sessions
- `parallel_subagent_orchestrator_orchestrate_history`: Get session history
- `parallel_subagent_orchestrator_orchestrate_config`: Manage available models

### Architecture
- TaskStateManager: Persistent task state management
- ProgressManager: Real-time progress file tracking
- ActivityLogger: Comprehensive activity logging (JSONL format)
- ModelSelector: Intelligent model selection
- API Capability Detector: Feature detection for safety
