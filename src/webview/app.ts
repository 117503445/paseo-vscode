import type {
  CreateAgentInput,
  ExtensionToWebviewMessage,
  PaseoViewState,
  ProviderView,
  SendMessageInput,
  WebviewToExtensionMessage,
} from "../paseo/types";

declare const acquireVsCodeApi: () => {
  postMessage: (message: WebviewToExtensionMessage) => void;
};

const vscode = acquireVsCodeApi();
const root = document.getElementById("app") as HTMLElement;
let state: PaseoViewState | null = null;
let newAgentPromptDraft = "";
let messageDraft = "";

window.addEventListener("message", (event: MessageEvent<ExtensionToWebviewMessage>) => {
  if (event.data.type !== "state") return;
  state = event.data.state;
  render(state);
});

vscode.postMessage({ type: "ready" });

/**
 * 渲染完整视图。
 * @param nextState Extension Host 推送的状态。
 */
function render(nextState: PaseoViewState): void {
  root.innerHTML = "";
  root.append(
    renderStatus(nextState),
    renderNewAgent(nextState),
    renderMain(nextState),
    renderComposer(nextState),
  );
}

/**
 * 渲染顶部状态。
 * @param nextState 当前视图状态。
 */
function renderStatus(nextState: PaseoViewState): HTMLElement {
  const section = el("section", "status");
  section.dataset.testid = "paseo-status";

  const main = el("div", "status-main");
  const label = el("div", "status-text", statusLabel(nextState));
  label.dataset.testid = "paseo-daemon-status";
  const actions = el("div", "actions");
  actions.append(
    button("↻", "刷新", () => vscode.postMessage({ type: "refresh" })),
    button("⟳", "重连", () => vscode.postMessage({ type: "reconnect" })),
  );
  main.append(label, actions);

  const folder = el("div", "muted", nextState.workspacePath ?? "未打开文件夹");
  folder.dataset.testid = "paseo-workspace";
  section.append(main, folder);

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
 * 渲染新建 agent 表单。
 * @param nextState 当前视图状态。
 */
function renderNewAgent(nextState: PaseoViewState): HTMLElement {
  const section = el("section", "new-agent");
  section.dataset.testid = "paseo-new-agent";
  const readyProviders = nextState.providers.filter((provider) => provider.status === "ready");
  const providers = readyProviders.length > 0 ? readyProviders : nextState.providers;
  const providerSelect = select(
    "provider",
    providers.map((provider) => ({ id: provider.provider, label: provider.label })),
  );
  providerSelect.dataset.testid = "paseo-provider-select";

  const modelSelect = select("model", []);
  modelSelect.dataset.testid = "paseo-model-select";
  const modeSelect = select("mode", []);
  modeSelect.dataset.testid = "paseo-mode-select";
  fillProviderDependentOptions(nextState, providerSelect, modelSelect, modeSelect);
  providerSelect.addEventListener("change", () => {
    fillProviderDependentOptions(nextState, providerSelect, modelSelect, modeSelect);
  });

  const prompt = document.createElement("textarea");
  prompt.placeholder = "New agent prompt";
  prompt.value = newAgentPromptDraft;
  prompt.dataset.testid = "paseo-new-agent-prompt";
  prompt.addEventListener("input", () => {
    newAgentPromptDraft = prompt.value;
  });

  const submit = button("新建", "新建 agent", () => {
    const input: CreateAgentInput = {
      provider: providerSelect.value,
      model: modelSelect.value || undefined,
      modeId: modeSelect.value || undefined,
      prompt: newAgentPromptDraft.trim(),
    };
    if (!input.prompt) return;
    vscode.postMessage({ type: "createAgent", input });
    newAgentPromptDraft = "";
    prompt.value = "";
  });
  submit.dataset.testid = "paseo-create-agent";
  submit.disabled = !nextState.workspacePath || nextState.daemon.status !== "connected" || nextState.busy;

  section.append(providerSelect, modelSelect, modeSelect, prompt, submit);
  return section;
}

/**
 * 渲染 agent 列表和 timeline。
 * @param nextState 当前视图状态。
 */
function renderMain(nextState: PaseoViewState): HTMLElement {
  const wrapper = el("main", "");
  wrapper.style.minHeight = "0";
  wrapper.style.display = "grid";
  wrapper.style.gridTemplateRows = "auto 1fr";
  wrapper.append(renderAgents(nextState), renderTimeline(nextState));
  return wrapper;
}

/**
 * 渲染 agent 列表。
 * @param nextState 当前视图状态。
 */
function renderAgents(nextState: PaseoViewState): HTMLElement {
  const section = el("section", "agents");
  section.dataset.testid = "paseo-agent-list";
  if (nextState.agents.length === 0) {
    section.append(el("div", "muted", nextState.workspacePath ? "暂无 agent" : "未打开文件夹"));
    return section;
  }
  for (const agent of nextState.agents) {
    const item = button("", agent.title, () =>
      vscode.postMessage({ type: "selectAgent", agentId: agent.id }),
    );
    item.className = `agent${agent.id === nextState.selectedAgentId ? " active" : ""}`;
    item.dataset.testid = "paseo-agent";
    item.dataset.agentId = agent.id;
    item.innerHTML = "";
    item.append(
      el("div", "agent-title", agent.title),
      el("div", "muted", agent.status),
      el("div", "muted", agent.provider),
      el("div", "muted", formatTime(agent.updatedAt)),
    );
    section.append(item);
  }
  return section;
}

/**
 * 渲染 timeline。
 * @param nextState 当前视图状态。
 */
function renderTimeline(nextState: PaseoViewState): HTMLElement {
  const section = el("section", "timeline");
  section.dataset.testid = "paseo-timeline";
  if (!nextState.selectedAgentId) {
    section.append(el("div", "muted", "请选择或创建 agent"));
    return section;
  }
  for (const item of nextState.timeline) {
    const block = el("article", "item");
    block.dataset.testid = `paseo-timeline-${item.type}`;
    block.append(el("div", "item-header", item.type), el("div", "item-text", item.text));
    section.append(block);
  }
  queueMicrotask(() => {
    section.scrollTop = section.scrollHeight;
  });
  return section;
}

/**
 * 渲染消息输入区。
 * @param nextState 当前视图状态。
 */
function renderComposer(nextState: PaseoViewState): HTMLElement {
  const section = el("section", "composer");
  const input = document.createElement("textarea");
  input.placeholder = "Message";
  input.value = messageDraft;
  input.dataset.testid = "paseo-message-input";
  input.addEventListener("input", () => {
    messageDraft = input.value;
  });
  const send = button("发送", "发送消息", () => {
    if (!nextState.selectedAgentId) return;
    const payload: SendMessageInput = {
      agentId: nextState.selectedAgentId,
      text: messageDraft.trim(),
    };
    if (!payload.text) return;
    vscode.postMessage({ type: "sendMessage", input: payload });
    messageDraft = "";
    input.value = "";
  });
  send.dataset.testid = "paseo-send-message";
  send.disabled =
    !nextState.selectedAgentId || nextState.daemon.status !== "connected" || nextState.busy;
  section.append(input, send);
  return section;
}

/**
 * 根据 provider 更新 model/mode 选项。
 * @param nextState 当前视图状态。
 * @param providerSelect provider 选择框。
 * @param modelSelect model 选择框。
 * @param modeSelect mode 选择框。
 */
function fillProviderDependentOptions(
  nextState: PaseoViewState,
  providerSelect: HTMLSelectElement,
  modelSelect: HTMLSelectElement,
  modeSelect: HTMLSelectElement,
): void {
  const provider = nextState.providers.find((entry) => entry.provider === providerSelect.value);
  fillSelect(modelSelect, provider?.models ?? []);
  fillSelect(modeSelect, provider?.modes ?? []);
}

/**
 * 填充 select options。
 * @param target select 元素。
 * @param options 选项列表。
 */
function fillSelect(target: HTMLSelectElement, options: Array<{ id: string; label: string; isDefault?: boolean }>): void {
  target.innerHTML = "";
  target.append(new Option("-", ""));
  for (const option of options) {
    const item = new Option(option.label, option.id, option.isDefault === true, option.isDefault === true);
    target.append(item);
  }
}

/**
 * 创建 select 元素。
 * @param name select 名称。
 * @param options 选项列表。
 */
function select(name: string, options: Array<{ id: string; label: string }>): HTMLSelectElement {
  const target = document.createElement("select");
  target.name = name;
  fillSelect(target, options.map((option) => ({ ...option, isDefault: false })));
  return target;
}

/**
 * 创建按钮。
 * @param text 按钮文本。
 * @param title tooltip。
 * @param onClick 点击处理函数。
 */
function button(text: string, title: string, onClick: () => void): HTMLButtonElement {
  const target = document.createElement("button");
  target.type = "button";
  target.textContent = text;
  target.title = title;
  target.addEventListener("click", onClick);
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
 * 格式化时间。
 * @param value ISO 时间字符串。
 */
function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

void state;
