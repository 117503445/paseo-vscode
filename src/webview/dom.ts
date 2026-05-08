import type { AgentView, PaseoViewState, SelectOptionView, WebviewToExtensionMessage } from "../paseo/types";

/** 向 Extension Host 发送 Webview 消息。 */
export type PostMessage = (message: WebviewToExtensionMessage) => void;

/**
 * 创建 select。
 * @param options 选项。
 * @param value 当前值。
 */
export function createSelect(options: SelectOptionView[], value: string): HTMLSelectElement {
  const target = document.createElement("select");
  target.append(new Option("-", ""));
  for (const option of options) {
    target.append(new Option(option.label, option.id, option.id === value, option.id === value));
  }
  target.value = value;
  return target;
}

/**
 * 创建按钮。
 * @param text 按钮文本。
 * @param title tooltip。
 * @param onClick 点击处理函数。
 */
export function button(text: string, title: string, onClick: (event: MouseEvent) => void): HTMLButtonElement {
  const target = document.createElement("button");
  target.type = "button";
  target.textContent = text;
  target.title = title;
  target.addEventListener("click", onClick);
  return target;
}

/**
 * 创建图标按钮。
 * @param text 按钮文本。
 * @param title tooltip。
 * @param onClick 点击处理函数。
 */
export function iconButton(text: string, title: string, onClick: (event: MouseEvent) => void): HTMLButtonElement {
  const target = button(text, title, onClick);
  target.className = "icon-button";
  return target;
}

/**
 * 创建元素。
 * @param tag HTML 标签。
 * @param className CSS class。
 * @param text 文本内容。
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const target = document.createElement(tag);
  if (className) target.className = className;
  if (text !== undefined) target.textContent = text;
  return target;
}

/**
 * 生成状态文案。
 * @param nextState 当前视图状态。
 */
export function statusLabel(nextState: PaseoViewState): string {
  if (nextState.daemon.status === "connected") return "已连接";
  if (nextState.daemon.status === "starting") return "启动中";
  if (nextState.daemon.status === "connecting") return "连接中";
  if (nextState.daemon.status === "no-workspace") return "未打开文件夹";
  if (nextState.daemon.status === "error") return "连接失败";
  return "未连接";
}

/**
 * 判断 agent 是否运行中。
 * @param agent agent 摘要。
 */
export function isAgentRunning(agent: AgentView): boolean {
  return agent.status === "running" || agent.status === "initializing";
}

/**
 * 格式化相对时间。
 * @param value ISO 时间字符串。
 */
export function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天`;
}
