import * as vscode from "vscode";
import { WEBVIEW_STYLES } from "./webview-styles";

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
    <style>${WEBVIEW_STYLES}</style>
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
