import type { AgentView, PaseoViewState, TimelineItemView } from "../paseo/types";
import { el, iconButton, isAgentRunning } from "./dom";

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
  for (const item of nextState.timeline) {
    timeline.append(renderTimelineItem(item));
  }
  if (isAgentRunning(agent) || nextState.busy) {
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
 */
function renderTimelineItem(item: TimelineItemView): HTMLElement {
  if (item.type === "user") {
    const block = el("article", "message user-message");
    block.dataset.testid = "paseo-message-user";
    block.append(el("div", "message-label", item.title ?? "用户提示提交"), el("div", "bubble", item.text));
    return block;
  }
  if (item.type === "assistant") {
    const block = el("article", "message assistant-message");
    block.dataset.testid = "paseo-message-assistant";
    block.append(el("div", "message-text", item.text), renderMessageActions());
    return block;
  }
  const details = document.createElement("details");
  details.className = item.type === "error" ? "processing error-block" : "processing";
  details.open = item.type === "error";
  details.dataset.testid = "paseo-processing-group";
  const summary = document.createElement("summary");
  summary.textContent = `${item.title ?? "已处理"}${item.status ? ` ${item.status}` : ""}`;
  details.append(summary, el("pre", "processing-body", item.text));
  return details;
}

/**
 * 渲染运行中处理分组。
 * @param agent 当前 agent。
 */
function renderProcessingGroup(agent: AgentView): HTMLElement {
  const details = document.createElement("details");
  details.className = "processing";
  details.dataset.testid = "paseo-processing-group";
  const summary = document.createElement("summary");
  summary.textContent = agent.status === "running" ? "正在处理" : "准备中";
  details.append(summary, el("div", "processing-body", "等待 daemon 推送任务事件"));
  return details;
}

/**
 * 渲染 assistant 消息操作。
 */
function renderMessageActions(): HTMLElement {
  const actions = el("div", "message-actions");
  actions.append(iconButton("⧉", "复制", () => undefined), iconButton("↳", "继续", () => undefined));
  return actions;
}
