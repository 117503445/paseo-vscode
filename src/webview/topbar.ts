import type { PaseoViewState } from "../paseo/types";
import { button, el, iconButton, statusLabel, type PostMessage } from "./dom";

/**
 * 渲染顶部区域。
 * @param nextState 当前视图状态。
 * @param post 向 Extension Host 发送消息的函数。
 */
export function renderHeader(nextState: PaseoViewState, post: PostMessage): HTMLElement {
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

  section.append(renderConnectionMeta(nextState));
  if (nextState.error) {
    const error = el("div", "error", nextState.error);
    error.dataset.testid = "paseo-error";
    section.append(error);
  }
  return section;
}

/**
 * 渲染顶部操作按钮组。
 * @param _nextState 当前视图状态。
 * @param post 向 Extension Host 发送消息的函数。
 */
export function renderTopTools(_nextState: PaseoViewState, post: PostMessage): HTMLElement {
  const tools = el("div", "topbar-tools");
  tools.append(renderTopActions(post));
  return tools;
}

/**
 * 渲染顶部操作。
 * @param post 向 Extension Host 发送消息的函数。
 */
function renderTopActions(post: PostMessage): HTMLElement {
  const actions = el("div", "top-actions");
  actions.append(
    iconButton("refresh", "刷新", () => post({ type: "refresh" })),
    iconButton("settings", "设置", () => post({ type: "openSettings" })),
    iconButton("new-task", "新任务", () => post({ type: "backToTasks" })),
  );
  return actions;
}

/**
 * 渲染顶部连接信息。
 * @param nextState 当前视图状态。
 */
function renderConnectionMeta(nextState: PaseoViewState): HTMLElement {
  const meta = el("div", "status-line");
  const status = el("span", "status-pill", statusLabel(nextState));
  const workspace = el("span", "muted workspace-path", nextState.workspacePath ?? "未打开文件夹");
  const message = el("span", "muted daemon-message", daemonDescription(nextState));
  status.dataset.testid = "paseo-daemon-status";
  workspace.dataset.testid = "paseo-workspace-path";
  message.dataset.testid = "paseo-daemon-message";
  meta.append(status, workspace, message);
  return meta;
}

/**
 * 生成 daemon 连接说明。
 * @param nextState 当前视图状态。
 */
function daemonDescription(nextState: PaseoViewState): string {
  const message = nextState.daemon.message?.trim();
  if (message) return message;
  if (nextState.daemon.status === "connected") return "已连接 Paseo daemon";
  if (nextState.daemon.status === "starting") return "正在启动 Paseo daemon";
  if (nextState.daemon.status === "connecting") return "正在连接 Paseo daemon";
  if (nextState.daemon.status === "no-workspace") return "需要先打开文件夹";
  if (nextState.daemon.status === "error") return "Paseo daemon 连接失败";
  return "Paseo daemon 未连接";
}
