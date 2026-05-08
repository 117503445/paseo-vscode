import * as vscode from "vscode";
import { PaseoService } from "./paseo/paseo-service";
import { PaseoViewProvider } from "./webview/paseo-view-provider";
import { resolvePrimaryWorkspacePath } from "./workspace";

/**
 * 激活扩展。
 * @param context VS Code 扩展上下文。
 */
export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Paseo");
  const workspacePath = resolvePrimaryWorkspacePath(vscode.workspace.workspaceFolders);
  const service = new PaseoService({
    workspacePath,
    extensionVersion: String(context.extension.packageJSON.version ?? "0.0.0"),
    configuredHost: () => readStringConfig("daemon.host"),
    daemonPassword: () => readStringConfig("daemon.password"),
    startTimeoutMs: () => readNumberConfig("daemon.startTimeoutMs", 30_000),
    defaultProvider: () => readStringConfig("agent.defaultProvider"),
    defaultModel: () => readStringConfig("agent.defaultModel"),
    defaultMode: () => readStringConfig("agent.defaultMode"),
    ideContext: () => resolveIdeContext(workspacePath),
    onStateChange: () => provider?.postState(),
    log: (message) => output.appendLine(`[${new Date().toISOString()}] ${message}`),
  });

  const provider = new PaseoViewProvider(context.extensionUri, service);
  context.subscriptions.push(
    output,
    vscode.window.registerWebviewViewProvider(PaseoViewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("paseo.refresh", () => provider.refresh()),
    vscode.commands.registerCommand("paseo.reconnectDaemon", () => provider.reconnect()),
    vscode.commands.registerCommand("paseo.newAgent", () => provider.createAgentFromCommand()),
    vscode.commands.registerCommand("paseo.showDaemonStatus", () => showDaemonStatus(service, output)),
    vscode.commands.registerCommand("paseo.openLogs", () => openLogs(service, output)),
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
 * @param output Paseo 输出日志。
 */
async function showDaemonStatus(service: PaseoService, output: vscode.OutputChannel): Promise<void> {
  const state = service.getState();
  await vscode.window.showInformationMessage(
    [
      `状态: ${state.daemon.status}`,
      `Host: ${state.daemon.host ?? "-"}`,
      `日志: ${state.daemon.logPath ?? "-"}`,
      "扩展日志: Output 面板中的 Paseo",
      state.daemon.message ? `消息: ${state.daemon.message}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    { modal: true },
  );
  output.show(true);
}

/**
 * 打开扩展日志和 daemon 日志。
 * @param service Paseo 状态服务。
 * @param output Paseo 输出日志。
 */
async function openLogs(service: PaseoService, output: vscode.OutputChannel): Promise<void> {
  output.show(true);
  const logPath = service.getState().daemon.logPath;
  if (!logPath) return;
  const uri = vscode.Uri.file(logPath);
  await vscode.window.showTextDocument(uri, { preview: false }).then(undefined, () => undefined);
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

/**
 * 解析当前 IDE 上下文。
 * @param workspacePath 当前工作区路径。
 */
function resolveIdeContext(workspacePath: string | null): string {
  const editor = vscode.window.activeTextEditor;
  const lines = [`Workspace: ${workspacePath ?? "未打开文件夹"}`];
  if (!editor) return lines.join("\n");
  lines.push(`Active file: ${editor.document.uri.fsPath}`);
  const selection = editor.selection;
  if (!selection.isEmpty) {
    const text = editor.document.getText(selection).slice(0, 4000);
    lines.push(`Selection:\n${text}`);
    return lines.join("\n");
  }
  const visibleRange = editor.visibleRanges[0];
  if (visibleRange) {
    const text = editor.document.getText(visibleRange).slice(0, 4000);
    lines.push(`Visible text:\n${text}`);
  }
  return lines.join("\n");
}
