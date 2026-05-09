import type { ExtensionToWebviewMessage, PaseoViewState, WebviewToExtensionMessage } from "../paseo/types";
import { ComposerController } from "./composer";
import { type PostMessage } from "./dom";
import { renderTasks } from "./tasks";
import { renderThread } from "./thread";
import { renderHeader } from "./topbar";

declare const acquireVsCodeApi: () => {
  /**
   * 向 Extension Host 发送消息。
   * @param message Webview 消息。
   */
  postMessage: (message: WebviewToExtensionMessage) => void;
};

const vscode = acquireVsCodeApi();
const root = document.getElementById("app") as HTMLElement;
const post: PostMessage = (message) => vscode.postMessage(message);
const composer = new ComposerController(root, post, render);
let state: PaseoViewState | null = null;

window.addEventListener("message", (event: MessageEvent<ExtensionToWebviewMessage>) => {
  if (event.data.type !== "state") return;
  state = event.data.state;
  composer.syncDefaults(state);
  render(state);
});

vscode.postMessage({ type: "ready" });

/**
 * 渲染完整视图。
 * @param nextState Extension Host 推送的状态。
 */
function render(nextState: PaseoViewState): void {
  root.innerHTML = "";
  root.append(renderHeader(nextState, post), renderContent(nextState), composer.render(nextState));
}

/**
 * 渲染主内容。
 * @param nextState 当前视图状态。
 */
function renderContent(nextState: PaseoViewState): HTMLElement {
  if (nextState.screen === "thread" && nextState.selectedAgent) {
    return renderThread(nextState, nextState.selectedAgent);
  }
  return renderTasks(nextState, post);
}
