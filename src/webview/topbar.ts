import type { PaseoViewState } from "../paseo/types";
import { el, iconButton, type PostMessage } from "./dom";

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
