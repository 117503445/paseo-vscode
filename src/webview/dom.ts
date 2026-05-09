import type { AgentView, PaseoViewState, SelectOptionView, WebviewToExtensionMessage } from "../paseo/types";

/** 向 Extension Host 发送 Webview 消息。 */
export type PostMessage = (message: WebviewToExtensionMessage) => void;

/** Webview 本地图标名称。 */
export type PaseoIconName = "add" | "archive" | "back" | "copy" | "new-task" | "refresh" | "send" | "settings" | "stop";

type IconSegment = {
  d: string;
  fill?: boolean;
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const PASEO_ICON_PATHS: Record<PaseoIconName, IconSegment[]> = {
  add: [{ d: "M8 3.5v9M3.5 8h9" }],
  archive: [{ d: "M4.5 4.5l7 7M11.5 4.5l-7 7" }],
  back: [{ d: "M9.5 3.5 5 8l4.5 4.5M5.5 8h8" }],
  copy: [{ d: "M6 2.5h7.5V10M2.5 6h7.5v7.5H2.5z" }],
  "new-task": [{ d: "M3.5 2.5h5l4 4v7h-9zM8.5 2.5v4h4M6 10h4M8 8v4" }],
  refresh: [{ d: "M13.5 4.5V1.8h-2.7M12.9 2.2A5.5 5.5 0 0 0 3 4.4M2.5 11.5v2.7h2.7M3.1 13.8A5.5 5.5 0 0 0 13 11.6" }],
  send: [{ d: "M8 13V3M4.5 6.5 8 3l3.5 3.5" }],
  settings: [
    {
      d: "M6.8 1.5h2.4l.35 1.4c.38.13.75.3 1.08.5l1.25-.74 1.7 1.7-.74 1.25c.2.33.37.7.5 1.08l1.4.35v2.4l-1.4.35c-.13.38-.3.75-.5 1.08l.74 1.25-1.7 1.7-1.25-.74c-.33.2-.7.37-1.08.5l-.35 1.4H6.8l-.35-1.4a5.6 5.6 0 0 1-1.08-.5l-1.25.74-1.7-1.7.74-1.25a5.6 5.6 0 0 1-.5-1.08l-1.4-.35v-2.4l1.4-.35c.13-.38.3-.75.5-1.08l-.74-1.25 1.7-1.7 1.25.74c.33-.2.7-.37 1.08-.5z",
    },
    { d: "M8 5.8a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z" },
  ],
  stop: [{ d: "M5 5h6v6H5z", fill: true }],
};

/**
 * 创建 select。
 * @param options 选项。
 * @param value 当前值。
 * @param placeholderLabel 缺省选项文案。
 */
export function createSelect(
  options: SelectOptionView[],
  value: string,
  placeholderLabel: string,
): HTMLSelectElement {
  const target = document.createElement("select");
  const displayOptions = buildSelectDisplayOptions(options, value, placeholderLabel);
  const selectedValue = displayOptions.some((option) => option.id === value) ? value : "";
  for (const option of displayOptions) {
    target.append(new Option(option.label, option.id, option.id === selectedValue, option.id === selectedValue));
  }
  target.value = selectedValue;
  return target;
}

/**
 * 构造用户可见的 select 选项。
 * @param options 原始选项。
 * @param value 当前值。
 * @param placeholderLabel 缺省选项文案。
 */
export function buildSelectDisplayOptions(
  options: SelectOptionView[],
  value: string,
  placeholderLabel: string,
): SelectOptionView[] {
  const selectedValue = value.trim() === "-" ? "" : value;
  const normalizedOptions = options.map((option) => ({
    ...option,
    label: normalizeSelectOptionLabel(option, placeholderLabel),
  }));
  if (!selectedValue) {
    return [{ id: "", label: placeholderLabel, isDefault: false }, ...normalizedOptions.filter((option) => option.id)];
  }
  if (normalizedOptions.some((option) => option.id === selectedValue)) {
    return normalizedOptions;
  }
  return [{ id: selectedValue, label: selectedValue, isDefault: false }, ...normalizedOptions];
}

/**
 * 归一化 select 选项文案。
 * @param option 原始选项。
 * @param fallbackLabel 兜底文案。
 */
function normalizeSelectOptionLabel(option: SelectOptionView, fallbackLabel: string): string {
  const label = option.label.trim();
  if (label && label !== "-") return label;
  const id = option.id.trim();
  if (id && id !== "-") return id;
  return fallbackLabel;
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
 * @param icon 图标名称。
 * @param title tooltip。
 * @param onClick 点击处理函数。
 */
export function iconButton(icon: PaseoIconName, title: string, onClick: (event: MouseEvent) => void): HTMLButtonElement {
  const target = button("", title, onClick);
  target.className = "icon-button";
  target.setAttribute("aria-label", title);
  target.append(renderIcon(icon));
  return target;
}

/**
 * 创建本地 SVG 图标。
 * @param icon 图标名称。
 */
function renderIcon(icon: PaseoIconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("class", "paseo-icon");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const segment of PASEO_ICON_PATHS[icon]) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", segment.d);
    if (segment.fill) {
      path.setAttribute("fill", "currentColor");
      path.setAttribute("stroke", "none");
    } else {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.45");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    }
    svg.append(path);
  }
  return svg;
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
