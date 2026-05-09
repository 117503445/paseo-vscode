import type { ComposerInput, PaseoViewState, ProviderView, SelectOptionView } from "../paseo/types";
import { button, createSelect, el, iconButton, isAgentRunning, type PostMessage } from "./dom";

/**
 * 管理 composer 的本地草稿和渲染。
 */
export class ComposerController {
  private readonly root: HTMLElement;
  private readonly post: PostMessage;
  private readonly rerender: (state: PaseoViewState) => void;
  private draft = "";
  private includeIdeContext = true;
  private planMode = false;
  private menuOpen = false;
  private provider = "";
  private model = "";
  private mode = "";
  private providerTouched = false;
  private modelTouched = false;
  private modeTouched = false;
  private pendingText: string | null = null;
  private pendingSawBusy = false;

  /**
   * 创建 composer 控制器。
   * @param root Webview 根节点。
   * @param post 向 Extension Host 发送消息的函数。
   * @param rerender 触发当前状态重新渲染的函数。
   */
  constructor(root: HTMLElement, post: PostMessage, rerender: (state: PaseoViewState) => void) {
    this.root = root;
    this.post = post;
    this.rerender = rerender;
  }

  /**
   * 根据状态同步 composer 默认值。
   * @param nextState 当前视图状态。
   */
  syncDefaults(nextState: PaseoViewState): void {
    this.syncPendingSend(nextState);
    if (nextState.selectedAgent) {
      this.provider = nextState.selectedAgent.provider;
      this.model = nextState.selectedAgent.model ?? nextState.composerDefaults.model;
      this.mode = nextState.selectedAgent.modeId ?? nextState.composerDefaults.modeId;
      this.providerTouched = false;
      this.modelTouched = false;
      this.modeTouched = false;
      return;
    }

    const providerOptions = this.renderableProviders(nextState);
    const defaultProvider = this.resolveRenderableProvider(nextState, providerOptions);
    const providerChanged =
      (!this.provider || !this.providerTouched || !this.hasProvider(providerOptions, this.provider)) &&
      this.provider !== defaultProvider;
    if (!this.provider || !this.providerTouched || !this.hasProvider(providerOptions, this.provider)) {
      this.provider = defaultProvider;
      this.providerTouched = false;
    }
    if (providerChanged) {
      this.modelTouched = false;
      this.modeTouched = false;
    }

    const provider = this.findProvider(nextState);
    const modelValid = this.hasOption(provider?.models ?? [], this.model);
    if (!this.model || !this.modelTouched || !modelValid) {
      this.model = this.defaultModelForProvider(nextState, this.provider);
      this.modelTouched = false;
    }

    const modeValid = this.hasOption(provider?.modes ?? [], this.mode);
    if (!this.mode || !this.modeTouched || !modeValid) {
      this.mode = this.defaultModeForProvider(nextState, this.provider);
      this.modeTouched = false;
    }
  }

  /**
   * 渲染 composer。
   * @param nextState 当前视图状态。
   */
  render(nextState: PaseoViewState): HTMLElement {
    const section = el("section", "composer");
    const panel = el("div", "composer-panel");
    const input = document.createElement("textarea");
    input.className = "composer-input";
    input.placeholder = nextState.selectedAgentId ? "要求后续变更" : "问 Paseo 任何事";
    input.value = this.draft;
    input.dataset.testid = "paseo-composer-input";
    input.addEventListener("input", () => {
      this.draft = input.value;
      this.syncSubmitState(nextState);
    });
    panel.append(input, this.renderControls(nextState, input));
    section.append(panel);
    if (this.menuOpen) {
      section.append(this.renderMenu());
    }
    return section;
  }

  /**
   * 同步 composer 发送按钮可用状态。
   * @param nextState 当前视图状态。
   */
  private syncSubmitState(nextState: PaseoViewState): void {
    const send = this.root.querySelector<HTMLButtonElement>('[data-testid="paseo-composer-send"]');
    if (!send) return;
    send.disabled =
      nextState.daemon.status !== "connected" ||
      nextState.busy ||
      this.pendingText !== null ||
      this.draft.trim().length === 0;
  }

  /**
   * 渲染 composer 控制栏。
   * @param nextState 当前视图状态。
   * @param input 输入框。
   */
  private renderControls(nextState: PaseoViewState, input: HTMLTextAreaElement): HTMLElement {
    const controls = el("div", "composer-controls");
    const left = el("div", "composer-left-controls");
    const right = el("div", "composer-right-controls");
    const providerSelect = this.renderProviderSelect(nextState);
    const modelSelect = this.renderModelSelect(nextState);
    const modeSelect = this.renderModeSelect(nextState);
    const menu = iconButton("+", "添加附件和上下文", () => {
      this.menuOpen = !this.menuOpen;
      this.rerender(nextState);
    });
    menu.dataset.testid = "paseo-composer-menu";
    const plan = this.renderPlanModeToggle(nextState);
    const running = Boolean(nextState.selectedAgent && isAgentRunning(nextState.selectedAgent));
    const submit = running
      ? iconButton("■", "停止", () => {
          if (nextState.selectedAgentId) {
            this.post({ type: "cancelAgent", agentId: nextState.selectedAgentId });
          }
        })
      : iconButton("↑", "发送", () => this.send(nextState, input));
    submit.dataset.testid = running ? "paseo-composer-stop" : "paseo-composer-send";
    submit.disabled =
      nextState.daemon.status !== "connected" ||
      nextState.busy ||
      this.pendingText !== null ||
      (!running && this.draft.trim().length === 0);
    left.append(menu, plan);
    right.append(providerSelect, modelSelect, modeSelect, submit);
    controls.append(left, right);
    return controls;
  }

  /**
   * 渲染计划模式切换。
   * @param nextState 当前视图状态。
   */
  private renderPlanModeToggle(nextState: PaseoViewState): HTMLButtonElement {
    const target = button("计划", "计划模式", () => {
      this.planMode = !this.planMode;
      this.post({ type: "toggleComposerOption", option: "planMode", enabled: this.planMode });
      this.rerender(nextState);
    });
    target.className = this.planMode ? "composer-pill active" : "composer-pill";
    target.dataset.testid = "paseo-toggle-plan-mode";
    target.setAttribute("aria-pressed", String(this.planMode));
    return target;
  }

  /**
   * 渲染 provider 选择。
   * @param nextState 当前视图状态。
   */
  private renderProviderSelect(nextState: PaseoViewState): HTMLSelectElement {
    const providers = this.renderableProviders(nextState);
    const select = createSelect(buildComposerProviderPickerOptions(providers), this.provider);
    select.dataset.testid = "paseo-composer-provider";
    select.title = "Provider";
    select.disabled = Boolean(nextState.selectedAgentId);
    select.addEventListener("change", () => {
      this.providerTouched = true;
      this.provider = select.value;
      this.model = this.defaultModelForProvider(nextState, this.provider);
      this.mode = this.defaultModeForProvider(nextState, this.provider);
      this.modelTouched = false;
      this.modeTouched = false;
      this.rerender(nextState);
    });
    return select;
  }

  /**
   * 渲染模型选择。
   * @param nextState 当前视图状态。
   */
  private renderModelSelect(nextState: PaseoViewState): HTMLSelectElement {
    const provider = this.findProvider(nextState);
    const select = createSelect(provider?.models ?? [], this.model);
    select.dataset.testid = "paseo-composer-model";
    select.title = "模型";
    select.addEventListener("change", () => {
      this.modelTouched = true;
      this.model = select.value;
      if (nextState.selectedAgentId && select.value) {
        this.post({ type: "setAgentModel", agentId: nextState.selectedAgentId, modelId: select.value });
      }
    });
    return select;
  }

  /**
   * 渲染模式选择。
   * @param nextState 当前视图状态。
   */
  private renderModeSelect(nextState: PaseoViewState): HTMLSelectElement {
    const provider = this.findProvider(nextState);
    const select = createSelect(provider?.modes ?? [], this.mode);
    select.dataset.testid = "paseo-composer-mode";
    select.title = "思考强度";
    select.addEventListener("change", () => {
      this.modeTouched = true;
      this.mode = select.value;
      if (nextState.selectedAgentId && select.value) {
        this.post({ type: "setAgentMode", agentId: nextState.selectedAgentId, modeId: select.value });
      }
    });
    return select;
  }

  /**
   * 渲染 composer 菜单。
   */
  private renderMenu(): HTMLElement {
    const menu = el("div", "composer-menu");
    menu.append(
      this.menuCheckbox("包含 IDE 背景信息", this.includeIdeContext, "paseo-toggle-ide-context", (checked) => {
        this.includeIdeContext = checked;
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
  private menuCheckbox(
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
      this.post({
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
  private send(nextState: PaseoViewState, input: HTMLTextAreaElement): void {
    const payload: ComposerInput = {
      text: this.draft.trim(),
      provider: this.provider || nextState.composerDefaults.provider,
      model: this.model || undefined,
      modeId: this.mode || undefined,
      includeIdeContext: this.includeIdeContext,
      planMode: this.planMode,
    };
    if (!payload.text) return;
    this.pendingText = payload.text;
    this.pendingSawBusy = false;
    this.post({ type: "sendComposer", input: payload });
    this.menuOpen = false;
    this.rerender(nextState);
  }

  /**
   * 根据 Extension Host 回包确认是否清空待发送草稿。
   * @param nextState 当前视图状态。
   */
  private syncPendingSend(nextState: PaseoViewState): void {
    if (this.pendingText === null) return;
    if (nextState.busy) {
      this.pendingSawBusy = true;
      return;
    }
    if (!this.pendingSawBusy) return;
    if (!nextState.error && this.draft.trim() === this.pendingText) {
      this.draft = "";
    }
    this.pendingText = null;
    this.pendingSawBusy = false;
  }

  /**
   * 查找 composer provider。
   * @param nextState 当前视图状态。
   */
  private findProvider(nextState: PaseoViewState): ProviderView | undefined {
    return nextState.providers.find((provider) => provider.provider === this.provider);
  }

  /**
   * 查询当前应展示的 provider 列表。
   * @param nextState 当前视图状态。
   */
  private renderableProviders(nextState: PaseoViewState): ProviderView[] {
    const readyProviders = nextState.providers.filter((provider) => provider.status === "ready");
    const baseProviders = readyProviders.length > 0 ? readyProviders : nextState.providers;
    const mockProvider = nextState.providers.find((provider) => provider.provider === "mock");
    const providers =
      mockProvider && !baseProviders.some((provider) => provider.provider === "mock")
        ? [mockProvider, ...baseProviders]
        : baseProviders;
    if (!nextState.selectedAgent) return providers;
    if (providers.some((provider) => provider.provider === nextState.selectedAgent?.provider)) return providers;
    const selectedProvider = nextState.providers.find(
      (provider) => provider.provider === nextState.selectedAgent?.provider,
    );
    return selectedProvider ? [selectedProvider, ...providers] : providers;
  }

  /**
   * 解析可展示 provider 默认值。
   * @param nextState 当前视图状态。
   * @param providers 可展示 provider 列表。
   */
  private resolveRenderableProvider(nextState: PaseoViewState, providers: ProviderView[]): string {
    if (this.hasProvider(providers, nextState.composerDefaults.provider)) {
      return nextState.composerDefaults.provider;
    }
    return providers[0]?.provider ?? nextState.composerDefaults.provider;
  }

  /**
   * 判断 provider 是否存在于列表。
   * @param providers provider 列表。
   * @param provider provider ID。
   */
  private hasProvider(providers: ProviderView[], provider: string): boolean {
    return providers.some((entry) => entry.provider === provider);
  }

  /**
   * 判断选项是否存在。
   * @param options 下拉选项。
   * @param value 选项 ID。
   */
  private hasOption(options: Array<{ id: string }>, value: string): boolean {
    return options.some((entry) => entry.id === value);
  }

  /**
   * 查询 provider 默认模型。
   * @param nextState 当前视图状态。
   * @param provider provider ID。
   */
  private defaultModelForProvider(nextState: PaseoViewState, provider: string): string {
    return nextState.providers.find((entry) => entry.provider === provider)?.models.find((entry) => entry.isDefault)?.id ?? "";
  }

  /**
   * 查询 provider 默认模式。
   * @param nextState 当前视图状态。
   * @param provider provider ID。
   */
  private defaultModeForProvider(nextState: PaseoViewState, provider: string): string {
    const entry = nextState.providers.find((candidate) => candidate.provider === provider);
    return entry?.defaultModeId ?? entry?.modes.find((mode) => mode.isDefault)?.id ?? "";
  }
}

/**
 * 构造 composer provider 选择入口的选项。
 * @param providers provider 列表。
 */
export function buildComposerProviderPickerOptions(providers: ProviderView[]): SelectOptionView[] {
  return providers.map((provider) => ({ id: provider.provider, label: provider.label, isDefault: false }));
}
