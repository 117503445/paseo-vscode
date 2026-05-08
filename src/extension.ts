import * as vscode from "vscode";
import { PaseoService } from "./paseo/paseo-service";
import { PaseoViewProvider } from "./webview/paseo-view-provider";
import { resolvePrimaryWorkspacePath } from "./workspace";

/**
 * 激活扩展。
 * @param context VS Code 扩展上下文。
 */
export function activate(context: vscode.ExtensionContext): void {
  const workspacePath = resolvePrimaryWorkspacePath(vscode.workspace.workspaceFolders);
  const service = new PaseoService({
    workspacePath,
    extensionVersion: String(context.extension.packageJSON.version ?? "0.0.0"),
    configuredHost: () => readStringConfig("daemon.host"),
    startTimeoutMs: () => readNumberConfig("daemon.startTimeoutMs", 30_000),
    defaultProvider: () => readStringConfig("agent.defaultProvider"),
    defaultModel: () => readStringConfig("agent.defaultModel"),
    defaultMode: () => readStringConfig("agent.defaultMode"),
    onStateChange: () => provider?.postState(),
  });

  const provider = new PaseoViewProvider(context.extensionUri, service);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PaseoViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("paseo.refresh", () => provider.refresh()),
    vscode.commands.registerCommand("paseo.reconnectDaemon", () => provider.reconnect()),
    vscode.commands.registerCommand("paseo.newAgent", () => provider.createAgentFromCommand()),
    vscode.commands.registerCommand("paseo.showDaemonStatus", () => showDaemonStatus(service)),
    { dispose: () => void service.dispose() },
  );
}

/**
 * 停用扩展。
 */
export function deactivate(): void {
  // daemon 必须保持后台运行，这里不停止 paseo daemon。
}

/**
 * 展示 daemon 状态。
 * @param service Paseo 状态服务。
 */
async function showDaemonStatus(service: PaseoService): Promise<void> {
  const state = service.getState();
  await vscode.window.showInformationMessage(
    [
      `状态: ${state.daemon.status}`,
      `Host: ${state.daemon.host ?? "-"}`,
      `日志: ${state.daemon.logPath ?? "-"}`,
      state.daemon.message ? `消息: ${state.daemon.message}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    { modal: true },
  );
}

/**
 * 读取字符串配置。
 * @param key paseo 配置键。
 */
function readStringConfig(key: string): string {
  return vscode.workspace.getConfiguration("paseo").get<string>(key, "").trim();
}

/**
 * 读取数字配置。
 * @param key paseo 配置键。
 * @param fallback 默认值。
 */
function readNumberConfig(key: string, fallback: number): number {
  const value = vscode.workspace.getConfiguration("paseo").get<number>(key, fallback);
  return Number.isFinite(value) ? value : fallback;
}
