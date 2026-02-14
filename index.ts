/**
 * Parallel Sub-Agent Orchestrator Plugin
 *
 * Provides intelligent task decomposition, parallel sub-agent execution,
 * model selection, and progress monitoring capabilities.
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Type Definitions
// ============================================================================

/** Model capability configuration */
interface ModelConfig {
  id: string;
  capabilities: {
    speed: 'very_fast' | 'fast' | 'medium' | 'slow';
    cost: 'very_low' | 'low' | 'medium' | 'high';
    context_length: 'short' | 'medium' | 'long';
    reasoning: 'basic' | 'medium' | 'advanced' | 'complex';
    [key: string]: any;
  };
}

/** Main task status */
interface MainTask {
  id: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  createdAt: number;
  subTasks: SubTask[];
  completedAt?: number;
  error?: string;
}

/** Sub-task status */
interface SubTask {
  id: string;
  mainTaskId: string;
  childSessionId?: string;
  modelId?: string;
  taskDescription: string;
  rolePrompt: string;
  stepsToExecute: string[];
  currentStepIndex: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted' | 'frozen';
  startTime?: number;
  endTime?: number;
  estimatedDuration?: number;
  actualDuration?: number;
  errorLog?: string;
  expectedOutcome: string;
}

/** Task state storage */
interface TaskState {
  tasks: MainTask[];
  version: string;
  lastUpdated: number;
}

/** Activity log entry */
interface ActivityLogEntry {
  timestamp: number;
  timestamp_iso: string;
  event_type: 'task_dispatched' | 'subagent_spawned' | 'subagent_completed' | 'subagent_failed' | 'subagent_aborted' | 'message_injected' | 'error';
  task_id?: string;
  sub_task_id?: string;
  child_session_id?: string;
  assigned_model?: string;
  priority?: string;
  status?: string;
  message?: string;
  error?: string;
  [key: string]: any;
}

/** Plugin configuration */
interface OrchestratorConfig {
  wecomSenderSkillName: string;
  monitoringAgentModel: string;
  logsPath: string;
  modelsConfigPath: string;
  statePath: string;
  progressPath: string;  // Temporary directory for progress files

  // Auto-cleanup configuration
  enableAutoCleanup: boolean;        // Enable automatic cleanup (default: true)
  cleanupIntervalMs: number;         // Cleanup interval (default: 6 hours)
  sessionTimeoutMs: number;         // Session timeout threshold (default: 2 hours)
  autoAbortTimeout: boolean;         // Auto-abort timed out sessions (default: false)
}

/** Progress report file format */
interface ProgressReport {
  subTaskId: string;
  mainTaskId: string;
  currentStep: number;
  totalSteps: number;
  status: 'in_progress' | 'completed' | 'failed' | 'aborted';
  message: string;
  timestamp: number;
  percentage: number;
}

/** API capabilities detection result */
interface ApiCapabilities {
  sessions_spawn: boolean;
  sessions_send: boolean;
  sessions_history: boolean;
  process_kill: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: OrchestratorConfig = {
  wecomSenderSkillName: "wecom-sender",
  monitoringAgentModel: "gemini-2.0-flash",
  logsPath: "/home/ryan/.openclaw/extensions/openclaw-psam/logs",
  modelsConfigPath: "/home/ryan/.openclaw/extensions/openclaw-psam/models.json",
  statePath: "/home/ryan/.openclaw/extensions/openclaw-psam/state",
  progressPath: "/tmp/psam-progress",

  // Auto-cleanup configuration defaults
  enableAutoCleanup: true,
  cleanupIntervalMs: 6 * 60 * 60 * 1000,  // 6 hours
  sessionTimeoutMs: 2 * 60 * 60 * 1000,  // 2 hours
  autoAbortTimeout: false
};

const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: "anthropic/claude-sonnet-4-5",
    capabilities: {
      speed: "medium",
      cost: "medium",
      context_length: "long",
      reasoning: "advanced"
    }
  },
  {
    id: "anthropic/claude-haiku-4-5",
    capabilities: {
      speed: "fast",
      cost: "low",
      context_length: "medium",
      reasoning: "medium"
    }
  },
  {
    id: "gemini-2.0-flash",
    capabilities: {
      speed: "very_fast",
      cost: "very_low",
      context_length: "medium",
      reasoning: "medium"
    }
  },
  {
    id: "gemini-2.0-pro",
    capabilities: {
      speed: "medium",
      cost: "medium",
      context_length: "long",
      reasoning: "advanced"
    }
  }
];

// ============================================================================
// Task State Manager
// ============================================================================

class TaskStateManager {
  private statePath: string;
  private tasksFile: string;
  private state: TaskState;
  private logger: any;

  constructor(statePath: string, logger: any) {
    this.statePath = statePath;
    this.tasksFile = path.join(statePath, 'tasks.json');
    this.logger = logger;
    this.state = { tasks: [], version: '1.0', lastUpdated: Date.now() };
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.tasksFile)) {
        const content = fs.readFileSync(this.tasksFile, 'utf-8');
        this.state = JSON.parse(content);
        this.logger.info(`Loaded ${this.state.tasks.length} tasks from ${this.tasksFile}`);
      }
    } catch (error) {
      this.logger.error(`Failed to load tasks from ${this.tasksFile}:`, error);
      this.state = { tasks: [], version: '1.0', lastUpdated: Date.now() };
    }
  }

  private async save(): Promise<void> {
    try {
      // Ensure directory exists
      if (!fs.existsSync(this.statePath)) {
        fs.mkdirSync(this.statePath, { recursive: true });
      }

      // Atomic write: write to temp file, then rename
      const tempFile = `${this.tasksFile}.tmp`;
      this.state.lastUpdated = Date.now();
      fs.writeFileSync(tempFile, JSON.stringify(this.state, null, 2));
      fs.renameSync(tempFile, this.tasksFile);
      this.logger.debug(`Saved ${this.state.tasks.length} tasks to ${this.tasksFile}`);
    } catch (error) {
      this.logger.error(`Failed to save tasks to ${this.tasksFile}:`, error);
      throw error;
    }
  }

  createMainTask(description: string, priority: 'high' | 'medium' | 'low' = 'medium'): MainTask {
    const task: MainTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description,
      priority,
      status: 'pending',
      createdAt: Date.now(),
      subTasks: []
    };
    this.state.tasks.push(task);
    this.save();
    return task;
  }

  createSubTask(mainTaskId: string, taskDescription: string, rolePrompt: string, stepsToExecute: string[], expectedOutcome: string): SubTask | null {
    const mainTask = this.state.tasks.find(t => t.id === mainTaskId);
    if (!mainTask) return null;

    const subTask: SubTask = {
      id: `${mainTaskId}-sub-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      mainTaskId,
      taskDescription,
      rolePrompt,
      stepsToExecute,
      currentStepIndex: 0,
      status: 'pending',
      expectedOutcome
    };

    mainTask.subTasks.push(subTask);
    this.save();
    return subTask;
  }

  updateSubTaskStatus(subTaskId: string, status: SubTask['status'], updates: Partial<SubTask> = {}): boolean {
    for (const mainTask of this.state.tasks) {
      const subTask = mainTask.subTasks.find(st => st.id === subTaskId);
      if (subTask) {
        subTask.status = status;
        Object.assign(subTask, updates);

        // Update main task status if all sub-tasks are done
        const allDone = mainTask.subTasks.every(st =>
          st.status === 'completed' || st.status === 'failed' || st.status === 'aborted'
        );
        const anyFailed = mainTask.subTasks.some(st => st.status === 'failed');
        const anyAborted = mainTask.subTasks.some(st => st.status === 'aborted');

        if (allDone) {
          mainTask.status = anyFailed ? 'failed' : (anyAborted ? 'aborted' : 'completed');
          mainTask.completedAt = Date.now();
        }

        this.save();
        return true;
      }
    }
    return false;
  }

  getTask(taskId: string): MainTask | null {
    return this.state.tasks.find(t => t.id === taskId) || null;
  }

  getAllTasks(): MainTask[] {
    return this.state.tasks;
  }

  getTaskBySessionId(sessionId: string): { mainTask: MainTask; subTask: SubTask } | null {
    for (const mainTask of this.state.tasks) {
      // Support two matching formats:
      // 1. Full format: agent:main:subagent:xxx
      // 2. Short ID: xxx
      const subTask = mainTask.subTasks.find(st => {
        if (!st.childSessionId) return false;
        // Exact match
        if (st.childSessionId === sessionId) return true;
        // Check if contains short ID (sessionKey format: agent:xxx:subagent:uuid)
        if (st.childSessionId.includes(sessionId)) return true;
        // Reverse: if stored as short ID, check if it's included in sessionKey
        if (sessionId.includes(st.childSessionId)) return true;
        return false;
      });
      if (subTask) {
        return { mainTask, subTask };
      }
    }
    return null;
  }

  deleteOldTasks(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
    const startTime = Date.now();
    const cutoff = Date.now() - maxAge;
    const before = this.state.tasks.length;
    this.state.tasks = this.state.tasks.filter(t => t.createdAt > cutoff);
    const removed = before - this.state.tasks.length;

    if (removed > 0) {
      // Backup state file (only when deletion count > 10)
      if (removed > 10) {
        try {
          const backupFile = `${this.tasksFile}.backup`;
          fs.writeFileSync(backupFile, fs.readFileSync(this.tasksFile));
          this.logger.info(`Backup created: ${backupFile}`);
        } catch (backupError) {
          this.logger.warn(`Failed to create backup: ${backupError}`);
        }
      }

      this.save();
      const duration = Date.now() - startTime;
      this.logger.info(`Removed ${removed} old tasks, ${before - removed} preserved (older than ${maxAge / (24 * 60 * 60 * 1000)} days, ${duration}ms)`);
    }

    return removed;  // Return deletion count
  }

  /**
   * Find timed out running sub-tasks
   * @param timeoutMs Timeout threshold in milliseconds
   * @returns List of timed out sub-tasks
   */
  getTimeoutSubtasks(timeoutMs: number): Array<{ mainTask: MainTask; subTask: SubTask }> {
    const now = Date.now();
    const timeouts: Array<{ mainTask: MainTask; subTask: SubTask }> = [];

    for (const mainTask of this.state.tasks) {
      for (const subTask of mainTask.subTasks) {
        if (subTask.status === 'running' && subTask.startTime) {
          const elapsed = now - subTask.startTime;
          if (elapsed > timeoutMs) {
            timeouts.push({ mainTask, subTask });
          }
        }
      }
    }

    return timeouts;
  }
}

// ============================================================================
// Model Selector
// ============================================================================

class ModelSelector {
  private models: ModelConfig[];
  private modelsConfigPath: string;
  private logger: any;

  constructor(modelsConfigPath: string, logger: any) {
    this.modelsConfigPath = modelsConfigPath;
    this.logger = logger;
    this.models = [];
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.modelsConfigPath)) {
        const content = fs.readFileSync(this.modelsConfigPath, 'utf-8');
        this.models = JSON.parse(content);
        this.logger.info(`Loaded ${this.models.length} models from ${this.modelsConfigPath}`);
      } else {
        // Create default config
        this.models = DEFAULT_MODELS;
        this.save();
        this.logger.info(`Created default models config at ${this.modelsConfigPath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to load models from ${this.modelsConfigPath}:`, error);
      this.models = DEFAULT_MODELS;
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.modelsConfigPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.modelsConfigPath, JSON.stringify(this.models, null, 2));
      this.logger.debug(`Saved ${this.models.length} models to ${this.modelsConfigPath}`);
    } catch (error) {
      this.logger.error(`Failed to save models to ${this.modelsConfigPath}:`, error);
    }
  }

  list(): ModelConfig[] {
    return this.models;
  }

  add(id: string, capabilities: ModelConfig['capabilities']): { success: boolean; error?: string } {
    // Validate capabilities
    const validSpeed = ['very_fast', 'fast', 'medium', 'slow'];
    const validCost = ['very_low', 'low', 'medium', 'high'];
    const validContext = ['short', 'medium', 'long'];
    const validReasoning = ['basic', 'medium', 'advanced', 'complex'];

    if (!validSpeed.includes(capabilities.speed)) {
      return { success: false, error: `Invalid speed value. Must be one of: ${validSpeed.join(', ')}` };
    }
    if (!validCost.includes(capabilities.cost)) {
      return { success: false, error: `Invalid cost value. Must be one of: ${validCost.join(', ')}` };
    }
    if (!validContext.includes(capabilities.context_length)) {
      return { success: false, error: `Invalid context_length value. Must be one of: ${validContext.join(', ')}` };
    }
    if (!validReasoning.includes(capabilities.reasoning)) {
      return { success: false, error: `Invalid reasoning value. Must be one of: ${validReasoning.join(', ')}` };
    }

    const existing = this.models.findIndex(m => m.id === id);
    const model: ModelConfig = { id, capabilities };

    if (existing !== -1) {
      this.models[existing] = model;
      this.logger.info(`Updated model config for ${id}`);
    } else {
      this.models.push(model);
      this.logger.info(`Added new model config for ${id}`);
    }

    this.save();
    return { success: true };
  }

  remove(id: string): { success: boolean; error?: string } {
    const index = this.models.findIndex(m => m.id === id);
    if (index === -1) {
      return { success: false, error: `Model ${id} not found` };
    }
    this.models.splice(index, 1);
    this.save();
    this.logger.info(`Removed model: ${id}`);
    return { success: true };
  }

  replaceAll(modelIds: string[]): { success: boolean; error?: string } {
    if (!modelIds || modelIds.length === 0) {
      return { success: false, error: 'Model list cannot be empty' };
    }

    // Create new models list with default capabilities
    this.models = modelIds.map(id => ({
      id,
      capabilities: {
        speed: 'medium' as const,
        cost: 'medium' as const,
        context_length: 'medium' as const,
        reasoning: 'medium' as const
      }
    }));

    this.save();
    this.logger.info(`Replaced model list with ${modelIds.length} models`);
    return { success: true };
  }

  reset(): { success: boolean } {
    this.models = [...DEFAULT_MODELS];
    this.save();
    this.logger.info('Reset models to default configuration');
    return { success: true };
  }

  selectModel(
    taskDifficulty: 'basic' | 'medium' | 'complex',
    requiredCapabilities: string[],
    costPreference: 'low' | 'medium' | 'high',
    preferredModels?: string[]
  ): ModelConfig | undefined {
    let candidates = this.models;

    // Filter by user-specified models if provided
    if (preferredModels && preferredModels.length > 0) {
      candidates = candidates.filter(m => preferredModels.includes(m.id));
    }

    return candidates.find(model => {
      // Check required capabilities
      const meetsCapabilities = requiredCapabilities.every(cap => model.capabilities[cap]);

      // Check cost preference
      const costMap: Record<string, string[]> = {
        'low': ['very_low', 'low'],
        'medium': ['low', 'medium'],
        'high': ['medium', 'high']
      };
      const meetsCost = costMap[costPreference]?.includes(model.capabilities.cost);

      // Check reasoning matches task difficulty
      const reasoningMap: Record<string, string[]> = {
        'basic': ['basic', 'medium', 'advanced', 'complex'],
        'medium': ['medium', 'advanced', 'complex'],
        'complex': ['advanced', 'complex']
      };
      const meetsReasoning = reasoningMap[taskDifficulty]?.includes(model.capabilities.reasoning);

      return meetsCapabilities && meetsCost && meetsReasoning;
    });
  }
}

// ============================================================================
// Activity Logger
// ============================================================================

class ActivityLogger {
  private logsPath: string;
  private logFile: string;
  private logger: any;

  constructor(logsPath: string, logger: any) {
    this.logsPath = logsPath;
    this.logFile = path.join(logsPath, 'task_activity.jsonl');
    this.logger = logger;
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.logsPath)) {
      fs.mkdirSync(this.logsPath, { recursive: true });
    }
  }

  log(entry: Omit<ActivityLogEntry, 'timestamp' | 'timestamp_iso'>): void {
    try {
      const fullEntry: ActivityLogEntry = {
        event_type: entry.event_type,
        task_id: entry.task_id,
        sub_task_id: entry.sub_task_id,
        child_session_id: entry.child_session_id,
        assigned_model: entry.assigned_model,
        priority: entry.priority,
        status: entry.status,
        message: entry.message,
        error: entry.error,
        timestamp: Date.now(),
        timestamp_iso: new Date().toISOString()
      };

      fs.appendFileSync(this.logFile, JSON.stringify(fullEntry) + '\n');
      this.logger.debug(`Logged activity: ${entry.event_type}`);
    } catch (error) {
      this.logger.error(`Failed to log activity: ${error}`);
    }
  }

  logTaskDispatched(taskId: string, description: string, priority: string): void {
    this.log({
      event_type: 'task_dispatched',
      task_id: taskId,
      message: description,
      priority,
      status: 'dispatched'
    });
  }

  logSubagentSpawned(taskId: string, subTaskId: string, sessionId: string, modelId: string): void {
    this.log({
      event_type: 'subagent_spawned',
      task_id: taskId,
      sub_task_id: subTaskId,
      child_session_id: sessionId,
      assigned_model: modelId,
      status: 'spawned'
    });
  }

  logSubagentCompleted(taskId: string, subTaskId: string, sessionId: string): void {
    this.log({
      event_type: 'subagent_completed',
      task_id: taskId,
      sub_task_id: subTaskId,
      child_session_id: sessionId,
      status: 'completed'
    });
  }

  logSubagentFailed(taskId: string, subTaskId: string, sessionId: string, error: string): void {
    this.log({
      event_type: 'subagent_failed',
      task_id: taskId,
      sub_task_id: subTaskId,
      child_session_id: sessionId,
      status: 'failed',
      error
    });
  }

  logSubagentAborted(taskId: string, subTaskId: string, sessionId: string): void {
    this.log({
      event_type: 'subagent_aborted',
      task_id: taskId,
      sub_task_id: subTaskId,
      child_session_id: sessionId,
      status: 'aborted'
    });
  }

  logMessageInjected(taskId: string, sessionId: string, message: string): void {
    this.log({
      event_type: 'message_injected',
      task_id: taskId,
      child_session_id: sessionId,
      message: message.substring(0, 200) // Truncate for logging
    });
  }

  logError(context: string, error: any): void {
    this.log({
      event_type: 'error',
      message: context,
      error: error?.message || String(error)
    });
  }
}

// ============================================================================
// Progress Manager
// ============================================================================

/**
 * Progress Report Explanation:
 *
 * Sub-agents report progress through two methods:
 * 1. Write temporary files to /tmp/psam-progress/{subTaskId}.json
 * 2. Send progress messages to main agent using message tool
 *
 * Sub-agent tasks will include progress reporting instructions
 */

class ProgressManager {
  private progressPath: string;
  private logger: any;

  constructor(progressPath: string, logger: any) {
    this.progressPath = progressPath;
    this.logger = logger;
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.progressPath)) {
      fs.mkdirSync(this.progressPath, { recursive: true });
    }
  }

  /**
   * Generate progress reporting instructions for sub-agent tasks
   */
  generateProgressInstructions(subTaskId: string, mainTaskId: string, totalSteps: number, progressPath: string): string {
    return `
## Progress Report [Required - Part of Task]

This is a **core component** of your task, not an optional step.
You **must** write to the progress file immediately after completing each step.

### Progress File Path
\`${progressPath}/${subTaskId}.json\`

### How to Write (Using Write Tool)

**When starting task**:
\`\`\`
Write({
  file_path: "${progressPath}/${subTaskId}.json",
  content: JSON.stringify({
    subTaskId: "${subTaskId}",
    mainTaskId: "${mainTaskId}",
    currentStep: 1,
    totalSteps: ${totalSteps},
    status: "in_progress",
    message: "Starting task execution...",
    timestamp: Date.now(),
    percentage: 0
  }, null, 2)
})
\`\`\`

**After completing each step** (e.g., step 2):
\`\`\`
Write({
  file_path: "${progressPath}/${subTaskId}.json",
  content: JSON.stringify({
    subTaskId: "${subTaskId}",
    mainTaskId: "${mainTaskId}",
    currentStep: 2,
    totalSteps: ${totalSteps},
    status: "in_progress",
    message: "Describe the step you just completed...",
    timestamp: Date.now(),
    percentage: Math.round(2 / ${totalSteps} * 100)
  }, null, 2)
})
\`\`\`

**When task completes**:
\`\`\`
Write({
  file_path: "${progressPath}/${subTaskId}.json",
  content: JSON.stringify({
    subTaskId: "${subTaskId}",
    mainTaskId: "${mainTaskId}",
    currentStep: ${totalSteps},
    totalSteps: ${totalSteps},
    status: "completed",
    message: "Task completed! Result: ...",
    timestamp: Date.now(),
    percentage: 100
  }, null, 2)
})
\`\`\`

**When task fails**:
\`\`\`
Write({
  file_path: "${progressPath}/${subTaskId}.json",
  content: JSON.stringify({
    subTaskId: "${subTaskId}",
    mainTaskId: "${mainTaskId}",
    currentStep: X,
    totalSteps: ${totalSteps},
    status: "failed",
    message: "Failure reason: ...",
    timestamp: Date.now(),
    percentage: Math.round(X / ${totalSteps} * 100)
  }, null, 2)
})
\`\`\`

### Key Requirements
1. **Write immediately after each step completes**, don't wait until all steps finish
2. **Use JSON.stringify** to format content
3. **Update currentStep and percentage**
4. If stuck or failed, also write to progress file explaining the situation
`;
  }

  /**
   * Read sub-agent progress
   */
  readProgress(subTaskId: string): ProgressReport | null {
    try {
      const filePath = path.join(this.progressPath, `${subTaskId}.json`);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      this.logger.error(`Failed to read progress for ${subTaskId}:`, error);
    }
    return null;
  }

  /**
   * Read all progress reports
   */
  readAllProgress(): ProgressReport[] {
    const reports: ProgressReport[] = [];
    try {
      if (!fs.existsSync(this.progressPath)) return reports;

      const files = fs.readdirSync(this.progressPath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.progressPath, file), 'utf-8');
          reports.push(JSON.parse(content));
        } catch (e) {
          // Skip invalid files
        }
      }
    } catch (error) {
      this.logger.error('Failed to read all progress:', error);
    }
    return reports;
  }

  /**
   * Clean up completed progress files (enhanced version)
   * @returns Number of files cleaned
   */
  cleanupCompletedProgress(): number {
    let cleaned = 0;
    let skipped = 0;
    const startTime = Date.now();

    try {
      if (!fs.existsSync(this.progressPath)) {
        this.logger.debug('Progress path does not exist, nothing to cleanup');
        return 0;
      }

      const files = fs.readdirSync(this.progressPath).filter(f => f.endsWith('.json'));
      this.logger.debug(`Checking ${files.length} progress files for cleanup`);

      for (const file of files) {
        const filePath = path.join(this.progressPath, file);
        try {
          // Validate JSON format and status field
          const content = fs.readFileSync(filePath, 'utf-8');
          const report = JSON.parse(content) as ProgressReport;

          // Check status field exists
          if (!report.status) {
            this.logger.warn(`Progress file missing status field: ${file}, skipping`);
            skipped++;
            continue;
          }

          // Only clean completed/failed/aborted files
          if (report.status === 'completed' || report.status === 'failed' || report.status === 'aborted') {
            fs.unlinkSync(filePath);
            cleaned++;
            this.logger.debug(`Cleaned progress file: ${file} (status: ${report.status})`);
          }
        } catch (parseError) {
          // Skip corrupted files and log warning
          this.logger.warn(`Invalid progress file ${file}: ${parseError instanceof Error ? parseError.message : String(parseError)}, skipping`);
          skipped++;
        }
      }

      const duration = Date.now() - startTime;
      // Log cleanup details
      this.logger.info(`Progress cleanup: ${cleaned} removed, ${skipped} skipped, ${files.length - cleaned - skipped} preserved (${duration}ms)`);
    } catch (error) {
      this.logger.error('Failed to cleanup progress files:', error);
    }

    return cleaned;
  }
}

// ============================================================================
// API Capability Detector
// ============================================================================

/**
 * Note: The OpenClaw Plugin SDK does not expose internal tools like
 * sessions_spawn, sessions_send, etc. to plugins at registration time.
 * Plugin tools can only return results - they cannot directly call other tools.
 *
 * The orchestrate tool works around this by returning instructions for the
 * calling agent to execute sessions_spawn itself.
 */
function detectApiCapabilities(): ApiCapabilities {
  return {
    sessions_spawn: false,
    sessions_send: false,
    sessions_history: false,
    process_kill: false
  };
}

// ============================================================================
// Plugin Implementation
// ============================================================================

export default {
  id: "openclaw-psam",
  name: "OpenClaw PSAM - Parallel Sub-Agent Orchestrator",
  description: "Parallel task creation and sub-agent management system with intelligent model selection, transparent monitoring, granular progress feedback, and exception handling",

  register(api: OpenClawPluginApi, config?: Partial<OrchestratorConfig>) {
    const cfg: OrchestratorConfig = { ...DEFAULT_CONFIG, ...config };

    // Load optional configuration file
    const configFilePath = path.join(path.dirname(__filename), 'config.json');
    try {
      if (fs.existsSync(configFilePath)) {
        const fileConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));

        // Validate configuration values
        if (typeof fileConfig.enableAutoCleanup === 'boolean') {
          cfg.enableAutoCleanup = fileConfig.enableAutoCleanup;
        }
        if (typeof fileConfig.cleanupIntervalMs === 'number' && fileConfig.cleanupIntervalMs > 0) {
          cfg.cleanupIntervalMs = fileConfig.cleanupIntervalMs;
        }
        if (typeof fileConfig.sessionTimeoutMs === 'number' && fileConfig.sessionTimeoutMs > 0) {
          cfg.sessionTimeoutMs = fileConfig.sessionTimeoutMs;
        }
        if (typeof fileConfig.autoAbortTimeout === 'boolean') {
          cfg.autoAbortTimeout = fileConfig.autoAbortTimeout;
        }

        api.logger.info(`Loaded config from ${configFilePath}`);
      }
    } catch (error) {
      api.logger.warn(`Failed to load config file: ${error}`);
    }

    api.logger.info(`Parallel Sub-Agent Orchestrator plugin loaded`);

    // Note: sessions_spawn and related tools are not accessible through plugin SDK
    // The orchestrate tool returns instructions for the agent to execute sessions_spawn
    const capabilities: ApiCapabilities = {
      sessions_spawn: false,
      sessions_send: false,
      sessions_history: false,
      process_kill: false
    };
    api.logger.info(`Plugin SDK does not expose internal tools. Using instruction-based mode.`);

    // Initialize managers
    const taskManager = new TaskStateManager(cfg.statePath, api.logger);
    const modelSelector = new ModelSelector(cfg.modelsConfigPath, api.logger);
    const activityLogger = new ActivityLogger(cfg.logsPath, api.logger);
    const progressManager = new ProgressManager(cfg.progressPath, api.logger);

    // Clean up old tasks on startup
    taskManager.deleteOldTasks();
    progressManager.cleanupCompletedProgress();

    // ========================================================================
    // Tool Schemas (TypeBox)
    // ========================================================================
    const OrchestrateSchema = Type.Object({
      task_description: Type.String({ description: "Description of the complex task to execute" }),
      models: Type.Optional(Type.String({ description: "Comma-separated list of allowed models" })),
      priority: Type.Optional(Type.Union([
        Type.Literal("high"),
        Type.Literal("medium"),
        Type.Literal("low")
      ], { description: "Task priority" })),
      subtask_count: Type.Optional(Type.Number({ description: "Expected number of sub-tasks (1-5)", minimum: 1, maximum: 5 }))
    }, { additionalProperties: false });

    const OrchestrateStatusSchema = Type.Object({
      task: Type.Optional(Type.String({ description: "Main task ID" })),
      session: Type.Optional(Type.String({ description: "Sub-agent session ID" })),
      status_filter: Type.Optional(Type.Union([
        Type.Literal("pending"),
        Type.Literal("running"),
        Type.Literal("completed"),
        Type.Literal("failed"),
        Type.Literal("aborted")
      ], { description: "Filter by status" }))
    }, { additionalProperties: false });

    const OrchestrateAbortSchema = Type.Object({
      session_id: Type.String({ description: "Sub-agent session ID to abort" })
    }, { additionalProperties: false });

    const OrchestrateInjectSchema = Type.Object({
      session_id: Type.String({ description: "Target sub-agent session ID" }),
      message: Type.String({ description: "Message content to inject" })
    }, { additionalProperties: false });

    const OrchestrateHistorySchema = Type.Object({
      session_id: Type.String({ description: "Target sub-agent session ID" }),
      include_tools: Type.Optional(Type.Boolean({ description: "Include tool calls" })),
      limit: Type.Optional(Type.Number({ description: "Message count limit" }))
    }, { additionalProperties: false });

    const OrchestrateConfigSchema = Type.Object({
      action: Type.Optional(Type.Union([
        Type.Literal("list"),
        Type.Literal("add"),
        Type.Literal("remove"),
        Type.Literal("replace"),
        Type.Literal("prefer"),
        Type.Literal("reset")
      ], { description: "Action type" })),
      model_id: Type.Optional(Type.String({ description: "Model ID" })),
      models: Type.Optional(Type.String({ description: "Comma-separated model list (for replace)" })),
      note: Type.Optional(Type.String({ description: "Note or comment" }))
    }, { additionalProperties: false });

    const OrchestrateBindSessionSchema = Type.Object({
      sub_task_id: Type.String({ description: "Sub-task ID" }),
      session_id: Type.String({ description: "Sub-agent session ID (returned by sessions_spawn)" })
    }, { additionalProperties: false });

    // Check timeouts tool parameter schema
    const CheckTimeoutsSchema = Type.Object({
      timeout_minutes: Type.Optional(Type.Number({
        description: "Timeout threshold in minutes (default: 120)",
        minimum: 5,
        maximum: 1440
      })),
      auto_abort: Type.Optional(Type.Boolean({
        description: "Auto-abort timed out sessions (default: false - report only)"
      }))
    }, { additionalProperties: false });

    // Cleanup tool parameter schema
    const CleanupSchema = Type.Object({
      older_than_days: Type.Optional(Type.Number({
        description: "Delete tasks older than specified days (default: 7)",
        minimum: 1,
        maximum: 365
      })),
      include_completed: Type.Optional(Type.Boolean({
        description: "Clean up completed progress files (default: true)"
      })),
      report_only: Type.Optional(Type.Boolean({
        description: "Report only without executing cleanup (default: false)"
      }))
    }, { additionalProperties: false });

    // ========================================================================
    // Tool: orchestrate
    // ========================================================================
    api.registerTool({
      name: "parallel_subagent_orchestrator_orchestrate",
      label: "Orchestrate Task",
      description: "Start an orchestration task, decompose complex task into sub-tasks and return execution instructions",
      parameters: OrchestrateSchema,
      execute: async (_toolCallId, params) => {
        const { task_description, models, priority = 'medium', subtask_count = 1 } = params as any;

        try {
          // Create main task
          const mainTask = taskManager.createMainTask(task_description, priority);
          activityLogger.logTaskDispatched(mainTask.id, task_description, priority);

          // Parse preferred models
          const preferredModels = models ? models.split(',').map((m: string) => m.trim()) : undefined;

          // Create sub-tasks
          const createdSubTasks: SubTask[] = [];
          for (let i = 0; i < Math.min(subtask_count, 5); i++) {
            const subTask = taskManager.createSubTask(
              mainTask.id,
              `Execute part ${i + 1} of task "${task_description}"`,
              'You are an efficient AI assistant, please complete the task strictly according to instructions and report results upon completion.',
              ['Analyze task requirements', 'Plan execution steps', 'Execute task', 'Verify results', 'Report completion'],
              `Execution result for part ${i + 1} of the task`
            );
            if (subTask) createdSubTasks.push(subTask);
          }

          // Select model for each sub-task
          const assignedModel = modelSelector.selectModel(
            'medium', // Default difficulty
            ['reasoning'],
            'medium', // Default cost preference
            preferredModels
          );

          if (!assignedModel) {
            return {
              content: [{ type: "text", text: `Error: No suitable model found to execute task. Please check model configuration or specify models.` }],
              details: { error: "NO_MODEL_AVAILABLE", availableModels: modelSelector.list().map(m => m.id) }
            };
          }

          // Check if we can spawn sub-agents directly
          if (!capabilities.sessions_spawn) {
            // Return instructions for the agent to spawn sub-agents itself
            const spawnInstructions = createdSubTasks.map((st, i) => {
              // Generate progress instructions for this sub-task
              const progressInstructions = progressManager.generateProgressInstructions(
                st.id,
                mainTask.id,
                st.stepsToExecute.length,
                cfg.progressPath
              );

              // Combine task description with progress instructions
              const fullTask = `${st.taskDescription}\n\n${progressInstructions}`;

              return {
                subTaskId: st.id,
                task: fullTask,
                originalTask: st.taskDescription,
                suggestedModel: assignedModel.id,
                spawnCommand: {
                  tool: "sessions_spawn",
                  params: {
                    task: fullTask,
                    model: assignedModel.id
                  }
                }
              };
            });

            return {
              content: [{
                type: "text",
                text: `Task planning completed! Main task ID: ${mainTask.id}\n\n` +
                  `Since the plugin cannot directly create sub-sessions, please follow these steps:\n\n` +
                  spawnInstructions.map((inst, i) =>
                    `${i + 1}. **${inst.subTaskId}**\n` +
                    `   Task: ${inst.originalTask}\n` +
                    `   Suggested model: ${inst.suggestedModel}\n` +
                    `   \n` +
                    `   Step A: Execute sessions_spawn and record the returned sessionId\n` +
                    `   Step B: Bind session to sub-task (IMPORTANT!)\n` +
                    `   \n` +
                    `   orchestrate_bind_session({\n` +
                    `     sub_task_id: "${inst.subTaskId}",\n` +
                    `     session_id: "<sessionId from sessions_spawn>"\n` +
                    `   })`
                  ).join('\n\n') +
                  `\n\n**⚠️ Important**: Must execute Step B to bind session, otherwise sub-agent completion cannot be tracked!\n` +
                  `Use orchestrate_status tool to view task progress`
              }],
              details: {
                mainTaskId: mainTask.id,
                priority,
                model: assignedModel.id,
                spawnInstructions,
                progressPath: cfg.progressPath,
                note: "1. Execute sessions_spawn 2. Use orchestrate_bind_session 3. Use orchestrate_status"
              }
            };
          }

          // Spawn sub-agents for each sub-task
          const spawnResults: { subTaskId: string; sessionId?: string; error?: string }[] = [];

          for (const subTask of createdSubTasks) {
            try {
              const spawnResult = await (api as any).tools.sessions_spawn({
                task: JSON.stringify({
                  task_id: subTask.id,
                  task_description: subTask.taskDescription,
                  role_prompt: subTask.rolePrompt,
                  steps_to_execute: subTask.stepsToExecute,
                  expected_outcome: subTask.expectedOutcome,
                  parent_session_key: (api as any).sessionKey
                }),
                model: assignedModel.id
              });

              // Update sub-task with session info
              taskManager.updateSubTaskStatus(subTask.id, 'running', {
                childSessionId: spawnResult.childSessionKey,
                modelId: assignedModel.id,
                startTime: Date.now()
              });

              activityLogger.logSubagentSpawned(
                mainTask.id,
                subTask.id,
                spawnResult.childSessionKey,
                assignedModel.id
              );

              spawnResults.push({ subTaskId: subTask.id, sessionId: spawnResult.childSessionKey });
            } catch (error: any) {
              taskManager.updateSubTaskStatus(subTask.id, 'failed', { errorLog: error.message });
              activityLogger.logSubagentFailed(mainTask.id, subTask.id, 'N/A', error.message);
              spawnResults.push({ subTaskId: subTask.id, error: error.message });
            }
          }

          // Update main task status
          const anyRunning = createdSubTasks.some(st => {
            const task = taskManager.getTask(mainTask.id);
            const sub = task?.subTasks.find(s => s.id === st.id);
            return sub?.status === 'running';
          });
          if (anyRunning) {
            taskManager.updateSubTaskStatus(createdSubTasks[0].id, 'running'); // Trigger main task status update
          }

          const successCount = spawnResults.filter(r => r.sessionId).length;
          const failCount = spawnResults.filter(r => r.error).length;

          return {
            content: [{
              type: "text",
              text: `Task "${task_description}" started.\n\n` +
                `Main task ID: ${mainTask.id}\n` +
                `Priority: ${priority}\n` +
                `Sub-task count: ${createdSubTasks.length}\n` +
                `Successfully started: ${successCount}\n` +
                `Failed to start: ${failCount}\n` +
                `Model used: ${assignedModel.id}\n\n` +
                `Sub-agent sessions:\n${spawnResults.map(r =>
                  r.sessionId ? `  - ${r.subTaskId}: ${r.sessionId}` : `  - ${r.subTaskId}: Failed - ${r.error}`
                ).join('\n')}`
            }],
            details: {
              mainTaskId: mainTask.id,
              priority,
              model: assignedModel.id,
              subTasks: spawnResults
            }
          };
        } catch (error: any) {
          activityLogger.logError('orchestrate', error);
          return {
            content: [{ type: "text", text: `Error: Failed to start task - ${error.message}` }],
            details: { error: error.message }
          };
        }
      }
    });

    // ========================================================================
    // Tool: orchestrate-status
    // ========================================================================
    api.registerTool({
      name: "parallel_subagent_orchestrator_orchestrate_status",
      label: "Orchestrate Status",
      description: "View current status overview of specific task or all tasks",
      parameters: OrchestrateStatusSchema,
      execute: async (_toolCallId, params) => {
        const { task: taskId, session: sessionId, status_filter } = params as any;

        try {
          let tasks: MainTask[] = [];

          if (sessionId) {
            // Find task by session ID
            const result = taskManager.getTaskBySessionId(sessionId);
            if (result) {
              tasks = [result.mainTask];
            }
          } else if (taskId) {
            // Find specific task
            const task = taskManager.getTask(taskId);
            if (task) {
              tasks = [task];
            }
          } else {
            // Get all tasks
            tasks = taskManager.getAllTasks();
          }

          // Apply status filter
          if (status_filter) {
            tasks = tasks.filter(t => t.status === status_filter);
          }

          if (tasks.length === 0) {
            return {
              content: [{ type: "text", text: "No matching tasks found." }],
              details: { count: 0 }
            };
          }

          // Sync status based on progress files
          for (const task of tasks) {
            for (const subTask of task.subTasks) {
              const currentStatus = subTask.status;
              if (currentStatus === 'running' || currentStatus === 'pending') {
                const progressReport = progressManager.readProgress(subTask.id);
                if (progressReport) {
                  const reportStatus = progressReport.status;
                  // Update status based on progress file
                  if (reportStatus === 'completed') {
                    taskManager.updateSubTaskStatus(subTask.id, 'completed', {
                      endTime: Date.now(),
                      actualDuration: subTask.startTime ? Date.now() - subTask.startTime : undefined
                    });
                    activityLogger.logSubagentCompleted(task.id, subTask.id, subTask.childSessionId || 'N/A');
                  } else if (reportStatus === 'failed') {
                    taskManager.updateSubTaskStatus(subTask.id, 'failed', {
                      endTime: Date.now(),
                      errorLog: progressReport.message
                    });
                    activityLogger.logSubagentFailed(task.id, subTask.id, subTask.childSessionId || 'N/A', progressReport.message);
                  } else if (reportStatus === 'in_progress' && currentStatus === 'pending') {
                    // If progress file shows in_progress but status is pending, update to running
                    taskManager.updateSubTaskStatus(subTask.id, 'running', {
                      startTime: Date.now()
                    });
                  }
                }
              }
            }
          }

          // Re-fetch updated tasks
          if (taskId) {
            const task = taskManager.getTask(taskId);
            tasks = task ? [task] : [];
          } else if (sessionId) {
            const result = taskManager.getTaskBySessionId(sessionId);
            tasks = result ? [result.mainTask] : [];
          } else {
            tasks = taskManager.getAllTasks();
            if (status_filter) {
              tasks = tasks.filter(t => t.status === status_filter);
            }
          }

          // Format output
          const output = tasks.map(t => {
            const totalSubTasks = t.subTasks.length;
            const completedSubTasks = t.subTasks.filter(st => st.status === 'completed').length;
            const runningSubTasks = t.subTasks.filter(st => st.status === 'running').length;
            const progress = totalSubTasks > 0 ? Math.round((completedSubTasks / totalSubTasks) * 100) : 0;

            const subTaskDetails = t.subTasks.map(st => {
              const statusIcon = st.status === 'completed' ? '✅' :
                                 st.status === 'running' ? '🔄' :
                                 st.status === 'failed' ? '❌' : '⏳';

              // Read progress file for real-time progress
              const progressReport = progressManager.readProgress(st.id);
              const stepInfo = progressReport
                ? ` Step ${progressReport.currentStep}/${progressReport.totalSteps} (${progressReport.percentage}%)`
                : '';
              const messageInfo = progressReport?.message
                ? ` - ${progressReport.message.substring(0, 50)}${progressReport.message.length > 50 ? '...' : ''}`
                : '';

              return `    ${statusIcon} ${st.id.split('-').pop()}: ${st.status}${stepInfo}${st.childSessionId ? ` [${st.childSessionId.split('-').pop()}]` : ''}${st.modelId ? ` (${st.modelId})` : ''}${messageInfo}`;
            }).join('\n');

            return `📋 Task: ${t.id.split('-')[1]}...\n` +
              `   Description: ${t.description}\n` +
              `   Status: ${t.status} | Progress: ${progress}% (${completedSubTasks}/${totalSubTasks})\n` +
              `   Sub-tasks:\n${subTaskDetails}`;
          }).join('\n\n');

          return {
            content: [{ type: "text", text: `Task status overview (${tasks.length} tasks):\n\n${output}` }],
            details: { count: tasks.length, tasks }
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: Failed to query status - ${error.message}` }],
            details: { error: error.message }
          };
        }
      }
    });

    // ========================================================================
    // Tool: orchestrate-bind-session
    // ========================================================================
    api.registerTool({
      name: "parallel_subagent_orchestrator_orchestrate_bind_session",
      label: "Orchestrate Bind Session",
      description: "Bind sub-agent session ID to sub-task (use after manually executing sessions_spawn)",
      parameters: OrchestrateBindSessionSchema,
      execute: async (_toolCallId, params) => {
        const { sub_task_id, session_id } = params as any;

        try {
          // Find sub-task
          let foundSubTask: SubTask | null = null;
          let foundMainTask: MainTask | null = null;

          for (const mainTask of taskManager.getAllTasks()) {
            const subTask = mainTask.subTasks.find(st => st.id === sub_task_id);
            if (subTask) {
              foundSubTask = subTask;
              foundMainTask = mainTask;
              break;
            }
          }

          if (!foundSubTask || !foundMainTask) {
            return {
              content: [{ type: "text", text: `Error: Sub-task ${sub_task_id} not found` }],
              details: { error: "SUBTASK_NOT_FOUND", sub_task_id }
            };
          }

          // Check if already bound
          if (foundSubTask.childSessionId) {
            return {
              content: [{ type: "text", text: `Sub-task ${sub_task_id} already bound to session ${foundSubTask.childSessionId}\nUnbind first if you need to rebind.` }],
              details: { error: "ALREADY_BOUND", current_session: foundSubTask.childSessionId }
            };
          }

          // Bind session
          taskManager.updateSubTaskStatus(sub_task_id, 'running', {
            childSessionId: session_id,
            startTime: Date.now()
          });

          activityLogger.log({
            event_type: 'subagent_spawned',
            task_id: foundMainTask.id,
            sub_task_id: sub_task_id,
            child_session_id: session_id,
            status: 'bound'
          });

          return {
            content: [{
              type: "text",
              text: `✅ Session bound successfully!\n\n` +
                `Sub-task: ${sub_task_id}\n` +
                `Session ID: ${session_id}\n` +
                `Status: running\n\n` +
                `You can now use orchestrate_status to view task progress.\n` +
                `Status will be automatically updated when sub-agent completes.`
            }],
            details: { sub_task_id, session_id, mainTaskId: foundMainTask.id }
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: Failed to bind session - ${error.message}` }],
            details: { error: error.message, sub_task_id, session_id }
          };
        }
      }
    });

    // ========================================================================
    // Tool: orchestrate-abort
    // ========================================================================
    api.registerTool({
      name: "parallel_subagent_orchestrator_orchestrate_abort",
      label: "Orchestrate Abort",
      description: "Abort the specified sub-agent session",
      parameters: OrchestrateAbortSchema,
      execute: async (_toolCallId, params) => {
        const { session_id } = params as any;

        // Check API capability
        if (!capabilities.process_kill) {
          return {
            content: [{ type: "text", text: "Error: process API unavailable. Cannot abort session." }],
            details: { error: "API_UNAVAILABLE", capability: "process_kill" }
          };
        }

        try {
          // Validate session ownership
          const result = taskManager.getTaskBySessionId(session_id);
          if (!result) {
            return {
              content: [{ type: "text", text: `Error: Session ${session_id} does not belong to any managed task.` }],
              details: { error: "SESSION_NOT_FOUND", session_id }
            };
          }

          const { mainTask, subTask } = result;

          // Check if already completed
          if (['completed', 'failed', 'aborted'].includes(subTask.status)) {
            return {
              content: [{ type: "text", text: `Sub-agent session ${session_id} already in ${subTask.status} state, no need to abort.` }],
              details: { session_id, status: subTask.status }
            };
          }

          // Terminate session
          try {
            await (api as any).tools.process({ action: 'kill', sessionId: session_id });
          } catch (killError: any) {
            api.logger.warn(`Failed to kill session ${session_id}: ${killError?.message || killError}`);
            // Continue to update status even if kill fails
          }

          // Update status
          taskManager.updateSubTaskStatus(subTask.id, 'aborted', {
            endTime: Date.now(),
            actualDuration: subTask.startTime ? Date.now() - subTask.startTime : undefined
          });

          activityLogger.logSubagentAborted(mainTask.id, subTask.id, session_id);

          return {
            content: [{ type: "text", text: `Sub-agent session ${session_id} successfully aborted.` }],
            details: { session_id, subTaskId: subTask.id, mainTaskId: mainTask.id }
          };
        } catch (error: any) {
          activityLogger.logError('abort', error);
          return {
            content: [{ type: "text", text: `Error: Failed to abort session - ${error.message}` }],
            details: { error: error.message, session_id }
          };
        }
      }
    });

    // ========================================================================
    // Tool: orchestrate-inject
    // ========================================================================
    api.registerTool({
      name: "parallel_subagent_orchestrator_orchestrate_inject",
      label: "Orchestrate Inject",
      description: "Inject a message into the specified sub-agent session",
      parameters: OrchestrateInjectSchema,
      execute: async (_toolCallId, params) => {
        const { session_id, message } = params as any;

        // Check API capability
        if (!capabilities.sessions_send) {
          return {
            content: [{ type: "text", text: "Error: sessions_send API unavailable. Cannot inject message." }],
            details: { error: "API_UNAVAILABLE", capability: "sessions_send" }
          };
        }

        // Validate message
        if (!message || message.trim().length === 0) {
          return {
            content: [{ type: "text", text: "Error: Message content cannot be empty." }],
            details: { error: "EMPTY_MESSAGE" }
          };
        }

        try {
          // Validate session ownership
          const result = taskManager.getTaskBySessionId(session_id);
          if (!result) {
            return {
              content: [{ type: "text", text: `Error: Session ${session_id} does not belong to any managed task.` }],
              details: { error: "SESSION_NOT_FOUND", session_id }
            };
          }

          const { mainTask, subTask } = result;

          // Check if session is still running
          if (['completed', 'failed', 'aborted'].includes(subTask.status)) {
            return {
              content: [{ type: "text", text: `Error: Sub-agent session ${session_id} already in ${subTask.status} state, cannot inject message.` }],
              details: { error: "SESSION_NOT_RUNNING", session_id, status: subTask.status }
            };
          }

          // Inject message
          await (api as any).tools.sessions_send({
            sessionKey: session_id,
            message: message
          });

          activityLogger.logMessageInjected(mainTask.id, session_id, message);

          return {
            content: [{ type: "text", text: `Message successfully injected into sub-agent session ${session_id}.` }],
            details: { session_id, subTaskId: subTask.id, mainTaskId: mainTask.id }
          };
        } catch (error: any) {
          activityLogger.logError('inject', error);
          return {
            content: [{ type: "text", text: `Error: Failed to inject message - ${error.message}` }],
            details: { error: error.message, session_id }
          };
        }
      }
    });

    // ========================================================================
    // Tool: orchestrate-history
    // ========================================================================
    api.registerTool({
      name: "parallel_subagent_orchestrator_orchestrate_history",
      label: "Orchestrate History",
      description: "Get complete message history for specified sub-agent session",
      parameters: OrchestrateHistorySchema,
      execute: async (_toolCallId, params) => {
        const { session_id, include_tools = false, limit = 50 } = params as any;

        // Check API capability
        if (!capabilities.sessions_history) {
          return {
            content: [{ type: "text", text: "Error: sessions_history API unavailable. Cannot get history." }],
            details: { error: "API_UNAVAILABLE", capability: "sessions_history" }
          };
        }

        try {
          // Validate session ownership
          const result = taskManager.getTaskBySessionId(session_id);
          if (!result) {
            return {
              content: [{ type: "text", text: `Error: Session ${session_id} does not belong to any managed task.` }],
              details: { error: "SESSION_NOT_FOUND", session_id }
            };
          }

          // Get history
          const history = await (api as any).tools.sessions_history({
            sessionKey: session_id,
            includeTools: include_tools,
            limit: limit
          });

          if (!history || !history.messages || history.messages.length === 0) {
            return {
              content: [{ type: "text", text: `Sub-agent session ${session_id} has no message history.` }],
              details: { session_id, messageCount: 0 }
            };
          }

          // Format history for display
          const formattedHistory = history.messages.map((msg: any, idx: number) => {
            const timestamp = msg.timestamp ? new Date(msg.timestamp).toISOString() : 'N/A';
            const role = msg.role || 'unknown';
            const content = typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content, null, 2);
            return `[${idx + 1}] ${timestamp} (${role}):\n${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`;
          }).join('\n\n');

          return {
            content: [{
              type: "text",
              text: `Message history for sub-agent session ${session_id} (${history.messages.length} messages):\n\n${formattedHistory}`
            }],
            details: { session_id, messageCount: history.messages.length, truncated: history.truncated }
          };
        } catch (error: any) {
          activityLogger.logError('history', error);
          return {
            content: [{ type: "text", text: `Error: Failed to get history - ${error.message}` }],
            details: { error: error.message, session_id }
          };
        }
      }
    });

    // ========================================================================
    // Tool: orchestrate-config
    // ========================================================================
    api.registerTool({
      name: "parallel_subagent_orchestrator_orchestrate_config",
      label: "Orchestrate Config",
      description: "Manage available model list (add/remove/modify/query)",
      parameters: OrchestrateConfigSchema,
      execute: async (_toolCallId, params) => {
        const { action, model_id, models, note } = params as any;

        // List models
        if (!action || action === 'list') {
          const currentModels = modelSelector.list();
          let output = `📋 Available models (${currentModels.length} total)\n\n`;

          currentModels.forEach((m, i) => {
            output += `${i + 1}. ${m.id}\n`;
          });

          output += `\n💡 Usage instructions:\n`;
          output += `- Add model: { action: "add", model_id: "modelID" }\n`;
          output += `- Remove model: { action: "remove", model_id: "modelID" }\n`;
          output += `- Replace list: { action: "replace", models: "model1,model2,..." }\n`;
          output += `- Reset to default: { action: "reset" }\n`;

          return {
            content: [{ type: "text", text: output }],
            details: { models: currentModels, count: currentModels.length }
          };
        }

        // Add model
        if (action === 'add' && model_id) {
          const result = modelSelector.add(model_id, {
            speed: 'medium',
            cost: 'medium',
            context_length: 'medium',
            reasoning: 'medium'
          });

          if (result.success) {
            return {
              content: [{ type: "text", text: `✅ Added model: ${model_id}\n\nCurrent list:\n${modelSelector.list().map(m => `- ${m.id}`).join('\n')}` }],
              details: { model_id, count: modelSelector.list().length }
            };
          } else {
            return {
              content: [{ type: "text", text: `⚠️ Add failed: ${result.error}` }],
              details: { error: result.error }
            };
          }
        }

        // Remove model
        if (action === 'remove' && model_id) {
          const result = modelSelector.remove(model_id);
          if (result.success) {
            return {
              content: [{ type: "text", text: `✅ Removed model: ${model_id}\n\nRemaining models:\n${modelSelector.list().map(m => `- ${m.id}`).join('\n')}` }],
              details: { model_id, count: modelSelector.list().length }
            };
          } else {
            return {
              content: [{ type: "text", text: `⚠️ Remove failed: ${result.error}` }],
              details: { error: result.error }
            };
          }
        }

        // Replace entire list
        if (action === 'replace' && models) {
          const modelList = models.split(',').map((m: string) => m.trim()).filter(Boolean);
          const result = modelSelector.replaceAll(modelList);

          if (result.success) {
            return {
              content: [{ type: "text", text: `✅ Replaced model list (${modelList.length} total)\n\nNew list:\n${modelSelector.list().map(m => `- ${m.id}`).join('\n')}` }],
              details: { count: modelSelector.list().length }
            };
          } else {
            return {
              content: [{ type: "text", text: `⚠️ Replace failed: ${result.error}` }],
              details: { error: result.error }
            };
          }
        }

        // Reset to default
        if (action === 'reset') {
          const result = modelSelector.reset();
          return {
            content: [{ type: "text", text: `✅ Reset to default model list\n\nCurrent list:\n${modelSelector.list().map(m => `- ${m.id}`).join('\n')}` }],
            details: { count: modelSelector.list().length }
          };
        }

        // Set preference
        if (action === 'prefer' && model_id) {
          const prefPath = path.join(DEFAULT_CONFIG.statePath, 'model_preferences.json');
          let prefs: Record<string, string> = {};
          try {
            if (fs.existsSync(prefPath)) {
              prefs = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
            }
            prefs[model_id] = note || 'Preferred model';
            fs.writeFileSync(prefPath, JSON.stringify(prefs, null, 2));
            return {
              content: [{ type: "text", text: `✅ Set preference: ${model_id} - ${note || 'Preferred model'}` }],
              details: { model_id, note }
            };
          } catch (e) {
            return {
              content: [{ type: "text", text: `⚠️ Failed to save preference` }],
              details: { error: (e as Error).message }
            };
          }
        }

        return {
          content: [{ type: "text", text: `Unknown action: ${action}\nSupported: list, add, remove, replace, reset, prefer` }],
          details: {}
        };
      }
    });

    // ========================================================================
    // Tool: check_timeouts
    // ========================================================================
    api.registerTool({
      name: "parallel_subagent_orchestrator_check_timeouts",
      label: "Check Timeouts",
      description: "Check and handle timed out sub-agent sessions",
      parameters: CheckTimeoutsSchema,
      execute: async (_toolCallId, params) => {
        const { timeout_minutes, auto_abort = false } = params as any;

        // Security check: parameter range validation
        if (timeout_minutes !== undefined && (timeout_minutes < 5 || timeout_minutes > 1440)) {
          return {
            content: [{ type: "text", text: `Error: Timeout threshold out of range. Valid range: 5-1440 minutes.` }],
            details: { error: "INVALID_TIMEOUT", timeout_minutes }
          };
        }

        try {
          // Implement tool main logic
          const timeoutMs = (timeout_minutes || 120) * 60 * 1000;
          const timeouts = taskManager.getTimeoutSubtasks(timeoutMs);

          if (timeouts.length === 0) {
            return {
              content: [{ type: "text", text: `✅ No timed out sub-agent sessions (threshold: ${timeout_minutes || 120} minutes)` }],
              details: { count: 0, timeout: timeoutMs }
            };
          }

          // Implement report mode
          if (!auto_abort) {
            const report = timeouts.map(({ mainTask, subTask }) => {
              const runtime = Math.round((Date.now() - (subTask.startTime || 0)) / 60000);
              return `⏰ ${subTask.id.split('-').pop()} (running ${runtime}min, session: ${subTask.childSessionId || 'N/A'})`;
            }).join('\n');

            return {
              content: [{
                type: "text",
                text: `⚠️ Found ${timeouts.length} timed out sessions (threshold: ${timeout_minutes || 120} minutes):\n\n${report}\n\n💡 Use auto_abort: true to automatically abort these sessions`
              }],
              details: { timeout: timeoutMs, count: timeouts.length, timeouts }
            };
          }

          // Implement auto-abort mode
          // Security check: API capability check
          const capabilities: ApiCapabilities = {
            sessions_spawn: false,
            sessions_send: false,
            sessions_history: false,
            process_kill: false
          };

          if (!capabilities.process_kill) {
            return {
              content: [{ type: "text", text: "Error: process API unavailable. Cannot abort sessions." }],
              details: { error: "API_UNAVAILABLE", capability: "process_kill" }
            };
          }

          let abortedCount = 0;
          let failedCount = 0;
          const report = [];

          for (const { mainTask, subTask } of timeouts) {
            // Security check: session ownership validation and abort status check
            if (['completed', 'failed', 'aborted'].includes(subTask.status)) {
              report.push(`ℹ️ ${subTask.id.split('-').pop()}: Already in ${subTask.status} state`);
              continue;
            }

            if (!subTask.childSessionId) {
              report.push(`⚠️ ${subTask.id.split('-').pop()}: No session ID, cannot abort`);
              failedCount++;
              continue;
            }

            try {
              // Abort session
              await (api as any).tools.process({ action: 'kill', sessionId: subTask.childSessionId });

              // Update status
              taskManager.updateSubTaskStatus(subTask.id, 'aborted', {
                endTime: Date.now(),
                actualDuration: subTask.startTime ? Date.now() - subTask.startTime : undefined
              });

              activityLogger.logSubagentAborted(mainTask.id, subTask.id, subTask.childSessionId);
              report.push(`🔴 ${subTask.id.split('-').pop()}: Aborted (${Math.round((Date.now() - (subTask.startTime || 0)) / 60000)}min)`);
              abortedCount++;
            } catch (error: any) {
              const errorMsg = error?.message || String(error);
              api.logger.warn(`Failed to kill session ${subTask.childSessionId}: ${errorMsg}`);
              report.push(`❌ ${subTask.id.split('-').pop()}: Abort failed - ${errorMsg}`);
              failedCount++;
            }
          }

          return {
            content: [{
              type: "text",
              text: `Timed out session handling completed\n\n${report.join('\n')}\n\nSuccess: ${abortedCount}, Failed: ${failedCount}`
            }],
            details: { timeout: timeoutMs, aborted: abortedCount, failed: failedCount }
          };
        } catch (error: any) {
          return {
            content: [{ type: "text", text: `Error: Failed to check timeouts - ${error.message}` }],
            details: { error: error.message }
          };
        }
      }
    });

    // ========================================================================
    // Tool: cleanup
    // ========================================================================
    api.registerTool({
      name: "parallel_subagent_orchestrator_cleanup",
      label: "Cleanup Resources",
      description: "Manually trigger resource cleanup (task records, progress files, zombie session detection)",
      parameters: CleanupSchema,
      execute: async (_toolCallId, params) => {
        const { older_than_days = 7, include_completed = true, report_only = false } = params as any;

        try {
          const startTime = Date.now();

          // Implement task record cleanup
          const maxAge = older_than_days * 24 * 60 * 60 * 1000;
          const beforeTasks = taskManager.getAllTasks().length;
          taskManager.deleteOldTasks(maxAge);
          const afterTasks = taskManager.getAllTasks().length;
          const deletedTasks = beforeTasks - afterTasks;

          // Implement progress file cleanup
          let cleanedProgress = 0;
          if (include_completed) {
            cleanedProgress = progressManager.cleanupCompletedProgress();
          }

          // Implement zombie session detection
          const zombies: string[] = [];
          for (const task of taskManager.getAllTasks()) {
            for (const subTask of task.subTasks) {
              if (subTask.status === 'running') {
                // Check if progress file exists
                const progress = progressManager.readProgress(subTask.id);
                const elapsed = Date.now() - (subTask.startTime || 0);

                // No progress file + running > 10 min = possible zombie session
                if (!progress && elapsed > 10 * 60 * 1000) {
                  zombies.push(`${subTask.id} (running ${Math.round(elapsed / 60000)}min, no progress)`);
                }
              }
            }
          }

          const duration = Date.now() - startTime;

          // Implement report mode
          if (report_only) {
            const report = `📋 Cleanup preview (will not execute deletion)\n\n` +
              `📋 Tasks to delete: ${deletedTasks} (older than ${older_than_days} days)\n` +
              `📄 Clean progress files: ${include_completed ? 'Yes' : 'No'}\n` +
              `🔍 Zombie sessions detected: ${zombies.length}` +
              (zombies.length > 0 ? `:\n${zombies.map(z => `   - ${z}`).join('\n')}\n` : '\n') +
              `\n💡 Use report_only: false to execute cleanup`;

            return {
              content: [{ type: "text", text: report }],
              details: {
                deleted_tasks: deletedTasks,
                cleaned_progress: cleanedProgress,
                zombie_count: zombies.length,
                zombies,
                preview_only: true
              }
            };
          }

          // Implement return message formatting
          const report = `🧹 Resource cleanup completed\n\n` +
            `📋 Deleted tasks: ${deletedTasks} (>${older_than_days} days)\n` +
            `📄 Cleaned progress files: ${cleanedProgress}\n` +
            `🔍 Zombie sessions: ${zombies.length}` +
            (zombies.length > 0 ? `:\n${zombies.map(z => `   - ${z}`).join('\n')}\n` : '\n') +
            `⏱ Duration: ${duration}ms\n` +
            `📊 Remaining tasks: ${afterTasks}`;

          // Add activity logging
          activityLogger.log({
            event_type: 'cleanup_executed',
            deleted_tasks: deletedTasks,
            cleaned_progress: cleanedProgress,
            zombie_count: zombies.length,
            zombies,
            triggered_by: 'manual',
            duration_ms: duration,
            timestamp: Date.now()
          });

          return {
            content: [{ type: "text", text: report }],
            details: {
              deleted_tasks: deletedTasks,
              cleaned_progress: cleanedProgress,
              zombie_count: zombies.length,
              zombies,
              duration_ms: duration,
              remaining_tasks: afterTasks
            }
          };
        } catch (error: any) {
          // Add error handling
          return {
            content: [{ type: "text", text: `Error: Cleanup failed - ${error.message}` }],
            details: { error: error.message }
          };
        }
      }
    });

    // ========================================================================
    // Event Handlers
    // ========================================================================

    api.on("session_start", async (event, ctx) => {
      api.logger.debug?.(`Session started: ${event.sessionId}`);
    });

    api.on("session_end", async (event, ctx) => {
      api.logger.info?.(`Session ended: ${event.sessionId} (duration: ${event.durationMs}ms)`);

      // Check if this is a sub-agent session we're tracking
      const result = taskManager.getTaskBySessionId(event.sessionId);
      if (result) {
        const { mainTask, subTask } = result;

        api.logger.info?.(`Found matching subtask: ${subTask.id} for session ${event.sessionId}`);

        // Update sub-task status - assume completion when session ends
        // Note: The SDK doesn't provide success/failure info, so we assume completion
        taskManager.updateSubTaskStatus(subTask.id, 'completed', {
          endTime: Date.now(),
          actualDuration: event.durationMs
        });

        activityLogger.logSubagentCompleted(mainTask.id, subTask.id, event.sessionId);

        // Clean up progress file immediately when session ends
        const progressFile = path.join(cfg.progressPath, `${subTask.id}.json`);
        if (fs.existsSync(progressFile)) {
          try {
            fs.unlinkSync(progressFile);
            api.logger.debug?.(`Cleaned up progress file: ${progressFile}`);
          } catch (e) {
            // Add error handling: cleanup failure doesn't affect main flow
            api.logger.warn?.(`Failed to cleanup progress file: ${e}`);
          }
        }

        api.logger.info?.(`Sub-agent ${event.sessionId} ended (assumed completed)`);
      } else {
        api.logger.debug?.(`No matching subtask found for session ${event.sessionId}`);
      }
    });

    // Periodic cleanup mechanism
    if (cfg.enableAutoCleanup) {
      api.logger.info(`Auto-cleanup enabled: interval ${cfg.cleanupIntervalMs}ms`);

      // Error isolation: wrap in try-catch
      const cleanupTimer = setInterval(() => {
        try {
          const deletedTasks = taskManager.deleteOldTasks();
          const cleanedProgress = progressManager.cleanupCompletedProgress();

          // Add activity logging
          if (deletedTasks > 0 || cleanedProgress > 0) {
            api.logger.info(`Auto-cleanup: ${deletedTasks} tasks, ${cleanedProgress} progress files`);

            activityLogger.log({
              event_type: 'cleanup_executed',
              deleted_tasks: deletedTasks,
              cleaned_progress: cleanedProgress,
              triggered_by: 'auto',
              timestamp: Date.now()
            });
          }
        } catch (error) {
          // Error isolation: log but don't throw
          const errorMsg = error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : undefined;
          api.logger.error(`Auto-cleanup failed: ${errorMsg}${stack ? `\n${stack}` : ''}`);
        }
      }, cfg.cleanupIntervalMs);

      // Cleanup timer on unload (if supported)
      // Note: 'unload' event may not be available in current OpenClaw version
      // If timer is not cleaned, system will auto-cleanup on plugin unload
    } else {
      api.logger.info('Auto-cleanup disabled by configuration');
    }

    api.logger.info("All tools registered successfully");
  }
};
