# 🚀 OpenClaw PSAM - Parallel Sub-Agent Orchestrator

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-0.2.0-green.svg)](https://github.com/yourusername/openclaw-psam)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-Plugin-orange.svg)](https://openclaw.ai)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

> **Break down complex tasks into parallel sub-agents with intelligent model selection and real-time progress tracking**

An OpenClaw plugin that orchestrates multiple AI sub-agents to work on complex tasks in parallel, with smart model selection, persistent state tracking, and automated resource management.

---

## ✨ Key Features

- 🧩 **Intelligent Task Decomposition** - Automatically break down complex tasks into manageable subtasks
- 🎯 **Smart Model Selection** - Choose optimal AI models based on task complexity and cost
- 📊 **Real-time Progress Tracking** - Monitor all sub-agents with detailed status updates
- 🔄 **Persistent State Management** - Task states survive system restarts
- 📝 **Complete Activity Logging** - JSONL format logs for debugging and analysis
- 🧹 **Auto Resource Cleanup** - Automatic cleanup of old tasks and progress files
- ⚙️ **Dynamic Configuration** - Add/remove models and adjust settings at runtime

---

## 🎯 Quick Start

### Installation

1. **Navigate to your OpenClaw extensions directory:**
```bash
cd ~/.openclaw/extensions
```

2. **Clone or copy the plugin:**
```bash
git clone https://github.com/yourusername/openclaw-psam.git
# or
cp -r /path/to/openclaw-psam ~/.openclaw/extensions/
```

3. **Build the plugin:**
```bash
cd openclaw-psam
npm install
npm run build
```

4. **Restart OpenClaw:**
```bash
openclaw gateway restart
```

### Your First Orchestrated Task

```javascript
// Ask OpenClaw to orchestrate a task
parallel_subagent_orchestrator_orchestrate({
  task_description: "Analyze the Q1 sales data and create summary reports",
  priority: "high",
  subtask_count: 3
})
```

The plugin will:
1. ✅ Break down the task into 3 subtasks
2. ✅ Select optimal models for each subtask
3. ✅ Return execution instructions
4. ✅ Track progress of all sub-agents
5. ✅ Report results back to you

---

## 📚 Documentation

### Available Tools

#### 1. 🎬 `parallel_subagent_orchestrator_orchestrate`

Create and launch a new orchestrated task with multiple sub-agents.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_description` | `string` | ✅ | Clear description of what needs to be done |
| `priority` | `string` | ❌ | `high` | `medium` | `low` (default: medium) |
| `models` | `string` | ❌ | Comma-separated list of specific models to use |
| `subtask_count` | `number` | ❌ | Number of subtasks: 1-5 (default: 1) |

**Example:**
```json
{
  "task_description": "Research and summarize latest AI trends in 2024",
  "priority": "high",
  "subtask_count": 4
}
```

**Returns:**
- `task_id` - Unique identifier for tracking
- `subtasks` - Array of generated subtasks
- `spawn_instructions` - Ready-to-use execution commands

---

#### 2. 📊 `parallel_subagent_orchestrator_orchestrate_status`

Query the current status of any orchestrated task or subtask.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | `string` | ❌ | Filter by main task ID |
| `session` | `string` | ❌ | Filter by sub-agent session ID |
| `status_filter` | `string` | ❌ | `pending` | `running` | `completed` | `failed` | `aborted` |

**Examples:**
```javascript
// Get all tasks
{}

// Get specific task
{ "task": "task-abc-123" }

// Get only running tasks
{ "status_filter": "running" }
```

---

#### 3. ⚙️ `parallel_subagent_orchestrator_orchestrate_config`

Manage available AI models for task orchestration.

**Actions:** `list` | `add` | `remove` | `replace` | `reset` | `prefer`

**Examples:**
```javascript
// List all available models
{ "action": "list" }

// Add a new model
{
  "action": "add",
  "model_id": "anthropic/claude-sonnet-4-5"
}

// Set model preference with note
{
  "action": "prefer",
  "model_id": "anthropic/claude-sonnet-4-5",
  "note": "Best for complex reasoning tasks"
}

// Replace entire model list
{
  "action": "replace",
  "models": "anthropic/claude-sonnet-4-5,gemini-2.0-flash,gpt-4o-mini"
}

// Reset to default models
{ "action": "reset" }
```

---

#### 4. 🛑 `parallel_subagent_orchestrator_orchestrate_abort`

Terminate a specific sub-agent session.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | `string` | ✅ | The sub-agent session to terminate |

---

#### 5. 💉 `parallel_subagent_orchestrator_orchestrate_inject`

Send a message to a running sub-agent session.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | `string` | ✅ | Target sub-agent session ID |
| `message` | `string` | ✅ | Message content to inject |

---

#### 6. 📜 `parallel_subagent_orchestrator_orchestrate_history`

Retrieve message history from a sub-agent session.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | `string` | ✅ | Sub-agent session ID |
| `include_tools` | `boolean` | ❌ | Include tool calls (default: false) |
| `limit` | `number` | ❌ | Max messages to return (default: 50) |

---

### Resource Management Tools

#### 7. ⏰ `parallel_subagent_orchestrator_check_timeouts`

Identify and optionally abort long-running sub-agent sessions.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `timeout_minutes` | `number` | ❌ | Threshold in minutes, 5-1440 (default: 120) |
| `auto_abort` | `boolean` | ❌ | Auto-abort timed-out sessions (default: false) |

---

#### 8. 🧹 `parallel_subagent_orchestrator_cleanup`

Manual cleanup of old tasks, progress files, and zombie session detection.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `older_than_days` | `number` | ❌ | Delete tasks older than N days (default: 7) |
| `include_completed` | `boolean` | ❌ | Clean completed progress files (default: true) |
| `report_only` | `boolean` | ❌ | Preview without cleanup (default: false) |

---

## 🎯 Default Models

| Model | Speed | Cost | Context | Best For |
|-------|--------|-------|----------|------------|
| `anthropic/claude-sonnet-4-5` | Medium | Medium | 200K | Complex reasoning, analysis |
| `anthropic/claude-haiku-4-5` | Fast | Low | 200K | Quick tasks, summaries |
| `gemini-2.0-flash` | Very Fast | Very Low | 1M | High-volume parallel tasks |
| `gemini-2.0-pro` | Medium | Medium | 2M | Advanced reasoning, coding |

---

## 📂 File Structure

```
openclaw-psam/
├── state/
│   └── tasks.json           # Persistent task state
├── logs/
│   └── task_activity.jsonl   # Activity log (JSONL format)
├── models.json               # Model capabilities config
├── config.json              # Plugin settings (optional)
├── index.ts                 # Main plugin code
└── package.json
```

---

## ⚙️ Configuration

Create `config.json` in the plugin directory to customize behavior:

```json
{
  "enableAutoCleanup": true,
  "cleanupIntervalMs": 21600000,
  "sessionTimeoutMs": 7200000,
  "autoAbortTimeout": false,
  "wecomSenderSkillName": "wecom-sender",
  "monitoringAgentModel": "gemini-2.0-flash"
}
```

**Settings:**

| Setting | Type | Default | Description |
|---------|------|----------|-------------|
| `enableAutoCleanup` | boolean | `true` | Enable periodic resource cleanup |
| `cleanupIntervalMs` | number | `21600000` | Cleanup interval (6 hours) |
| `sessionTimeoutMs` | number | `7200000` | Session timeout (2 hours) |
| `autoAbortTimeout` | boolean | `false` | Auto-abort timed-out sessions |
| `wecomSenderSkillName` | string | `"wecom-sender"` | Skill for notifications |
| `monitoringAgentModel` | string | `"gemini-2.0-flash"` | Model for status reports |

---

## 🔄 Progress Reporting

Sub-agents report progress using the `sessions_send` tool with formatted messages:

**Format:** `[PSAM-PROGRESS] subtask-id | Step N/M | Description`

**Examples:**
```
[PSAM-PROGRESS] sub-abc-123 | Step 2/5 | Analyzing user data...
[PSAM-PROGRESS] sub-abc-123 | Step 4/5 | Generating visualizations...
[PSAM-COMPLETE] sub-abc-123 | Result: Analysis complete, 3 insights found
[PSAM-FAILED] sub-xyz-789 | Reason: Data source unavailable
```

---

## 📖 Usage Examples

### Example 1: Research Task

```javascript
parallel_subagent_orchestrator_orchestrate({
  task_description: "Research top 10 AI frameworks and create comparison table",
  priority: "medium",
  subtask_count: 5
})
```

### Example 2: Code Analysis

```javascript
parallel_subagent_orchestrator_orchestrate({
  task_description: "Analyze codebase for security vulnerabilities",
  priority: "high",
  models: "anthropic/claude-sonnet-4-5"
})
```

### Example 3: Multi-Language Translation

```javascript
parallel_subagent_orchestrator_orchestrate({
  task_description: "Translate documentation to Spanish, French, and German",
  subtask_count: 3,
  priority: "low"
})
```

---

## ⚠️ Architecture Notes

### Plugin SDK Limitations

OpenClaw plugins cannot directly call other tools due to SDK architecture. The orchestrate tool returns spawn instructions that must be executed manually by the agent.

**Workflow:**
```
1. Call orchestrate → Get task plan + spawn instructions
2. Use sessions_spawn → Execute subtasks
3. Call orchestrate_status → Track progress
```

This is by design - plugins follow a "receive parameters → return results" pattern without side effects.

---

## 🐛 Error Handling

| Error | Cause | Solution |
|--------|--------|------------|
| `API_UNAVAILABLE` | Internal tools unavailable | Use returned spawn instructions manually |
| `NO_MODEL_AVAILABLE` | No matching models | Add model via config or specify in request |
| `SESSION_NOT_FOUND` | Invalid session ID | Check session ID in status query |
| `SESSION_NOT_RUNNING` | Session already ended | No action needed |

---

## 📊 Version History

- **v0.2.0** (2026-02-14)
  - ✨ Project renamed to `openclaw-psam`
  - ✨ Updated all configurations and paths
  - ✨ Enhanced documentation with SEO optimization
  - 📝 Improved keywords and topics for discoverability

- **v0.1.0**
  - 🎉 Initial release
  - ✅ 6 core tools registered
  - ✅ Task state management
  - ✅ Model selection and configuration
  - ✅ Activity logging (JSONL)
  - ✅ Resource management and auto-cleanup

---

## 💻 Development

### Build from Source

```bash
git clone https://github.com/yourusername/openclaw-psam.git
cd openclaw-psam
npm install
npm run build
```

### Testing

```bash
# Restart OpenClaw to load changes
openclaw gateway restart

# Check plugin loaded successfully
openclaw doctor
```

### Debug Logs

Successful loading shows:
```
[plugins] OpenClaw PSAM Orchestrator plugin loaded
[plugins] Loaded N models from /path/to/models.json
[plugins] All tools registered successfully
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🔗 Keywords

openclaw, openclaw-plugin, psam, orchestrator, subagent, multi-agent, task-management, parallel, automation, ai, agents, plugin, typescript, resource-management, cleanup

---

## 📞 Support

- 📧 Issues: [GitHub Issues](https://github.com/yourusername/openclaw-psam/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/yourusername/openclaw-psam/discussions)
- 📖 Docs: [Full Documentation](https://github.com/yourusername/openclaw-psam/wiki)

---

<div align="center">

**⭐ Star this repo if it helped you!**

Made with ❤️ by the OpenClaw community

</div>
