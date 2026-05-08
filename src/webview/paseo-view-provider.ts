import * as vscode from "vscode";
import type { PaseoService } from "../paseo/paseo-service";
import type { WebviewToExtensionMessage } from "../paseo/types";
import { renderWebviewHtml } from "./webview-html";

/**
 * Paseo WebviewView Provider。
 */
export class PaseoViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "paseo.chat";

  private readonly extensionUri: vscode.Uri;
  private readonly service: PaseoService;
  private view: vscode.WebviewView | null = null;

  /**
   * 创建 Paseo Webview Provider。
   * @param extensionUri 扩展根 URI。
   * @param service Paseo 状态服务。
   */
  constructor(extensionUri: vscode.Uri, service: PaseoService) {
    this.extensionUri = extensionUri;
    this.service = service;
  }

  /**
   * 解析 WebviewView。
   * @param webviewView VS Code 提供的 WebviewView。
   */
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview")],
    };
    webviewView.webview.html = renderWebviewHtml(webviewView.webview, this.extensionUri);
    webviewView.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
      void this.handleMessage(message);
    });
    void this.service.start();
  }

  /**
   * 推送当前状态到 Webview。
   */
  postState(): void {
    this.view?.webview.postMessage({ type: "state", state: this.service.getState() });
  }

  /**
   * 刷新视图数据。
   */
  async refresh(): Promise<void> {
    await this.service.refreshAll();
    this.postState();
  }

  /**
   * 重新连接 daemon。
   */
  async reconnect(): Promise<void> {
    await this.service.reconnect();
    this.postState();
  }

  /**
   * 从命令面板创建 agent。
   */
  async createAgentFromCommand(): Promise<void> {
    const prompt = await vscode.window.showInputBox({
      title: "Paseo: New Agent",
      prompt: "输入初始消息",
      ignoreFocusOut: true,
    });
    if (!prompt?.trim()) return;
    await this.service.start();
    const state = this.service.getState();
    if (state.daemon.status !== "connected") {
      await vscode.window.showErrorMessage(state.daemon.message ?? "Paseo daemon 未连接");
      this.postState();
      return;
    }
    const defaults = state.composerDefaults;
    await this.service.createAgent({
      text: prompt.trim(),
      provider: defaults.provider || undefined,
      model: defaults.model || undefined,
      modeId: defaults.modeId || undefined,
    });
    this.postState();
  }

  /**
   * 处理 Webview 发来的消息。
   * @param message Webview 消息。
   */
  private async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        this.postState();
        return;
      case "refresh":
        await this.refresh();
        return;
      case "reconnect":
        await this.reconnect();
        return;
      case "openSettings":
        await vscode.commands.executeCommand("workbench.action.openSettings", "paseo");
        return;
      case "openAgent":
        await this.service.openAgent(message.agentId);
        this.postState();
        return;
      case "backToTasks":
        this.service.backToTasks();
        this.postState();
        return;
      case "archiveAgent":
        await this.service.archiveAgent(message.agentId);
        this.postState();
        return;
      case "cancelAgent":
        await this.service.cancelAgent(message.agentId);
        this.postState();
        return;
      case "setAgentModel":
        await this.service.setAgentModel(message.agentId, message.modelId);
        this.postState();
        return;
      case "setAgentMode":
        await this.service.setAgentMode(message.agentId, message.modeId);
        this.postState();
        return;
      case "setTaskFilter":
        this.service.setTaskFilter(message.filter);
        this.postState();
        return;
      case "setSearchQuery":
        this.service.setSearchQuery(message.query);
        this.postState();
        return;
      case "sendComposer":
        await this.service.sendComposer(message.input);
        this.postState();
        return;
      case "toggleComposerOption":
        return;
    }
  }
}
