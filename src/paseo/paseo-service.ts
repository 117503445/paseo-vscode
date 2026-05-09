import { setTimeout as sleep } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import type { DaemonClient, DaemonEvent } from "@getpaseo/server";
import {
  resolveConnectionTarget,
  resolveDaemonHosts,
  resolveDaemonLogPath,
  type ConnectionTarget,
} from "./connection-target";
import {
  createWebSocket,
  maskHostForLog,
  probeConnectionTarget,
  resolveClientAppVersion,
} from "./daemon-transport";
import { startDaemonDetached } from "./daemon-manager";
import { loadPaseoServerModule } from "./server-module";
import type {
  AgentView,
  ComposerDefaultsView,
  ComposerInput,
  PaseoViewState,
  ProviderView,
  SettingsSummaryView,
  TaskFilter,
} from "./types";
import {
  errorToMessage,
  appendTimelineStreamEvent,
  isAgentRunning,
  isRecord,
  mapAgent,
  mapProvider,
  reduceTimelineEntries,
  readString,
  resolveAgentPatchFromStreamEvent,
  upsertAgent,
  type AgentSnapshotLike,
} from "./view-model";

interface PaseoServiceConfig {
  workspacePath: string | null;
  extensionVersion: string;
  configuredHost: () => string;
  daemonPassword: () => string;
  startTimeoutMs: () => number;
  defaultProvider: () => string;
  defaultModel: () => string;
  defaultMode: () => string;
  ideContext: () => string | null;
  onStateChange: (state: PaseoViewState) => void;
  log: (message: string) => void;
}

interface AgentClientLike {
  /**
   * 创建 agent。
   * @param input 创建参数。
   */
  createAgent(input: Record<string, unknown>): Promise<unknown>;
  /**
   * 发送 agent 消息。
   * @param agentId agent ID。
   * @param text 消息文本。
   * @param options 附加参数。
   */
  sendAgentMessage(agentId: string, text: string, options?: Record<string, unknown>): Promise<void>;
  /**
   * 归档 agent。
   * @param agentId agent ID。
   */
  archiveAgent(agentId: string): Promise<{ archivedAt?: string }>;
  /**
   * 停止 agent。
   * @param agentId agent ID。
   */
  cancelAgent(agentId: string): Promise<void>;
  /**
   * 设置 agent 模型。
   * @param agentId agent ID。
   * @param modelId 模型 ID。
   */
  setAgentModel(agentId: string, modelId: string): Promise<unknown>;
  /**
   * 设置 agent 模式。
   * @param agentId agent ID。
   * @param modeId 模式 ID。
   */
  setAgentMode(agentId: string, modeId: string): Promise<unknown>;
}

const EMPTY_STATE: PaseoViewState = {
  workspacePath: null,
  screen: "tasks",
  taskFilter: "all",
  searchQuery: "",
  runningCount: 0,
  daemon: {
    status: "idle",
    host: null,
    message: null,
    logPath: null,
  },
  agents: [],
  providers: [],
  selectedAgentId: null,
  selectedAgent: null,
  timeline: [],
  composerDefaults: {
    provider: "",
    model: "",
    modeId: "",
  },
  settingsSummary: {
    daemonHost: null,
    daemonLogPath: null,
    defaultProvider: "",
    defaultModel: "",
    defaultMode: "",
  },
  busy: false,
  error: null,
};

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
    this.state = this.withDerivedState({
      ...EMPTY_STATE,
      workspacePath: config.workspacePath,
      daemon: {
        ...EMPTY_STATE.daemon,
        status: config.workspacePath ? "idle" : "no-workspace",
      },
    });
    this.log(`扩展初始化，workspace=${config.workspacePath ?? "未打开文件夹"}`);
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
      this.log("未打开文件夹，跳过 daemon 连接");
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
    this.log("用户请求重连 daemon");
    await this.closeClient();
    await this.start();
  }

  /**
   * 刷新 provider、agent 和 timeline。
   */
  async refreshAll(): Promise<void> {
    if (!this.client || !this.config.workspacePath) return;
    this.log("刷新 provider、agent 和 timeline");
    await Promise.all([this.refreshProviders(), this.refreshAgents()]);
    if (this.state.selectedAgentId) {
      await this.selectAgent(this.state.selectedAgentId);
    }
  }

  /**
   * 设置任务列表过滤模式。
   * @param filter 任务过滤模式。
   */
  setTaskFilter(filter: TaskFilter): void {
    this.patchState({ taskFilter: filter });
  }

  /**
   * 设置任务搜索关键字。
   * @param query 搜索关键字。
   */
  setSearchQuery(query: string): void {
    this.patchState({ searchQuery: query });
  }

  /**
   * 返回任务列表。
   */
  backToTasks(): void {
    this.patchState({ screen: "tasks", selectedAgentId: null, timeline: [], error: null });
  }

  /**
   * 从 composer 发送消息或创建新任务。
   * @param input composer 输入。
   */
  async sendComposer(input: ComposerInput): Promise<void> {
    const text = input.text.trim();
    if (!text) return;
    if (this.state.screen === "thread" && this.state.selectedAgentId) {
      await this.sendMessage(this.state.selectedAgentId, input);
      return;
    }
    await this.createAgent(input);
  }

  /**
   * 创建当前文件夹的新 agent。
   * @param input composer 输入。
   */
  async createAgent(input: ComposerInput): Promise<void> {
    if (!this.client || !this.config.workspacePath) return;
    const text = input.text.trim();
    if (!text) return;
    const provider = input.provider || this.config.defaultProvider() || this.resolveFallbackProvider();
    const model = input.model || this.config.defaultModel() || this.resolveDefaultModel(provider);
    const nativePlanModeId = input.planMode === true ? this.resolveNativePlanMode(provider) : undefined;
    const modeId =
      nativePlanModeId || input.modeId || this.config.defaultMode() || this.resolveDefaultMode(provider);

    this.patchState({ busy: true, error: null });
    try {
      const agent = await this.asAgentClient().createAgent({
        provider,
        cwd: this.config.workspacePath,
        initialPrompt: this.applyPlanPrefix(text, input.planMode === true && !nativePlanModeId),
        ...(model ? { model } : {}),
        ...(modeId ? { modeId } : {}),
        ...this.resolveAttachmentOptions(input),
      });
      const view = mapAgent(agent as AgentSnapshotLike);
      this.patchState({
        screen: "thread",
        selectedAgentId: view.id,
        agents: upsertAgent(this.state.agents, view, this.config.workspacePath),
      });
      await this.openAgent(view.id);
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    } finally {
      this.patchState({ busy: false });
    }
  }

  /**
   * 打开 agent 并加载 timeline。
   * @param agentId agent ID。
   */
  async openAgent(agentId: string): Promise<void> {
    if (!this.client) return;
    this.patchState({ screen: "thread", selectedAgentId: agentId, busy: true, error: null });
    try {
      const payload = await this.client.fetchAgentTimeline(agentId, {
        direction: "tail",
        limit: 200,
        projection: "projected",
      });
      const timeline = reduceTimelineEntries(
        payload.entries.map((entry, index) => ({
          item: entry.item,
          timestamp: entry.timestamp,
          idSeed: `${entry.seqStart}-${entry.seqEnd}-${index}`,
          provider: entry.provider,
          seqStart: entry.seqStart,
          seqEnd: entry.seqEnd,
        })),
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
   * 兼容旧调用名称，选择 agent 并加载 timeline。
   * @param agentId agent ID。
   */
  async selectAgent(agentId: string): Promise<void> {
    await this.openAgent(agentId);
  }

  /**
   * 发送用户消息。
   * @param agentId agent ID。
   * @param input composer 输入。
   */
  async sendMessage(agentId: string, input: ComposerInput): Promise<void> {
    if (!this.client) return;
    const text = input.text.trim();
    if (!text) return;
    const agent = this.state.agents.find((entry) => entry.id === agentId) ?? null;
    const provider = agent?.provider ?? input.provider ?? this.resolveFallbackProvider();
    const nativePlanModeId = input.planMode === true ? this.resolveNativePlanMode(provider) : undefined;
    this.patchState({ busy: true, error: null });
    try {
      if (nativePlanModeId && agent?.modeId !== nativePlanModeId) {
        await this.asAgentClient().setAgentMode(agentId, nativePlanModeId);
        this.patchState({
          agents: this.state.agents.map((entry) =>
            entry.id === agentId ? { ...entry, modeId: nativePlanModeId } : entry,
          ),
        });
      }
      await this.asAgentClient().sendAgentMessage(
        agentId,
        this.applyPlanPrefix(text, input.planMode === true && !nativePlanModeId),
        this.resolveAttachmentOptions(input),
      );
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    } finally {
      this.patchState({ busy: false });
    }
  }

  /**
   * 归档 agent。
   * @param agentId agent ID。
   */
  async archiveAgent(agentId: string): Promise<void> {
    if (!this.client) return;
    this.patchState({ busy: true, error: null });
    try {
      const result = await this.asAgentClient().archiveAgent(agentId);
      const archivedAt = result.archivedAt ?? new Date().toISOString();
      this.patchState({
        agents: this.state.agents.map((agent) =>
          agent.id === agentId ? { ...agent, archivedAt, updatedAt: archivedAt } : agent,
        ),
        screen: this.state.selectedAgentId === agentId ? "tasks" : this.state.screen,
        selectedAgentId: this.state.selectedAgentId === agentId ? null : this.state.selectedAgentId,
      });
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    } finally {
      this.patchState({ busy: false });
    }
  }

  /**
   * 停止正在运行的 agent。
   * @param agentId agent ID。
   */
  async cancelAgent(agentId: string): Promise<void> {
    if (!this.client) return;
    this.patchState({ error: null });
    try {
      await this.asAgentClient().cancelAgent(agentId);
      await this.refreshAgents();
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    }
  }

  /**
   * 设置 agent 模型。
   * @param agentId agent ID。
   * @param modelId 模型 ID。
   */
  async setAgentModel(agentId: string, modelId: string): Promise<void> {
    if (!this.client || !modelId) return;
    this.patchState({ error: null });
    try {
      await this.asAgentClient().setAgentModel(agentId, modelId);
      this.patchState({
        agents: this.state.agents.map((agent) =>
          agent.id === agentId ? { ...agent, model: modelId } : agent,
        ),
      });
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    }
  }

  /**
   * 设置 agent 模式。
   * @param agentId agent ID。
   * @param modeId 模式 ID。
   */
  async setAgentMode(agentId: string, modeId: string): Promise<void> {
    if (!this.client || !modeId) return;
    this.patchState({ error: null });
    try {
      await this.asAgentClient().setAgentMode(agentId, modeId);
      this.patchState({
        agents: this.state.agents.map((agent) =>
          agent.id === agentId ? { ...agent, modeId } : agent,
        ),
      });
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    }
  }

  /**
   * 释放 WebSocket client。
   */
  async dispose(): Promise<void> {
    this.log("释放 daemon client，保留 daemon 后台进程");
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
    this.log("开始连接已有 Paseo daemon");

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
      this.log("未找到可连接 daemon，准备离线启动内置 daemon");
      const startResult = await startDaemonDetached({});
      this.log(`内置 daemon 已启动，pid=${startResult.pid ?? "unknown"}，log=${startResult.logPath}`);
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
        this.log(`尝试连接 daemon：${maskHostForLog(host)}`);
        await this.connectHost(host);
        this.log(`daemon 连接成功：${maskHostForLog(host)}`);
        return true;
      } catch (error) {
        this.log(`daemon 连接失败：${maskHostForLog(host)}，原因：${errorToMessage(error)}`);
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
    const password = target.password ?? this.resolveDaemonPassword();
    if (password) {
      this.log(`daemon 连接将携带密码：${target.password ? "来自 host 参数" : "来自配置或环境变量"}`);
    }
    const client = new serverModule.DaemonClient({
      url: target.url,
      clientId: `paseo-vscode-${randomUUID()}`,
      clientType: "browser",
      appVersion: resolveClientAppVersion(this.config.extensionVersion),
      password,
      connectTimeoutMs: 5000,
      reconnect: { enabled: true, baseDelayMs: 1000, maxDelayMs: 5000 },
      webSocketFactory: (url, options) => createWebSocket(url, options, target),
    });
    const unsubscribeDaemon = client.subscribe((event) => this.handleDaemonEvent(event));
    try {
      await client.connect();
    } catch (error) {
      unsubscribeDaemon();
      await client.close().catch(() => undefined);
      throw error;
    }
    await this.closeClient();
    this.client = client;
    this.unsubscribeDaemon = unsubscribeDaemon;
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
      this.log(`provider 快照刷新完成：${snapshot.entries.map((entry) => `${entry.provider}:${entry.status}`).join(", ")}`);
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
        filter: { includeArchived: true },
        sort: [{ key: "updated_at", direction: "desc" }],
        page: { limit: 100 },
      });
      const agents = payload.entries
        .map((entry) => mapAgent(entry.agent))
        .filter((agent) => agent.cwd === this.config.workspacePath);
      const selectedAgentId =
        this.state.selectedAgentId && agents.some((agent) => agent.id === this.state.selectedAgentId)
          ? this.state.selectedAgentId
          : null;
      this.patchState({
        agents,
        selectedAgentId,
        screen: selectedAgentId ? this.state.screen : "tasks",
      });
      this.log(`agent 列表刷新完成，当前文件夹 agent 数量=${agents.length}`);
    } catch (error) {
      this.patchState({ error: errorToMessage(error) });
    }
  }

  /**
   * 处理 daemon 推送事件。
   * @param event daemon 事件。
   */
  private handleDaemonEvent(event: DaemonEvent): void {
    const rawEvent = event as unknown as Record<string, unknown>;
    if (event.type === "agent_stream") {
      const streamEvent = event.event as unknown as Record<string, unknown>;
      const patch: Partial<PaseoViewState> = {};
      const agentPatch = resolveAgentPatchFromStreamEvent(streamEvent, event.timestamp);
      if (agentPatch) {
        patch.agents = this.state.agents.map((agent) =>
          agent.id === event.agentId ? { ...agent, ...agentPatch } : agent,
        );
      }
      if (event.agentId === this.state.selectedAgentId) {
        const timeline = appendTimelineStreamEvent(this.state.timeline, event.event, event.timestamp, event.seq);
        if (timeline !== this.state.timeline) {
          patch.timeline = timeline;
        }
      }
      if (patch.agents || patch.timeline) {
        this.patchState(patch);
      }
      return;
    }

    if (event.type === "agent_update" && event.payload.kind === "upsert") {
      const agent = mapAgent(event.payload.agent);
      this.patchState({ agents: upsertAgent(this.state.agents, agent, this.config.workspacePath) });
      return;
    }

    if (rawEvent.type === "providers_snapshot_update") {
      this.handleProvidersSnapshotUpdate(rawEvent.payload);
      return;
    }

    if (rawEvent.type === "agent_archived") {
      const payload = isRecord(rawEvent.payload) ? rawEvent.payload : {};
      const agentId = readString(payload.agentId);
      const archivedAt = readString(payload.archivedAt) || new Date().toISOString();
      this.patchState({
        agents: this.state.agents.map((agent) =>
          agent.id === agentId ? { ...agent, archivedAt, updatedAt: archivedAt } : agent,
        ),
        selectedAgentId: this.state.selectedAgentId === agentId ? null : this.state.selectedAgentId,
        screen: this.state.selectedAgentId === agentId ? "tasks" : this.state.screen,
      });
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
   * 处理 provider 快照增量更新。
   * @param payload daemon 推送的 provider 快照。
   */
  private handleProvidersSnapshotUpdate(payload: unknown): void {
    if (!isRecord(payload)) return;
    const cwd = readString(payload.cwd);
    if (cwd && cwd !== this.config.workspacePath) return;
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    this.patchState({
      providers: entries
        .filter(isRecord)
        .map((entry) => mapProvider(entry as unknown as Parameters<typeof mapProvider>[0])),
    });
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
   * 解析 daemon 明文密码。
   */
  private resolveDaemonPassword(): string | undefined {
    return this.config.daemonPassword().trim() || process.env.PASEO_PASSWORD?.trim() || undefined;
  }

  /**
   * 更新视图状态。
   * @param patch 局部状态补丁。
   */
  private patchState(patch: Partial<PaseoViewState>): void {
    this.state = this.withDerivedState({
      ...this.state,
      ...patch,
      daemon: patch.daemon ? patch.daemon : this.state.daemon,
    });
    this.config.onStateChange(this.state);
  }

  /**
   * 补齐派生状态。
   * @param state 待补齐状态。
   */
  private withDerivedState(state: PaseoViewState): PaseoViewState {
    const selectedAgent =
      state.selectedAgentId === null
        ? null
        : (state.agents.find((agent) => agent.id === state.selectedAgentId) ?? null);
    return {
      ...state,
      selectedAgent,
      runningCount: state.agents.filter((agent) => isAgentRunning(agent) && !agent.archivedAt).length,
      composerDefaults: this.resolveComposerDefaults(state.providers, selectedAgent),
      settingsSummary: this.resolveSettingsSummary(state),
    };
  }

  /**
   * 解析 composer 默认值。
   * @param providers provider 列表。
   * @param selectedAgent 当前选中 agent。
   */
  private resolveComposerDefaults(
    providers: ProviderView[],
    selectedAgent: AgentView | null,
  ): ComposerDefaultsView {
    const provider = this.resolveDefaultProvider(providers, selectedAgent);
    const model =
      this.config.defaultModel() ||
      selectedAgent?.model ||
      providers.find((entry) => entry.provider === provider)?.models.find((entry) => entry.isDefault)?.id ||
      "";
    const modeId =
      this.config.defaultMode() ||
      selectedAgent?.modeId ||
      providers.find((entry) => entry.provider === provider)?.defaultModeId ||
      providers.find((entry) => entry.provider === provider)?.modes.find((entry) => entry.isDefault)?.id ||
      "";
    return { provider, model, modeId };
  }

  /**
   * 解析默认 provider。
   * @param providers provider 列表。
   * @param selectedAgent 当前选中 agent。
   */
  private resolveDefaultProvider(providers: ProviderView[], selectedAgent: AgentView | null): string {
    const configuredProvider = this.config.defaultProvider();
    if (configuredProvider) return configuredProvider;
    if (selectedAgent?.provider) return selectedAgent.provider;

    const readyProviders = providers.filter((entry) => entry.status === "ready");
    const mockProvider = providers.find((entry) => entry.provider === "mock");
    return (
      mockProvider?.provider ||
      readyProviders.find((entry) => entry.models.length > 0)?.provider ||
      readyProviders[0]?.provider ||
      providers[0]?.provider ||
      "codex"
    );
  }

  /**
   * 解析设置摘要。
   * @param state 当前状态。
   */
  private resolveSettingsSummary(state: PaseoViewState): SettingsSummaryView {
    return {
      daemonHost: state.daemon.host,
      daemonLogPath: state.daemon.logPath,
      defaultProvider: this.config.defaultProvider(),
      defaultModel: this.config.defaultModel(),
      defaultMode: this.config.defaultMode(),
    };
  }

  /**
   * 解析附加上下文参数。
   * @param input composer 输入。
   */
  private resolveAttachmentOptions(input: ComposerInput): Record<string, unknown> {
    const attachments: Array<Record<string, unknown>> = [];
    if (input.includeIdeContext) {
      const text = this.config.ideContext();
      if (text?.trim()) {
        attachments.push({
          type: "text",
          mimeType: "text/plain",
          title: "IDE context",
          text,
        });
      }
    }
    return attachments.length > 0 ? { attachments } : {};
  }

  /**
   * 给计划模式追加文本约束。
   * @param text 原始消息。
   * @param enabled 是否启用计划模式。
   */
  private applyPlanPrefix(text: string, enabled: boolean): string {
    if (!enabled) return text;
    return ["请先只制定计划，不要修改文件或执行会改变仓库状态的命令。", text].join("\n\n");
  }

  /**
   * 获取带额外方法的 daemon client。
   */
  private asAgentClient(): AgentClientLike {
    if (!this.client) {
      throw new Error("Paseo daemon 未连接");
    }
    return this.client as unknown as AgentClientLike;
  }

  /**
   * 推导 fallback provider。
   */
  private resolveFallbackProvider(): string {
    const readyProviders = this.state.providers.filter((provider) => provider.status === "ready");
    return (
      this.state.providers.find((provider) => provider.provider === "mock")?.provider ??
      readyProviders[0]?.provider ??
      "codex"
    );
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

  /**
   * 查找 provider 原生计划模式。
   * @param provider provider ID。
   */
  private resolveNativePlanMode(provider: string): string | undefined {
    const entry = this.state.providers.find((candidate) => candidate.provider === provider);
    return entry?.modes.find((mode) => {
      const id = mode.id.toLowerCase();
      const label = mode.label.toLowerCase();
      return (
        id === "plan" ||
        id === "planning" ||
        id.includes("plan") ||
        label.includes("plan") ||
        mode.label.includes("计划")
      );
    })?.id;
  }

  /**
   * 写入扩展日志。
   * @param message 日志消息。
   */
  private log(message: string): void {
    this.config.log(message);
  }
}
