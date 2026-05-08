import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { WebSocket } from "ws";
import type { DaemonClient, DaemonEvent, WebSocketLike } from "@getpaseo/server";
import {
  resolveConnectionTarget,
  resolveDaemonHosts,
  resolveDaemonLogPath,
  type ConnectionTarget,
} from "./connection-target";
import { startDaemonDetached } from "./daemon-manager";
import { loadPaseoServerModule } from "./server-module";
import type {
  AgentView,
  CreateAgentInput,
  PaseoViewState,
  ProviderView,
  SendMessageInput,
  TimelineItemView,
} from "./types";

interface PaseoServiceConfig {
  workspacePath: string | null;
  extensionVersion: string;
  configuredHost: () => string;
  startTimeoutMs: () => number;
  defaultProvider: () => string;
  defaultModel: () => string;
  defaultMode: () => string;
  onStateChange: (state: PaseoViewState) => void;
}

const EMPTY_STATE: PaseoViewState = {
  workspacePath: null,
  daemon: {
    status: "idle",
    host: null,
    message: null,
    logPath: null,
  },
  agents: [],
  providers: [],
  selectedAgentId: null,
  timeline: [],
  busy: false,
  error: null,
};

const MIN_ALL_PROVIDER_CLIENT_VERSION = "0.1.45";
const MOCK_PROVIDER_MODELS = [
  { id: "five-minute-stream", label: "Five minute stream", isDefault: true },
  { id: "thirty-minute-stream", label: "Thirty minute stream", isDefault: false },
  { id: "one-minute-stream", label: "One minute stream", isDefault: false },
  { id: "ten-second-stream", label: "Ten second stream", isDefault: false },
];
const MOCK_PROVIDER_MODES = [{ id: "load-test", label: "Load Test", isDefault: true }];

/**
 * 维护扩展侧 Paseo 状态和 daemon 通信。
 */
export class PaseoService {
  private readonly config: PaseoServiceConfig;
  private state: PaseoViewState;
  private client: DaemonClient | null = null;
  private unsubscribeDaemon: (() => void) | null = null;
  private connectGeneration = 0;

  /**
   * 创建 Paseo 服务。
   * @param config 服务运行配置和状态回调。
   */
  constructor(config: PaseoServiceConfig) {
    this.config = config;
    this.state = {
      ...EMPTY_STATE,
      workspacePath: config.workspacePath,
      daemon: {
        ...EMPTY_STATE.daemon,
        status: config.workspacePath ? "idle" : "no-workspace",
      },
    };
  }

  /**
   * 获取当前视图状态。
   */
  getState(): PaseoViewState {
    return this.state;
  }

  /**
   * 启动或刷新 daemon 连接。
   */
  async start(): Promise<void> {
    if (!this.config.workspacePath) {
      this.patchState({
        daemon: {
          status: "no-workspace",
          host: null,
          message: "需要先打开文件夹",
          logPath: null,
        },
        busy: false,
      });
      return;
    }
    await this.ensureConnected();
    await this.refreshAll();
  }

  /**
   * 主动重连 daemon。
   */
  async reconnect(): Promise<void> {
    await this.closeClient();
    await this.start();
  }

  /**
   * 刷新 provider、agent 和 timeline。
   */
  async refreshAll(): Promise<void> {
    if (!this.client || !this.config.workspacePath) return;
    await Promise.all([this.refreshProviders(), this.refreshAgents()]);
    if (this.state.selectedAgentId) {
      await this.selectAgent(this.state.selectedAgentId);
    }
  }

  /**
   * 创建当前文件夹的新 agent。
   * @param input 新建 agent 表单输入。
   */
  async createAgent(input: CreateAgentInput): Promise<void> {
    if (!this.client || !this.config.workspacePath) return;
    const provider = input.provider || this.config.defaultProvider() || this.resolveFallbackProvider();
    const model = input.model || this.config.defaultModel() || this.resolveDefaultModel(provider);
    const modeId = input.modeId || this.config.defaultMode() || this.resolveDefaultMode(provider);

    this.patchState({ busy: true, error: null });
    try {
      const agent = await this.client.createAgent({
        provider,
        cwd: this.config.workspacePath,
        initialPrompt: input.prompt,
        ...(model ? { model } : {}),
        ...(modeId ? { modeId } : {}),
      });
      const view = mapAgent(agent);
      this.patchState({
        selectedAgentId: view.id,
        agents: upsertAgent(this.state.agents, view, this.config.workspacePath),
      });
      await this.selectAgent(view.id);
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    } finally {
      this.patchState({ busy: false });
    }
  }

  /**
   * 选择 agent 并加载 timeline。
   * @param agentId agent ID。
   */
  async selectAgent(agentId: string): Promise<void> {
    if (!this.client) return;
    this.patchState({ selectedAgentId: agentId, busy: true, error: null });
    try {
      const payload = await this.client.fetchAgentTimeline(agentId, {
        direction: "tail",
        limit: 200,
        projection: "projected",
      });
      const timeline = payload.entries.map((entry, index) =>
        mapTimelineEntry(entry.item, entry.timestamp, `${entry.seqStart}-${entry.seqEnd}-${index}`),
      );
      this.patchState({
        timeline,
        agents: payload.agent
          ? upsertAgent(this.state.agents, mapAgent(payload.agent), this.config.workspacePath)
          : this.state.agents,
      });
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    } finally {
      this.patchState({ busy: false });
    }
  }

  /**
   * 发送用户消息。
   * @param input 待发送消息输入。
   */
  async sendMessage(input: SendMessageInput): Promise<void> {
    if (!this.client) return;
    const text = input.text.trim();
    if (!text) return;
    const optimistic: TimelineItemView = {
      id: `local-${randomUUID()}`,
      type: "user",
      text,
      timestamp: new Date().toISOString(),
    };
    this.patchState({ timeline: [...this.state.timeline, optimistic], busy: true, error: null });
    try {
      await this.client.sendAgentMessage(input.agentId, text);
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    } finally {
      this.patchState({ busy: false });
    }
  }

  /**
   * 释放 WebSocket client。
   */
  async dispose(): Promise<void> {
    await this.closeClient();
  }

  /**
   * 确保 daemon 已连接，必要时离线启动。
   */
  private async ensureConnected(): Promise<void> {
    if (this.client?.isConnected) return;
    const generation = ++this.connectGeneration;
    this.patchState({
      daemon: {
        status: "connecting",
        host: null,
        message: "正在连接 Paseo daemon",
        logPath: resolveDaemonLogPath(),
      },
      error: null,
    });

    const existing = await this.tryConnectExisting();
    if (existing || generation !== this.connectGeneration) return;

    this.patchState({
      daemon: {
        status: "starting",
        host: null,
        message: "正在启动 Paseo daemon",
        logPath: resolveDaemonLogPath(),
      },
    });
    try {
      const startResult = await startDaemonDetached({});
      this.patchState({
        daemon: {
          status: "starting",
          host: null,
          message: `Paseo daemon 已在后台启动（PID ${startResult.pid ?? "unknown"}）`,
          logPath: startResult.logPath,
        },
      });
      await this.waitForDaemon(generation);
    } catch (error) {
      this.patchState({
        daemon: {
          status: "error",
          host: null,
          message: errorToMessage(error),
          logPath: resolveDaemonLogPath(),
        },
        error: errorToMessage(error),
      });
    }
  }

  /**
   * 尝试连接已有 daemon。
   */
  private async tryConnectExisting(): Promise<boolean> {
    const hosts = resolveDaemonHosts({
      configuredHost: this.config.configuredHost(),
      env: process.env,
    });
    for (const host of hosts) {
      try {
        await this.connectHost(host);
        return true;
      } catch {
        // 继续尝试下一个连接目标。
      }
    }
    return false;
  }

  /**
   * 等待 daemon 启动完成。
   * @param generation 当前连接代次，用于忽略过期连接尝试。
   */
  private async waitForDaemon(generation: number): Promise<void> {
    const deadline = Date.now() + this.config.startTimeoutMs();
    while (Date.now() < deadline && generation === this.connectGeneration) {
      if (await this.tryConnectExisting()) return;
      await sleep(500);
    }
    throw new Error("等待 Paseo daemon 启动超时");
  }

  /**
   * 连接单个 daemon host。
   * @param host daemon host。
   */
  private async connectHost(host: string): Promise<void> {
    const target = resolveConnectionTarget(host);
    await probeConnectionTarget(target, 1000);
    await this.connectTarget(target);
  }

  /**
   * 连接已确认可达的 daemon 目标。
   * @param target daemon 连接目标。
   */
  private async connectTarget(target: ConnectionTarget): Promise<void> {
    const serverModule = await loadPaseoServerModule();
    const client = new serverModule.DaemonClient({
      url: target.url,
      clientId: `paseo-vscode-${randomUUID()}`,
      clientType: "browser",
      appVersion: resolveClientAppVersion(this.config.extensionVersion),
      password: target.password,
      connectTimeoutMs: 5000,
      reconnect: { enabled: true, baseDelayMs: 1000, maxDelayMs: 5000 },
      webSocketFactory: (url, options) => createWebSocket(url, options, target),
    });
    await client.connect();
    await this.closeClient();
    this.client = client;
    this.unsubscribeDaemon = client.subscribe((event) => this.handleDaemonEvent(event));
    this.patchState({
      daemon: {
        status: "connected",
        host: target.host,
        message: "已连接 Paseo daemon",
        logPath: resolveDaemonLogPath(),
      },
      error: null,
    });
  }

  /**
   * 刷新 provider 快照。
   */
  private async refreshProviders(): Promise<void> {
    if (!this.client || !this.config.workspacePath) return;
    try {
      const snapshot = await this.client.getProvidersSnapshot({ cwd: this.config.workspacePath });
      this.patchState({ providers: snapshot.entries.map(mapProvider) });
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    }
  }

  /**
   * 刷新 agent 列表。
   */
  private async refreshAgents(): Promise<void> {
    if (!this.client || !this.config.workspacePath) return;
    try {
      const payload = await this.client.fetchAgents({
        filter: { includeArchived: false },
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: 100 },
      });
      const agents = payload.entries
        .map((entry) => mapAgent(entry.agent))
        .filter((agent) => agent.cwd === this.config.workspacePath);
      const selectedAgentId =
        this.state.selectedAgentId && agents.some((agent) => agent.id === this.state.selectedAgentId)
          ? this.state.selectedAgentId
          : (agents[0]?.id ?? null);
      this.patchState({ agents, selectedAgentId });
      if (selectedAgentId && selectedAgentId !== this.state.selectedAgentId) {
        await this.selectAgent(selectedAgentId);
      }
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    }
  }

  /**
   * 处理 daemon 推送事件。
   * @param event daemon 事件。
   */
  private handleDaemonEvent(event: DaemonEvent): void {
    if (event.type === "agent_stream" && event.agentId === this.state.selectedAgentId) {
      const item = mapTimelineEntry(event.event.type === "timeline" ? event.event.item : event.event, event.timestamp);
      this.patchState({ timeline: [...this.state.timeline, item] });
      return;
    }

    if (event.type === "agent_update" && event.payload.kind === "upsert") {
      const agent = mapAgent(event.payload.agent);
      this.patchState({ agents: upsertAgent(this.state.agents, agent, this.config.workspacePath) });
      return;
    }

    if (event.type === "agent_deleted") {
      this.patchState({
        agents: this.state.agents.filter((agent) => agent.id !== event.agentId),
        selectedAgentId:
          this.state.selectedAgentId === event.agentId ? null : this.state.selectedAgentId,
      });
    }
  }

  /**
   * 关闭当前 client。
   */
  private async closeClient(): Promise<void> {
    this.unsubscribeDaemon?.();
    this.unsubscribeDaemon = null;
    const current = this.client;
    this.client = null;
    if (current) {
      await current.close().catch(() => undefined);
    }
  }

  /**
   * 更新视图状态。
   * @param patch 局部状态补丁。
   */
  private patchState(patch: Partial<PaseoViewState>): void {
    this.state = {
      ...this.state,
      ...patch,
      daemon: patch.daemon ? patch.daemon : this.state.daemon,
    };
    this.config.onStateChange(this.state);
  }

  /**
   * 推导 fallback provider。
   */
  private resolveFallbackProvider(): string {
    return this.state.providers.find((provider) => provider.status === "ready")?.provider ?? "codex";
  }

  /**
   * 推导 provider 默认 model。
   * @param provider provider ID。
   */
  private resolveDefaultModel(provider: string): string | undefined {
    return this.state.providers
      .find((entry) => entry.provider === provider)
      ?.models.find((model) => model.isDefault)?.id;
  }

  /**
   * 推导 provider 默认 mode。
   * @param provider provider ID。
   */
  private resolveDefaultMode(provider: string): string | undefined {
    const entry = this.state.providers.find((candidate) => candidate.provider === provider);
    return entry?.defaultModeId ?? entry?.modes.find((mode) => mode.isDefault)?.id;
  }
}

/**
 * 探测 daemon 连接目标是否有进程监听。
 * @param target daemon 连接目标。
 * @param timeoutMs 探测超时时间。
 */
function probeConnectionTarget(target: ConnectionTarget, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = target.socketPath
      ? net.createConnection(target.socketPath)
      : net.createConnection(readTcpConnectOptions(target));
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };
    const timer = setTimeout(() => finish(new Error(`daemon ${target.host} 探测超时`)), timeoutMs);
    socket.once("connect", () => finish());
    socket.once("error", (error) => finish(error));
  });
}

/**
 * 读取 TCP 探测参数。
 * @param target daemon 连接目标。
 */
function readTcpConnectOptions(target: ConnectionTarget): net.NetConnectOpts {
  const parsed = new URL(target.url);
  const port = Number(parsed.port || (parsed.protocol === "wss:" ? 443 : 80));
  return {
    host: parsed.hostname,
    port,
  };
}

/**
 * 解析发送给 daemon 的客户端协议版本。
 * @param extensionVersion VS Code 扩展版本。
 */
function resolveClientAppVersion(extensionVersion: string): string {
  if (isVersionAtLeast(extensionVersion, MIN_ALL_PROVIDER_CLIENT_VERSION)) {
    return extensionVersion;
  }
  return MIN_ALL_PROVIDER_CLIENT_VERSION;
}

/**
 * 判断语义化版本是否不低于目标版本。
 * @param actual 当前版本。
 * @param minimum 最低版本。
 */
function isVersionAtLeast(actual: string, minimum: string): boolean {
  const actualParts = actual.replace(/-.*/, "").split(".").map((part) => Number(part));
  const minimumParts = minimum.split(".").map((part) => Number(part));
  for (let index = 0; index < minimumParts.length; index += 1) {
    const left = actualParts[index] ?? 0;
    const right = minimumParts[index] ?? 0;
    if (!Number.isFinite(left) || left < right) return false;
    if (left > right) return true;
  }
  return true;
}

/**
 * 创建 Node WebSocket。
 * @param url WebSocket URL。
 * @param options daemon client 透传选项。
 * @param target 连接目标。
 */
function createWebSocket(
  url: string,
  options: { headers?: Record<string, string>; protocols?: string[] } | undefined,
  target: ConnectionTarget,
): WebSocketLike {
  return new WebSocket(url, options?.protocols, {
    headers: options?.headers,
    ...(target.socketPath ? { socketPath: target.socketPath } : {}),
  }) as unknown as WebSocketLike;
}

/**
 * 映射 agent 到 Webview 状态。
 * @param agent daemon agent 快照。
 */
function mapAgent(agent: {
  id: string;
  title?: string | null;
  provider: string;
  cwd: string;
  status: string;
  updatedAt: string;
  lastError?: string | null;
}): AgentView {
  return {
    id: agent.id,
    title: agent.title?.trim() || "New agent",
    provider: agent.provider,
    cwd: agent.cwd,
    status: agent.status,
    updatedAt: agent.updatedAt,
    lastError: agent.lastError ?? null,
  };
}

/**
 * 映射 provider 快照。
 * @param entry daemon provider 快照。
 */
function mapProvider(entry: {
  provider: string;
  label?: string;
  status: string;
  error?: string;
  models?: Array<{ id: string; label?: string; isDefault?: boolean }>;
  modes?: Array<{ id: string; label?: string; isDefault?: boolean }>;
  defaultModeId?: string | null;
}): ProviderView {
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
function mapTimelineEntry(item: unknown, timestamp?: string, idSeed?: string): TimelineItemView {
  const record = isRecord(item) ? item : {};
  const type = record.type;
  const id = `${idSeed ?? timestamp ?? Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (type === "user_message") {
    return { id, type: "user", text: readString(record.text), timestamp };
  }
  if (type === "assistant_message") {
    return { id, type: "assistant", text: readString(record.text), timestamp };
  }
  if (type === "reasoning") {
    return { id, type: "reasoning", text: readString(record.text), timestamp };
  }
  if (type === "error") {
    return { id, type: "error", text: readString(record.message), timestamp };
  }
  if (type === "todo") {
    const items = Array.isArray(record.items)
      ? record.items.map((entry) => (isRecord(entry) ? `${entry.completed ? "[x]" : "[ ]"} ${entry.text}` : ""))
      : [];
    return { id, type: "todo", text: items.filter(Boolean).join("\n"), timestamp };
  }
  if (type === "tool_call") {
    return {
      id,
      type: "tool",
      text: `${readString(record.name) || "tool"} ${readString(record.status)}`.trim(),
      status: readString(record.status),
      timestamp,
    };
  }
  if (typeof type === "string") {
    return { id, type: "system", text: type, timestamp };
  }
  return { id, type: "system", text: JSON.stringify(item), timestamp };
}

/**
 * 更新 agent 列表。
 * @param agents 当前 agent 列表。
 * @param next 新 agent。
 * @param workspacePath 当前工作区路径。
 */
function upsertAgent(agents: AgentView[], next: AgentView, workspacePath: string | null): AgentView[] {
  if (workspacePath && next.cwd !== workspacePath) return agents;
  const filtered = agents.filter((agent) => agent.id !== next.id);
  return [next, ...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * 判断 unknown 是否为 record。
 * @param value 待判断值。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 读取字符串字段。
 * @param value 待读取值。
 */
function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * 归一化错误消息。
 * @param error 待展示错误。
 */
function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
