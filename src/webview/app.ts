import type {
  AgentView,
  ComposerInput,
  ExtensionToWebviewMessage,
  PaseoViewState,
  ProviderView,
  SelectOptionView,
  TaskFilter,
  TimelineItemView,
  WebviewToExtensionMessage,
} from "../paseo/types";

declare const acquireVsCodeApi: () => {
  /**
   * 向 Extension Host 发送消息。
   * @param message Webview 消息。
   */
  postMessage: (message: WebviewToExtensionMessage) => void;
};

const vscode = acquireVsCodeApi();
const root = document.getElementById("app") as HTMLElement;
let state: PaseoViewState | null = null;
let composerDraft = "";
let includeIdeContext = true;
let planMode = false;
let composerMenuOpen = false;
let composerProvider = "";
let composerModel = "";
let composerMode = "";

window.addEventListener("message", (event: MessageEvent<ExtensionToWebviewMessage>) => {
  if (event.data.type !== "state") return;
  state = event.data.state;
  syncComposerDefaults(state);
  render(state);
});

vscode.postMessage({ type: "ready" });

/**
 * 渲染完整视图。
 * @param nextState Extension Host 推送的状态。
 */
function render(nextState: PaseoViewState): void {
  root.innerHTML = "";
  root.append(renderHeader(nextState), renderContent(nextState), renderComposer(nextState));
}

/**
 * 渲染顶部区域。
 * @param nextState 当前视图状态。
 */
function renderHeader(nextState: PaseoViewState): HTMLElement {
  const section = el("section", "topbar");
  section.dataset.testid = "paseo-status";
  if (nextState.screen === "thread" && nextState.selectedAgent) {
    const back = iconButton("‹", "返回任务", () => vscode.postMessage({ type: "backToTasks" }));
    back.dataset.testid = "paseo-back-to-tasks";
    const title = button(nextState.selectedAgent.title, "当前任务", () => undefined);
    title.className = "title-button";
    section.append(back, title, renderRunningCount(nextState), renderTopActions());
  } else {
    section.append(el("div", "title", "任务"), renderRunningCount(nextState), renderTopActions());
  }

  const meta = el("div", "status-line");
  const status = el("span", "status-pill", statusLabel(nextState));
  status.dataset.testid = "paseo-daemon-status";
  meta.append(status, el("span", "muted", nextState.workspacePath ?? "未打开文件夹"));
  section.append(meta);

  if (nextState.daemon.message) {
    section.append(el("div", "muted", nextState.daemon.message));
  }
  if (nextState.error) {
    const error = el("div", "error", nextState.error);
    error.dataset.testid = "paseo-error";
    section.append(error);
  }
  return section;
}

/**
 * 渲染顶部运行中计数。
 * @param nextState 当前视图状态。
 */
function renderRunningCount(nextState: PaseoViewState): HTMLElement {
  const target = button(`${nextState.runningCount} 正在进行中`, "运行中的任务", () =>
    vscode.postMessage({ type: "setTaskFilter", filter: "running" }),
  );
  target.className = "count-button";
  target.dataset.testid = "paseo-running-count";
  return target;
}

/**
 * 渲染顶部操作。
 */
function renderTopActions(): HTMLElement {
  const actions = el("div", "top-actions");
  actions.append(
    iconButton("↻", "刷新", () => vscode.postMessage({ type: "refresh" })),
    iconButton("⚙", "设置", () => vscode.postMessage({ type: "openSettings" })),
    iconButton("✎", "新任务", () => vscode.postMessage({ type: "backToTasks" })),
  );
  return actions;
}

/**
 * 渲染主内容。
 * @param nextState 当前视图状态。
 */
function renderContent(nextState: PaseoViewState): HTMLElement {
  if (nextState.screen === "thread" && nextState.selectedAgent) {
    return renderThread(nextState, nextState.selectedAgent);
  }
  return renderTasks(nextState);
}

/**
 * 渲染任务列表。
 * @param nextState 当前视图状态。
 */
function renderTasks(nextState: PaseoViewState): HTMLElement {
  const section = el("main", "task-view");
  section.dataset.testid = "paseo-task-view";
  section.append(renderTaskFilters(nextState));
  const list = el("div", "task-list");
  list.dataset.testid = "paseo-task-list";
  const tasks = filterTasks(nextState);
  if (tasks.length === 0) {
    list.append(el("div", "empty", nextState.workspacePath ? "暂无任务" : "需要先打开文件夹"));
  }
  for (const agent of tasks) {
    list.append(renderTaskItem(agent));
  }
  section.append(list);
  return section;
}

/**
 * 渲染任务过滤器。
 * @param nextState 当前视图状态。
 */
function renderTaskFilters(nextState: PaseoViewState): HTMLElement {
  const filters = el("div", "filters");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "搜索任务";
  search.value = nextState.searchQuery;
  search.dataset.testid = "paseo-task-search";
  search.addEventListener("input", () => {
    vscode.postMessage({ type: "setSearchQuery", query: search.value });
  });
  filters.append(search);
  const modes: Array<{ id: TaskFilter; label: string }> = [
    { id: "all", label: "全部" },
    { id: "running", label: "运行中" },
    { id: "archived", label: "已归档" },
  ];
  const group = el("div", "segmented");
  for (const mode of modes) {
    const item = button(mode.label, mode.label, () =>
      vscode.postMessage({ type: "setTaskFilter", filter: mode.id }),
    );
    item.className = mode.id === nextState.taskFilter ? "active" : "";
    group.append(item);
  }
  filters.append(group);
  return filters;
}

/**
 * 渲染单个任务。
 * @param agent agent 摘要。
 */
function renderTaskItem(agent: AgentView): HTMLElement {
  const item = button("", agent.title, () => vscode.postMessage({ type: "openAgent", agentId: agent.id }));
  item.className = "task-item";
  item.dataset.testid = "paseo-task-item";
  item.dataset.agentId = agent.id;
  item.innerHTML = "";
  const main = el("div", "task-main");
  main.append(el("div", "task-title", agent.title), el("div", "muted", `${agent.provider} · ${agent.status}`));
  const side = el("div", "task-side");
  side.append(el("div", "muted", formatRelativeTime(agent.updatedAt)));
  if (!agent.archivedAt) {
    const archive = iconButton("×", "归档任务", (event) => {
      event.stopPropagation();
      vscode.postMessage({ type: "archiveAgent", agentId: agent.id });
    });
    archive.dataset.testid = "paseo-archive-agent";
    side.append(archive);
  }
  item.append(main, side);
  return item;
}

/**
 * 渲染线程页。
 * @param nextState 当前视图状态。
 * @param agent 当前 agent。
 */
function renderThread(nextState: PaseoViewState, agent: AgentView): HTMLElement {
  const section = el("main", "thread-view");
  section.dataset.testid = "paseo-thread-view";
  const timeline = el("div", "timeline");
  timeline.dataset.testid = "paseo-timeline";
  if (nextState.timeline.length === 0) {
    timeline.append(el("div", "empty", "等待任务输出"));
  }
  for (const item of nextState.timeline) {
    timeline.append(renderTimelineItem(item));
  }
  if (isAgentRunning(agent) || nextState.busy) {
    timeline.append(renderProcessingGroup(agent));
  }
  section.append(timeline);
  queueMicrotask(() => {
    timeline.scrollTop = timeline.scrollHeight;
  });
  return section;
}

/**
 * 渲染 timeline item。
 * @param item timeline item。
 */
function renderTimelineItem(item: TimelineItemView): HTMLElement {
  if (item.type === "user") {
    const block = el("article", "message user-message");
    block.dataset.testid = "paseo-message-user";
    block.append(el("div", "message-label", item.title ?? "用户提示提交"), el("div", "bubble", item.text));
    return block;
  }
  if (item.type === "assistant") {
    const block = el("article", "message assistant-message");
    block.dataset.testid = "paseo-message-assistant";
    block.append(el("div", "message-text", item.text), renderMessageActions());
    return block;
  }
  const details = document.createElement("details");
  details.className = item.type === "error" ? "processing error-block" : "processing";
  details.open = item.type === "error";
  details.dataset.testid = "paseo-processing-group";
  const summary = document.createElement("summary");
  summary.textContent = `${item.title ?? "已处理"}${item.status ? ` ${item.status}` : ""}`;
  details.append(summary, el("pre", "processing-body", item.text));
  return details;
}

/**
 * 渲染运行中处理分组。
 * @param agent 当前 agent。
 */
function renderProcessingGroup(agent: AgentView): HTMLElement {
  const details = document.createElement("details");
  details.className = "processing";
  details.dataset.testid = "paseo-processing-group";
  const summary = document.createElement("summary");
  summary.textContent = agent.status === "running" ? "正在处理" : "准备中";
  details.append(summary, el("div", "processing-body", "等待 daemon 推送任务事件"));
  return details;
}

/**
 * 渲染 assistant 消息操作。
 */
function renderMessageActions(): HTMLElement {
  const actions = el("div", "message-actions");
  actions.append(iconButton("⧉", "复制", () => undefined), iconButton("↳", "继续", () => undefined));
  return actions;
}

/**
 * 渲染 composer。
 * @param nextState 当前视图状态。
 */
function renderComposer(nextState: PaseoViewState): HTMLElement {
  const section = el("section", "composer");
  const input = document.createElement("textarea");
  input.placeholder = nextState.selectedAgentId ? "要求后续变更" : "问 Paseo 任何事";
  input.value = composerDraft;
  input.dataset.testid = "paseo-composer-input";
  input.addEventListener("input", () => {
    composerDraft = input.value;
    syncComposerSubmitState(nextState);
  });
  section.append(input, renderComposerControls(nextState, input));
  if (composerMenuOpen) {
    section.append(renderComposerMenu());
  }
  return section;
}

/**
 * 同步 composer 发送按钮可用状态。
 * @param nextState 当前视图状态。
 */
function syncComposerSubmitState(nextState: PaseoViewState): void {
  const send = root.querySelector<HTMLButtonElement>('[data-testid="paseo-composer-send"]');
  if (!send) return;
  send.disabled =
    nextState.daemon.status !== "connected" || nextState.busy || composerDraft.trim().length === 0;
}

/**
 * 渲染 composer 控制栏。
 * @param nextState 当前视图状态。
 * @param input 输入框。
 */
function renderComposerControls(nextState: PaseoViewState, input: HTMLTextAreaElement): HTMLElement {
  const controls = el("div", "composer-controls");
  const providerSelect = renderProviderSelect(nextState);
  const modelSelect = renderModelSelect(nextState);
  const modeSelect = renderModeSelect(nextState);
  const menu = iconButton("+", "添加文件等", () => {
    composerMenuOpen = !composerMenuOpen;
    render(nextState);
  });
  menu.dataset.testid = "paseo-composer-menu";
  const running = Boolean(nextState.selectedAgent && isAgentRunning(nextState.selectedAgent));
  const submit = running
    ? iconButton("■", "停止", () => {
        if (nextState.selectedAgentId) {
          vscode.postMessage({ type: "cancelAgent", agentId: nextState.selectedAgentId });
        }
      })
    : iconButton("↑", "发送", () => sendComposer(nextState, input));
  submit.dataset.testid = running ? "paseo-composer-stop" : "paseo-composer-send";
  submit.disabled =
    nextState.daemon.status !== "connected" ||
    nextState.busy ||
    (!running && composerDraft.trim().length === 0);
  controls.append(menu, providerSelect, modeSelect, modelSelect, submit);
  return controls;
}

/**
 * 渲染 provider 选择。
 * @param nextState 当前视图状态。
 */
function renderProviderSelect(nextState: PaseoViewState): HTMLSelectElement {
  const readyProviders = nextState.providers.filter((provider) => provider.status === "ready");
  const providers = readyProviders.length > 0 ? readyProviders : nextState.providers;
  const select = createSelect(
    providers.map((provider) => ({ id: provider.provider, label: provider.label, isDefault: false })),
    composerProvider,
  );
  select.dataset.testid = "paseo-composer-provider";
  select.disabled = Boolean(nextState.selectedAgentId);
  select.addEventListener("change", () => {
    composerProvider = select.value;
    composerModel = defaultModelForProvider(nextState, composerProvider);
    composerMode = defaultModeForProvider(nextState, composerProvider);
    render(nextState);
  });
  return select;
}

/**
 * 渲染模型选择。
 * @param nextState 当前视图状态。
 */
function renderModelSelect(nextState: PaseoViewState): HTMLSelectElement {
  const provider = findComposerProvider(nextState);
  const select = createSelect(provider?.models ?? [], composerModel);
  select.dataset.testid = "paseo-composer-model";
  select.addEventListener("change", () => {
    composerModel = select.value;
    if (nextState.selectedAgentId && select.value) {
      vscode.postMessage({ type: "setAgentModel", agentId: nextState.selectedAgentId, modelId: select.value });
    }
  });
  return select;
}

/**
 * 渲染模式选择。
 * @param nextState 当前视图状态。
 */
function renderModeSelect(nextState: PaseoViewState): HTMLSelectElement {
  const provider = findComposerProvider(nextState);
  const select = createSelect(provider?.modes ?? [], composerMode);
  select.dataset.testid = "paseo-composer-mode";
  select.addEventListener("change", () => {
    composerMode = select.value;
    if (nextState.selectedAgentId && select.value) {
      vscode.postMessage({ type: "setAgentMode", agentId: nextState.selectedAgentId, modeId: select.value });
    }
  });
  return select;
}

/**
 * 渲染 composer 菜单。
 */
function renderComposerMenu(): HTMLElement {
  const menu = el("div", "composer-menu");
  menu.append(
    menuCheckbox("包含 IDE 背景信息", includeIdeContext, "paseo-toggle-ide-context", (checked) => {
      includeIdeContext = checked;
    }),
    menuCheckbox("计划模式", planMode, "paseo-toggle-plan-mode", (checked) => {
      planMode = checked;
    }),
    el("button", "menu-item disabled", "添加当前文件/选区"),
  );
  return menu;
}

/**
 * 渲染菜单复选项。
 * @param label 展示文案。
 * @param checked 是否选中。
 * @param testid 测试 ID。
 * @param onChange 变更回调。
 */
function menuCheckbox(
  label: string,
  checked: boolean,
  testid: string,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const wrapper = el("label", "menu-item");
  wrapper.dataset.testid = testid;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => {
    onChange(input.checked);
    vscode.postMessage({
      type: "toggleComposerOption",
      option: testid.includes("plan") ? "planMode" : "includeIdeContext",
      enabled: input.checked,
    });
  });
  wrapper.append(input, document.createTextNode(label));
  return wrapper;
}

/**
 * 发送 composer 内容。
 * @param nextState 当前视图状态。
 * @param input 输入框。
 */
function sendComposer(nextState: PaseoViewState, input: HTMLTextAreaElement): void {
  const payload: ComposerInput = {
    text: composerDraft.trim(),
    provider: composerProvider || nextState.composerDefaults.provider,
    model: composerModel || undefined,
    modeId: composerMode || undefined,
    includeIdeContext,
    planMode,
  };
  if (!payload.text) return;
  vscode.postMessage({ type: "sendComposer", input: payload });
  composerDraft = "";
  input.value = "";
  composerMenuOpen = false;
}

/**
 * 根据状态同步 composer 默认值。
 * @param nextState 当前视图状态。
 */
function syncComposerDefaults(nextState: PaseoViewState): void {
  if (!composerProvider) composerProvider = nextState.composerDefaults.provider;
  if (!composerModel) composerModel = nextState.composerDefaults.model;
  if (!composerMode) composerMode = nextState.composerDefaults.modeId;
  if (nextState.selectedAgent) {
    composerProvider = nextState.selectedAgent.provider;
    composerModel = nextState.selectedAgent.model ?? nextState.composerDefaults.model;
    composerMode = nextState.selectedAgent.modeId ?? nextState.composerDefaults.modeId;
  }
}

/**
 * 过滤任务。
 * @param nextState 当前视图状态。
 */
function filterTasks(nextState: PaseoViewState): AgentView[] {
  const query = nextState.searchQuery.trim().toLowerCase();
  return nextState.agents.filter((agent) => {
    if (nextState.taskFilter === "running" && !isAgentRunning(agent)) return false;
    if (nextState.taskFilter === "archived" && !agent.archivedAt) return false;
    if (nextState.taskFilter === "all" && agent.archivedAt) return false;
    if (!query) return true;
    return [agent.title, agent.provider, agent.status].join(" ").toLowerCase().includes(query);
  });
}

/**
 * 查找 composer provider。
 * @param nextState 当前视图状态。
 */
function findComposerProvider(nextState: PaseoViewState): ProviderView | undefined {
  return nextState.providers.find((provider) => provider.provider === composerProvider);
}

/**
 * 查询 provider 默认模型。
 * @param nextState 当前视图状态。
 * @param provider provider ID。
 */
function defaultModelForProvider(nextState: PaseoViewState, provider: string): string {
  return nextState.providers.find((entry) => entry.provider === provider)?.models.find((entry) => entry.isDefault)?.id ?? "";
}

/**
 * 查询 provider 默认模式。
 * @param nextState 当前视图状态。
 * @param provider provider ID。
 */
function defaultModeForProvider(nextState: PaseoViewState, provider: string): string {
  const entry = nextState.providers.find((candidate) => candidate.provider === provider);
  return entry?.defaultModeId ?? entry?.modes.find((mode) => mode.isDefault)?.id ?? "";
}

/**
 * 创建 select。
 * @param options 选项。
 * @param value 当前值。
 */
function createSelect(options: SelectOptionView[], value: string): HTMLSelectElement {
  const target = document.createElement("select");
  target.append(new Option("-", ""));
  for (const option of options) {
    target.append(new Option(option.label, option.id, option.id === value, option.id === value));
  }
  target.value = value;
  return target;
}

/**
 * 创建按钮。
 * @param text 按钮文本。
 * @param title tooltip。
 * @param onClick 点击处理函数。
 */
function button(text: string, title: string, onClick: (event: MouseEvent) => void): HTMLButtonElement {
  const target = document.createElement("button");
  target.type = "button";
  target.textContent = text;
  target.title = title;
  target.addEventListener("click", onClick);
  return target;
}

/**
 * 创建图标按钮。
 * @param text 按钮文本。
 * @param title tooltip。
 * @param onClick 点击处理函数。
 */
function iconButton(text: string, title: string, onClick: (event: MouseEvent) => void): HTMLButtonElement {
  const target = button(text, title, onClick);
  target.className = "icon-button";
  return target;
}

/**
 * 创建元素。
 * @param tag HTML 标签。
 * @param className CSS class。
 * @param text 文本内容。
 */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const target = document.createElement(tag);
  if (className) target.className = className;
  if (text !== undefined) target.textContent = text;
  return target;
}

/**
 * 生成状态文案。
 * @param nextState 当前视图状态。
 */
function statusLabel(nextState: PaseoViewState): string {
  if (nextState.daemon.status === "connected") return "已连接";
  if (nextState.daemon.status === "starting") return "启动中";
  if (nextState.daemon.status === "connecting") return "连接中";
  if (nextState.daemon.status === "no-workspace") return "未打开文件夹";
  if (nextState.daemon.status === "error") return "连接失败";
  return "未连接";
}

/**
 * 判断 agent 是否运行中。
 * @param agent agent 摘要。
 */
function isAgentRunning(agent: AgentView): boolean {
  return agent.status === "running" || agent.status === "initializing";
}

/**
 * 格式化相对时间。
 * @param value ISO 时间字符串。
 */
function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天`;
}
