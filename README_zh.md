# 🚀 OpenClaw PSAM - 并行子代理编排器

[![许可协议: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![版本](https://img.shields.io/badge/version-0.2.0-green.svg)](https://github.com/yourusername/openclaw-psam)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-Plugin-orange.svg)](https://openclaw.ai)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

> **将复杂任务分解为并行子代理，智能模型选择，实时进度跟踪**

OpenClaw 插件，用于编排多个 AI 子代理并行处理复杂任务，具备智能模型选择、持久状态跟踪和自动资源管理功能。

---

## ✨ 核心特性

- 🧩 **智能任务分解** - 自动将复杂任务分解为可管理的子任务
- 🎯 **智能模型选择** - 根据任务复杂度和成本选择最优 AI 模型
- 📊 **实时进度跟踪** - 详细状态更新监控所有子代理
- 🔄 **持久状态管理** - 任务状态在系统重启后依然保留
- 📝 **完整活动日志** - JSONL 格式日志用于调试和分析
- 🧹 **自动资源清理** - 自动清理旧任务和进度文件
- ⚙️ **动态配置** - 运行时添加/删除模型和调整设置

---

## 🎯 快速开始

### 安装

1. **进入 OpenClaw 扩展目录：**
```bash
cd ~/.openclaw/extensions
```

2. **克隆或复制插件：**
```bash
git clone https://github.com/yourusername/openclaw-psam.git
# 或者
cp -r /path/to/openclaw-psam ~/.openclaw/extensions/
```

3. **构建插件：**
```bash
cd openclaw-psam
npm install
npm run build
```

4. **重启 OpenClaw：**
```bash
openclaw gateway restart
```

### 第一个编排任务

```javascript
// 让 OpenClaw 编排一个任务
parallel_subagent_orchestrator_orchestrate({
  task_description: "分析第一季度销售数据并生成汇总报告",
  priority: "high",
  subtask_count: 3
})
```

插件将：
1. ✅ 将任务分解为 3 个子任务
2. ✅ 为每个子任务选择最优模型
3. ✅ 返回执行指令
4. ✅ 跟踪所有子代理的进度
5. ✅ 向你报告结果

---

## 📚 文档

### 可用工具

#### 1. 🎬 `parallel_subagent_orchestrator_orchestrate`

创建并启动一个新的多子代理编排任务。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|-----------|------|----------|-------------|
| `task_description` | `string` | ✅ | 清晰的任务描述 |
| `priority` | `string` | ❌ | `high` | `medium` | `low` (默认: medium) |
| `models` | `string` | ❌ | 逗号分隔的特定模型列表 |
| `subtask_count` | `number` | ❌ | 子任务数量: 1-5 (默认: 1) |

**示例：**
```json
{
  "task_description": "研究并总结 2024 年最新 AI 趋势",
  "priority": "high",
  "subtask_count": 4
}
```

**返回：**
- `task_id` - 用于跟踪的唯一标识符
- `subtasks` - 生成的子任务数组
- `spawn_instructions` - 可直接使用的执行命令

---

#### 2. 📊 `parallel_subagent_orchestrator_orchestrate_status`

查询任何编排任务或子任务的当前状态。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|-----------|------|----------|-------------|
| `task` | `string` | ❌ | 按主任务 ID 筛选 |
| `session` | `string` | ❌ | 按子代理会话 ID 筛选 |
| `status_filter` | `string` | ❌ | `pending` | `running` | `completed` | `failed` | `aborted` |

**示例：**
```javascript
// 获取所有任务
{}

// 获取特定任务
{ "task": "task-abc-123" }

// 仅获取运行中的任务
{ "status_filter": "running" }
```

---

#### 3. ⚙️ `parallel_subagent_orchestrator_orchestrate_config`

管理可用于任务编排的 AI 模型。

**操作：** `list` | `add` | `remove` | `replace` | `reset` | `prefer`

**示例：**
```javascript
// 列出所有可用模型
{ "action": "list" }

// 添加新模型
{
  "action": "add",
  "model_id": "anthropic/claude-sonnet-4-5"
}

// 设置模型偏好及说明
{
  "action": "prefer",
  "model_id": "anthropic/claude-sonnet-4-5",
  "note": "最适合复杂推理任务"
}

// 替换整个模型列表
{
  "action": "replace",
  "models": "anthropic/claude-sonnet-4-5,gemini-2.0-flash,gpt-4o-mini"
}

// 重置为默认模型
{ "action": "reset" }
```

---

#### 4. 🛑 `parallel_subagent_orchestrator_orchestrate_abort`

终止特定的子代理会话。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|-----------|------|----------|-------------|
| `session_id` | `string` | ✅ | 要终止的子代理会话 |

---

#### 5. 💉 `parallel_subagent_orchestrator_orchestrate_inject`

向运行中的子代理会话发送消息。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|-----------|------|----------|-------------|
| `session_id` | `string` | ✅ | 目标子代理会话 ID |
| `message` | `string` | ✅ | 要注入的消息内容 |

---

#### 6. 📜 `parallel_subagent_orchestrator_orchestrate_history`

从子代理会话检索消息历史。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|-----------|------|----------|-------------|
| `session_id` | `string` | ✅ | 子代理会话 ID |
| `include_tools` | `boolean` | ❌ | 包含工具调用 (默认: false) |
| `limit` | `number` | ❌ | 返回的最大消息数 (默认: 50) |

---

### 资源管理工具

#### 7. ⏰ `parallel_subagent_orchestrator_check_timeouts`

识别并可选择终止长时间运行的子代理会话。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|-----------|------|----------|-------------|
| `timeout_minutes` | `number` | ❌ | 阈值（分钟），5-1440 (默认: 120) |
| `auto_abort` | `boolean` | ❌ | 自动终止超时会话 (默认: false) |

---

#### 8. 🧹 `parallel_subagent_orchestrator_cleanup`

手动清理旧任务、进度文件和僵尸会话检测。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|-----------|------|----------|-------------|
| `older_than_days` | `number` | ❌ | 删除超过 N 天的任务 (默认: 7) |
| `include_completed` | `boolean` | ❌ | 清理已完成的进度文件 (默认: true) |
| `report_only` | `boolean` | ❌ | 仅预览不执行清理 (默认: false) |

---

## 🎯 默认模型

| 模型 | 速度 | 成本 | 上下文 | 最适合 |
|-------|--------|-------|----------|------------|
| `anthropic/claude-sonnet-4-5` | 中等 | 中等 | 200K | 复杂推理、分析 |
| `anthropic/claude-haiku-4-5` | 快 | 低 | 200K | 快速任务、摘要 |
| `gemini-2.0-flash` | 很快 | 很低 | 1M | 大批量并行任务 |
| `gemini-2.0-pro` | 中等 | 中等 | 2M | 高级推理、编码 |

---

## 📂 文件结构

```
openclaw-psam/
├── state/
│   └── tasks.json           # 持久任务状态
├── logs/
│   └── task_activity.jsonl   # 活动日志 (JSONL 格式)
├── models.json               # 模型能力配置
├── config.json              # 插件设置 (可选)
├── index.ts                 # 主插件代码
└── package.json
```

---

## ⚙️ 配置

在插件目录中创建 `config.json` 来自定义行为：

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

**设置说明：**

| 设置 | 类型 | 默认值 | 说明 |
|---------|------|----------|-------------|
| `enableAutoCleanup` | boolean | `true` | 启用定期资源清理 |
| `cleanupIntervalMs` | number | `21600000` | 清理间隔（6 小时） |
| `sessionTimeoutMs` | number | `7200000` | 会话超时（2 小时） |
| `autoAbortTimeout` | boolean | `false` | 自动终止超时会话 |
| `wecomSenderSkillName` | string | `"wecom-sender"` | 通知技能 |
| `monitoringAgentModel` | string | `"gemini-2.0-flash"` | 状态报告模型 |

---

## 🔄 进度报告

子代理使用 `sessions_send` 工具报告进度，采用格式化消息：

**格式：** `[PSAM-PROGRESS] 子任务-id | 步骤 N/M | 描述`

**示例：**
```
[PSAM-PROGRESS] sub-abc-123 | 步骤 2/5 | 正在分析用户数据...
[PSAM-PROGRESS] sub-abc-123 | 步骤 4/5 | 正在生成可视化...
[PSAM-COMPLETE] sub-abc-123 | 结果: 分析完成，发现 3 个洞察
[PSAM-FAILED] sub-xyz-789 | 原因: 数据源不可用
```

---

## 📖 使用示例

### 示例 1：研究任务

```javascript
parallel_subagent_orchestrator_orchestrate({
  task_description: "研究前 10 个 AI 框架并创建对比表",
  priority: "medium",
  subtask_count: 5
})
```

### 示例 2：代码分析

```javascript
parallel_subagent_orchestrator_orchestrate({
  task_description: "分析代码库的安全漏洞",
  priority: "high",
  models: "anthropic/claude-sonnet-4-5"
})
```

### 示例 3：多语言翻译

```javascript
parallel_subagent_orchestrator_orchestrate({
  task_description: "将文档翻译为西班牙语、法语和德语",
  subtask_count: 3,
  priority: "low"
})
```

---

## ⚠️ 架构说明

### 插件 SDK 限制

由于 SDK 架构限制，OpenClaw 插件无法直接调用其他工具。编排工具返回的 spawn 指令必须由代理手动执行。

**工作流程：**
```
1. 调用 orchestrate → 获取任务计划 + spawn 指令
2. 使用 sessions_spawn → 执行子任务
3. 调用 orchestrate_status → 跟踪进度
```

这是设计使然 - 插件遵循"接收参数 → 返回结果"的模式，无副作用。

---

## 🐛 错误处理

| 错误 | 原因 | 解决方案 |
|--------|--------|------------|
| `API_UNAVAILABLE` | 内部工具不可用 | 手动使用返回的 spawn 指令 |
| `NO_MODEL_AVAILABLE` | 无匹配模型 | 通过配置添加模型或在请求中指定 |
| `SESSION_NOT_FOUND` | 无效的会话 ID | 在状态查询中检查会话 ID |
| `SESSION_NOT_RUNNING` | 会话已结束 | 无需操作 |

---

## 📊 版本历史

- **v0.2.0** (2026-02-14)
  - ✨ 项目重命名为 `openclaw-psam`
  - ✨ 更新所有配置和路径
  - ✨ 增强文档和 SEO 优化
  - 📝 改进关键词和主题以提升可发现性

- **v0.1.0**
  - 🎉 首次发布
  - ✅ 注册 6 个核心工具
  - ✅ 任务状态管理
  - ✅ 模型选择和配置
  - ✅ 活动日志 (JSONL)
  - ✅ 资源管理和自动清理

---

## 💻 开发

### 从源码构建

```bash
git clone https://github.com/yourusername/openclaw-psam.git
cd openclaw-psam
npm install
npm run build
```

### 测试

```bash
# 重启 OpenClaw 以加载更改
openclaw gateway restart

# 检查插件成功加载
openclaw doctor
```

### 调试日志

成功加载将显示：
```
[plugins] OpenClaw PSAM Orchestrator plugin loaded
[plugins] Loaded N models from /path/to/models.json
[plugins] All tools registered successfully
```

---

## 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m '添加某个很棒的功能'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

---

## 📄 许可证

本项目采用 MIT 许可证 - 详情请参见 [LICENSE](LICENSE) 文件。

---

## 🔗 关键词

openclaw, openclaw-plugin, psam, 编排器, 子代理, 多代理, 任务管理, 并行, 自动化, ai, 代理, 插件, typescript, 资源管理, 清理



<div align="center">

**如果这个项目对你有帮助，请给它一个 ⭐**

由 OpenClaw 社区用 ❤️ 制作

</div>
