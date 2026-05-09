import type { ExtensionToWebviewMessage, PaseoViewState, WebviewToExtensionMessage } from "../paseo/types";
import { ComposerController } from "./composer";
import { button, el, iconButton, statusLabel, type PostMessage } from "./dom";
import { renderTasks } from "./tasks";
import { renderThread } from "./thread";
import { renderTopTools } from "./topbar";

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
  root.append(renderHeader(nextState), renderContent(nextState), composer.render(nextState));
}

/**
 * 渲染顶部区域。
 * @param nextState 当前视图状态。
 */
function renderHeader(nextState: PaseoViewState): HTMLElement {
  const section = el("section", nextState.screen === "thread" ? "topbar thread-topbar" : "topbar task-topbar");
  section.dataset.testid = "paseo-status";
  if (nextState.screen === "thread" && nextState.selectedAgent) {
    const back = iconButton("back", "返回任务", () => post({ type: "backToTasks" }));
    back.dataset.testid = "paseo-back-to-tasks";
    const title = button(nextState.selectedAgent.title, "当前任务", () => undefined);
    title.className = "title-button";
    section.append(back, title, renderTopTools(nextState, post));
  } else {
    section.append(el("div", "title", "任务"), renderTopTools(nextState, post));
  }

  const meta = el("div", "status-line");
  const status = el("span", "status-pill", statusLabel(nextState));
  status.dataset.testid = "paseo-daemon-status";
  meta.append(status, el("span", "muted", nextState.workspacePath ?? "未打开文件夹"));
  section.append(meta);

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
 * 渲染主内容。
 * @param nextState 当前视图状态。
 */
function renderContent(nextState: PaseoViewState): HTMLElement {
  if (nextState.screen === "thread" && nextState.selectedAgent) {
    return renderThread(nextState, nextState.selectedAgent);
  }
  return renderTasks(nextState, post);
}
