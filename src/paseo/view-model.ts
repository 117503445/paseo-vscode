import type { AgentView, ProviderView, TimelineItemView } from "./types";

export interface AgentSnapshotLike {
  /** agent ID。 */
  id: string;
  /** 标题。 */
  title?: string | null;
  /** provider ID。 */
  provider: string;
  /** 工作目录。 */
  cwd: string;
  /** 生命周期状态。 */
  status: string;
  /** 模型 ID。 */
  model?: string | null;
  /** 当前模式 ID。 */
  currentModeId?: string | null;
  /** 更新时间。 */
  updatedAt: string;
  /** 归档时间。 */
  archivedAt?: string | null;
  /** 最近错误。 */
  lastError?: string | null;
}

interface ProviderSnapshotLike {
  /** provider ID。 */
  provider: string;
  /** 展示名称。 */
  label?: string;
  /** provider 状态。 */
  status: string;
  /** 错误信息。 */
  error?: string;
  /** 可选模型。 */
  models?: Array<{ id: string; label?: string; isDefault?: boolean }>;
  /** 可选模式。 */
  modes?: Array<{ id: string; label?: string; isDefault?: boolean }>;
  /** 默认模式 ID。 */
  defaultModeId?: string | null;
}

const MOCK_PROVIDER_MODELS = [
  { id: "five-minute-stream", label: "Five minute stream", isDefault: true },
  { id: "thirty-minute-stream", label: "Thirty minute stream", isDefault: false },
  { id: "one-minute-stream", label: "One minute stream", isDefault: false },
  { id: "ten-second-stream", label: "Ten second stream", isDefault: false },
];
const MOCK_PROVIDER_MODES = [{ id: "load-test", label: "Load Test", isDefault: true }];

/**
 * 映射 agent 到 Webview 状态。
 * @param agent daemon agent 快照。
 */
export function mapAgent(agent: AgentSnapshotLike): AgentView {
  return {
    id: agent.id,
    title: agent.title?.trim() || "New agent",
    provider: agent.provider,
    cwd: agent.cwd,
    status: agent.status,
    model: agent.model ?? null,
    modeId: agent.currentModeId ?? null,
    updatedAt: agent.updatedAt,
    archivedAt: agent.archivedAt ?? null,
    lastError: agent.lastError ?? null,
  };
}

/**
 * 映射 provider 快照。
 * @param entry daemon provider 快照。
 */
export function mapProvider(entry: ProviderSnapshotLike): ProviderView {
  const models =
    entry.provider === "mock" && (entry.models ?? []).length === 0
      ? MOCK_PROVIDER_MODELS
      : (entry.models ?? []);
  const modes =
    entry.provider === "mock" && (entry.modes ?? []).length === 0
      ? MOCK_PROVIDER_MODES
      : (entry.modes ?? []);
  return {
    provider: entry.provider,
    label: entry.label ?? entry.provider,
    status: entry.status,
    error: entry.error ?? null,
    models: models.map((model) => ({
      id: model.id,
      label: model.label ?? model.id,
      isDefault: model.isDefault === true,
    })),
    modes: modes.map((mode) => ({
      id: mode.id,
      label: mode.label ?? mode.id,
      isDefault: mode.isDefault === true,
    })),
    defaultModeId: entry.defaultModeId ?? (entry.provider === "mock" ? "load-test" : null),
  };
}

/**
 * 映射 timeline item。
 * @param item daemon timeline item 或 stream event。
 * @param timestamp item 时间戳。
 * @param idSeed 可选 ID 种子。
 */
export function mapTimelineEntry(item: unknown, timestamp?: string, idSeed?: string): TimelineItemView {
  const record = isRecord(item) ? item : {};
  const type = record.type;
  const id = `${idSeed ?? timestamp ?? Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (type === "user_message") {
    return { id, type: "user", title: "用户提示提交", text: readString(record.text), status: "completed", timestamp };
  }
  if (type === "assistant_message") {
    return { id, type: "assistant", title: "Assistant", text: readString(record.text), timestamp };
  }
  if (type === "reasoning") {
    return { id, type: "reasoning", title: "已处理", text: readString(record.text), collapsible: true, timestamp };
  }
  if (type === "error") {
    return { id, type: "error", title: "错误", text: readString(record.message), status: "failed", timestamp };
  }
  if (type === "todo") {
    const items = Array.isArray(record.items)
      ? record.items.map((entry) => (isRecord(entry) ? `${entry.completed ? "[x]" : "[ ]"} ${entry.text}` : ""))
      : [];
    return { id, type: "todo", title: "待办", text: items.filter(Boolean).join("\n"), collapsible: true, timestamp };
  }
  if (type === "tool_call") {
    return {
      id,
      type: "tool",
      title: readString(record.name) || "工具调用",
      text: `${readString(record.name) || "tool"} ${readString(record.status)}`.trim(),
      status: readString(record.status),
      collapsible: true,
      timestamp,
    };
  }
  if (typeof type === "string") {
    return { id, type: "system", title: "系统事件", text: type, collapsible: true, timestamp };
  }
  return { id, type: "system", title: "系统事件", text: JSON.stringify(item), collapsible: true, timestamp };
}

/**
 * 从 stream 生命周期事件同步 agent 摘要状态。
 * @param event daemon stream 事件。
 * @param timestamp 事件时间戳。
 */
export function resolveAgentPatchFromStreamEvent(
  event: Record<string, unknown>,
  timestamp?: string,
): Partial<AgentView> | null {
  const type = readString(event.type);
  const updatedAt = timestamp ?? new Date().toISOString();
  if (type === "turn_started") {
    return { status: "running", updatedAt };
  }
  if (type === "turn_completed" || type === "turn_failed" || type === "turn_canceled") {
    const lastError = type === "turn_failed" ? readString(event.error) : null;
    return { status: "idle", updatedAt, lastError };
  }
  if (type === "attention_required" && readString(event.reason) !== "permission") {
    return { status: "idle", updatedAt };
  }
  if (type === "mode_changed") {
    return { modeId: readNullableString(event.currentModeId), updatedAt };
  }
  if (type === "model_changed") {
    const runtimeInfo = isRecord(event.runtimeInfo) ? event.runtimeInfo : {};
    return { model: readNullableString(runtimeInfo.model), updatedAt };
  }
  return null;
}

/**
 * 更新 agent 列表。
 * @param agents 当前 agent 列表。
 * @param next 新 agent。
 * @param workspacePath 当前工作区路径。
 */
export function upsertAgent(agents: AgentView[], next: AgentView, workspacePath: string | null): AgentView[] {
  if (workspacePath && next.cwd !== workspacePath) return agents;
  const filtered = agents.filter((agent) => agent.id !== next.id);
  return [next, ...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * 判断 agent 是否正在运行。
 * @param agent agent 摘要。
 */
export function isAgentRunning(agent: AgentView): boolean {
  return agent.status === "running" || agent.status === "initializing";
}

/**
 * 判断 unknown 是否为 record。
 * @param value 待判断值。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 读取字符串字段。
 * @param value 待读取值。
 */
export function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * 读取可空字符串字段。
 * @param value 待读取值。
 */
function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * 归一化错误消息。
 * @param error 待展示错误。
 */
export function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
