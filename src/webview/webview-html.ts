import * as vscode from "vscode";

/**
 * 渲染 Webview HTML。
 * @param webview VS Code Webview。
 * @param extensionUri 扩展根 URI。
 */
export function renderWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = createNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview", "app.js"),
  );
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    "img-src data:",
  ].join("; ");

  return /* html */ `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Paseo</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
      }
      body {
        margin: 0;
        color: var(--vscode-foreground);
        background: var(--vscode-sideBar-background);
      }
      button, input, select, textarea {
        font: inherit;
      }
      button {
        min-height: 28px;
        border: 1px solid var(--vscode-button-border, transparent);
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
        border-radius: 4px;
        padding: 4px 8px;
        cursor: pointer;
      }
      button:disabled {
        cursor: default;
        opacity: 0.55;
      }
      select, textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--vscode-input-border, transparent);
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        border-radius: 4px;
      }
      textarea {
        min-height: 72px;
        resize: vertical;
        padding: 8px;
      }
      .app {
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        height: 100vh;
        min-height: 360px;
      }
      .status {
        display: grid;
        gap: 4px;
        padding: 10px;
        border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
      }
      .status-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .status-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }
      .muted {
        color: var(--vscode-descriptionForeground);
        overflow-wrap: anywhere;
      }
      .actions, .form-row {
        display: flex;
        gap: 6px;
      }
      .agents {
        max-height: 32vh;
        overflow: auto;
        border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
      }
      .agent {
        width: 100%;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 2px 8px;
        text-align: left;
        color: var(--vscode-foreground);
        background: transparent;
        border: 0;
        border-radius: 0;
        padding: 8px 10px;
      }
      .agent.active {
        background: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
      }
      .agent-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .timeline {
        overflow: auto;
        padding: 10px;
      }
      .item {
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
      }
      .item-header {
        margin-bottom: 4px;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        text-transform: uppercase;
      }
      .item-text {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        line-height: 1.45;
      }
      .composer {
        display: grid;
        gap: 8px;
        padding: 10px;
        border-top: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
      }
      .new-agent {
        display: grid;
        gap: 8px;
        padding: 10px;
        border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
      }
      .error {
        color: var(--vscode-errorForeground);
      }
    </style>
  </head>
  <body>
    <div id="app" class="app" data-testid="paseo-root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}

/**
 * 创建 CSP nonce。
 */
function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i += 1) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}
