import type { ExtensionToWebviewMessage, PaseoViewState, WebviewToExtensionMessage } from "../paseo/types";
import { ComposerController } from "./composer";
import { button, el, iconButton, statusLabel, type PostMessage } from "./dom";
import { renderTasks } from "./tasks";
import { renderThread } from "./thread";

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
  const section = el("section", "topbar");
  section.dataset.testid = "paseo-status";
  if (nextState.screen === "thread" && nextState.selectedAgent) {
    const back = iconButton("‹", "返回任务", () => post({ type: "backToTasks" }));
    back.dataset.testid = "paseo-back-to-tasks";
    const title = button(nextState.selectedAgent.title, "当前任务", () => undefined);
    title.className = "title-button";
    section.append(back, title, renderRunningCount(nextState), renderTopActions());
  } else {
    section.append(el("div", "title", "任务"), renderRunningCount(nextState), renderTopActions());
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
 * 渲染顶部运行中计数。
 * @param nextState 当前视图状态。
 */
function renderRunningCount(nextState: PaseoViewState): HTMLElement {
  const target = button(`${nextState.runningCount} 正在进行中`, "运行中的任务", () =>
    post({ type: "setTaskFilter", filter: "running" }),
  );
  target.className = "count-button";
  target.dataset.testid = "paseo-running-count";
  return target;
}

/**
 * 渲染顶部操作。
 */
function renderTopActions(): HTMLElement {
  const actions = el("div", "top-actions");
  actions.append(
    iconButton("↻", "刷新", () => post({ type: "refresh" })),
    iconButton("⚙", "设置", () => post({ type: "openSettings" })),
    iconButton("✎", "新任务", () => post({ type: "backToTasks" })),
  );
  return actions;
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
