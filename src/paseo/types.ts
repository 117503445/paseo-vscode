import type { AgentProviderDefinition } from "@getpaseo/server";

/** daemon 连接状态。 */
export type DaemonConnectionStatus =
  | "no-workspace"
  | "idle"
  | "connecting"
  | "starting"
  | "connected"
  | "error";

/** Paseo Webview 主屏幕。 */
export type PaseoScreen = "tasks" | "thread";

/** 任务列表过滤模式。 */
export type TaskFilter = "all" | "running" | "archived";

/** agent 在 Webview 中的摘要。 */
export interface AgentView {
  /** agent ID。 */
  id: string;
  /** 展示标题。 */
  title: string;
  /** provider ID。 */
  provider: string;
  /** 当前工作目录。 */
  cwd: string;
  /** 生命周期状态。 */
  status: string;
  /** 模型 ID。 */
  model: string | null;
  /** 当前模式 ID。 */
  modeId: string | null;
  /** 更新时间。 */
  updatedAt: string;
  /** 归档时间。 */
  archivedAt: string | null;
  /** 最近错误。 */
  lastError: string | null;
}

/** provider 在 Webview 中的摘要。 */
export interface ProviderView {
  /** provider ID。 */
  provider: string;
  /** 展示名称。 */
  label: string;
  /** provider 状态。 */
  status: string;
  /** 错误信息。 */
  error: string | null;
  /** 可选模型。 */
  models: SelectOptionView[];
  /** 可选模式。 */
  modes: SelectOptionView[];
  /** 默认模式 ID。 */
  defaultModeId: string | null;
}

/** 下拉选项。 */
export interface SelectOptionView {
  /** 选项 ID。 */
  id: string;
  /** 展示名称。 */
  label: string;
  /** 是否默认选项。 */
  isDefault: boolean;
}

/** timeline item 操作。 */
export interface TimelineActionView {
  /** 操作 ID。 */
  id: string;
  /** 展示名称。 */
  label: string;
}

/** timeline item 在 Webview 中的展示模型。 */
export interface TimelineItemView {
  /** item ID。 */
  id: string;
  /** item 类型。 */
  type: "user" | "assistant" | "reasoning" | "tool" | "todo" | "error" | "system";
  /** 标题。 */
  title?: string;
  /** 正文。 */
  text: string;
  /** 执行状态。 */
  status?: string;
  /** 耗时毫秒。 */
  durationMs?: number;
  /** 是否可折叠。 */
  collapsible?: boolean;
  /** 子项。 */
  children?: TimelineItemView[];
  /** 可用操作。 */
  actions?: TimelineActionView[];
  /** 时间戳。 */
  timestamp?: string;
}

/** composer 默认值。 */
export interface ComposerDefaultsView {
  /** 默认 provider。 */
  provider: string;
  /** 默认模型。 */
  model: string;
  /** 默认模式。 */
  modeId: string;
}

/** composer 发送输入。 */
export interface ComposerInput {
  /** 消息文本。 */
  text: string;
  /** provider ID。 */
  provider?: string;
  /** 模型 ID。 */
  model?: string;
  /** 模式 ID。 */
  modeId?: string;
  /** 是否附加 IDE 上下文。 */
  includeIdeContext?: boolean;
  /** 是否启用计划模式。 */
  planMode?: boolean;
}

/** 设置页摘要。 */
export interface SettingsSummaryView {
  /** daemon host。 */
  daemonHost: string | null;
  /** daemon 日志路径。 */
  daemonLogPath: string | null;
  /** 配置中的默认 provider。 */
  defaultProvider: string;
  /** 配置中的默认模型。 */
  defaultModel: string;
  /** 配置中的默认模式。 */
  defaultMode: string;
}

/** Webview 完整状态。 */
export interface PaseoViewState {
  /** 当前工作区路径。 */
  workspacePath: string | null;
  /** 当前屏幕。 */
  screen: PaseoScreen;
  /** 任务过滤模式。 */
  taskFilter: TaskFilter;
  /** 搜索关键字。 */
  searchQuery: string;
  /** 运行中任务数量。 */
  runningCount: number;
  /** daemon 状态。 */
  daemon: {
    /** 连接状态。 */
    status: DaemonConnectionStatus;
    /** 连接目标。 */
    host: string | null;
    /** 状态消息。 */
    message: string | null;
    /** daemon 日志路径。 */
    logPath: string | null;
  };
  /** 当前工作区 agent 列表。 */
  agents: AgentView[];
  /** provider 列表。 */
  providers: ProviderView[];
  /** 当前选中 agent ID。 */
  selectedAgentId: string | null;
  /** 当前选中 agent。 */
  selectedAgent: AgentView | null;
  /** 当前 agent timeline。 */
  timeline: TimelineItemView[];
  /** composer 默认值。 */
  composerDefaults: ComposerDefaultsView;
  /** 设置摘要。 */
  settingsSummary: SettingsSummaryView;
  /** 是否忙碌。 */
  busy: boolean;
  /** 最近错误。 */
  error: string | null;
}

/** Extension Host 推给 Webview 的消息。 */
export interface ExtensionToWebviewMessage {
  /** 消息类型。 */
  type: "state";
  /** Webview 状态。 */
  state: PaseoViewState;
}

/** Webview 发给 Extension Host 的消息。 */
export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "refresh" }
  | { type: "reconnect" }
  | { type: "openSettings" }
  | { type: "openAgent"; agentId: string }
  | { type: "backToTasks" }
  | { type: "archiveAgent"; agentId: string }
  | { type: "cancelAgent"; agentId: string }
  | { type: "setAgentModel"; agentId: string; modelId: string }
  | { type: "setAgentMode"; agentId: string; modeId: string }
  | { type: "setTaskFilter"; filter: TaskFilter }
  | { type: "setSearchQuery"; query: string }
  | { type: "sendComposer"; input: ComposerInput }
  | { type: "toggleComposerOption"; option: "includeIdeContext" | "planMode"; enabled: boolean };

/** Paseo server 模块类型。 */
export type PaseoServerModule = typeof import("@getpaseo/server");

/** provider 定义摘要。 */
export type ProviderDefinitionView = Pick<AgentProviderDefinition, "id" | "label">;
