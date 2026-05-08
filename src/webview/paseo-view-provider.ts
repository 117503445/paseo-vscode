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
    const state = this.service.getState();
    const provider = state.providers.find((entry) => entry.status === "ready")?.provider ?? "codex";
    const prompt = await vscode.window.showInputBox({
      title: "Paseo: New Agent",
      prompt: "输入初始消息",
      ignoreFocusOut: true,
    });
    if (!prompt?.trim()) return;
    await this.service.createAgent({ provider, prompt: prompt.trim() });
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
      case "selectAgent":
        await this.service.selectAgent(message.agentId);
        this.postState();
        return;
      case "createAgent":
        await this.service.createAgent(message.input);
        this.postState();
        return;
      case "sendMessage":
        await this.service.sendMessage(message.input);
        this.postState();
        return;
    }
  }
}
