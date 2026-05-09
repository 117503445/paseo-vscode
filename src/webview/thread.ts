import type { AgentView, PaseoViewState, TimelineItemView } from "../paseo/types";
import { el, iconButton, isAgentRunning } from "./dom";
import { renderMarkdownToHtml } from "./markdown";

/**
 * 渲染线程页。
 * @param nextState 当前视图状态。
 * @param agent 当前 agent。
 */
export function renderThread(nextState: PaseoViewState, agent: AgentView): HTMLElement {
  const section = el("main", "thread-view");
  section.dataset.testid = "paseo-thread-view";
  const timeline = el("div", "timeline");
  timeline.dataset.testid = "paseo-timeline";
  if (nextState.timeline.length === 0) {
    timeline.append(el("div", "empty", "等待任务输出"));
  }
  const running = isAgentRunning(agent) || nextState.busy;
  const lastAssistantId = running ? null : resolveLastAssistantId(nextState.timeline);
  for (const item of nextState.timeline) {
    timeline.append(renderTimelineItem(item, item.id === lastAssistantId));
  }
  if (running) {
    timeline.append(renderProcessingGroup(agent));
  }
  section.append(timeline);
  queueMicrotask(() => {
    timeline.scrollTop = timeline.scrollHeight;
  });
  return section;
}

/**
 * 渲染 timeline item。
 * @param item timeline item。
 * @param showAssistantActions 是否展示 assistant 操作。
 */
function renderTimelineItem(item: TimelineItemView, showAssistantActions: boolean): HTMLElement {
  if (item.type === "user") {
    const block = el("article", "message user-message");
    block.dataset.testid = "paseo-message-user";
    block.append(el("div", "message-label", item.title ?? "用户提示提交"), el("div", "bubble", item.text));
    return block;
  }
  if (item.type === "assistant") {
    const block = el("article", "message assistant-message");
    block.dataset.testid = "paseo-message-assistant";
    const text = el("div", "message-text markdown-body");
    text.innerHTML = renderMarkdownToHtml(item.text);
    block.append(text);
    if (showAssistantActions) {
      block.append(renderMessageActions(item));
    }
    return block;
  }
  const details = document.createElement("details");
  details.className = item.type === "error" ? "processing error-block" : "processing";
  details.open = item.type === "error";
  details.dataset.testid = "paseo-processing-group";
  const summary = document.createElement("summary");
  summary.textContent = `${item.title ?? "已处理"}${item.status ? ` ${item.status}` : ""}`;
  const body = el("pre", "processing-body", item.text);
  details.append(summary);
  if (item.text.trim()) {
    details.append(body);
  }
  return details;
}

/**
 * 渲染运行中处理分组。
 * @param agent 当前 agent。
 */
function renderProcessingGroup(agent: AgentView): HTMLElement {
  const details = document.createElement("details");
  details.className = "processing live-processing";
  details.dataset.testid = "paseo-processing-group";
  const summary = document.createElement("summary");
  summary.textContent = agent.status === "running" ? "正在处理" : "准备中";
  details.append(summary);
  return details;
}

/**
 * 渲染 assistant 消息操作。
 * @param item assistant 消息。
 */
function renderMessageActions(item: TimelineItemView): HTMLElement {
  const actions = el("div", "message-actions");
  actions.append(iconButton("copy", "复制", () => void navigator.clipboard?.writeText(item.text)));
  return actions;
}

/**
 * 解析最后一条 assistant 消息 ID。
 * @param items 当前 timeline。
 */
function resolveLastAssistantId(items: TimelineItemView[]): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.type === "assistant") return item.id;
  }
  return null;
}
