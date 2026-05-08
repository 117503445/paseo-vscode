import * as vscode from "vscode";

/**
 * 解析首个 workspace folder 路径。
 * @param folders VS Code 当前 workspace folders。
 */
export function resolvePrimaryWorkspacePath(
  folders: readonly vscode.WorkspaceFolder[] | undefined,
): string | null {
  const first = folders?.[0];
  return first?.uri.fsPath ?? null;
}
