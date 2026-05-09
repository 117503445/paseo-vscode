import type { AgentView, PaseoViewState } from "../paseo/types";
import { button, el, formatRelativeTime, iconButton, type PostMessage } from "./dom";

/**
 * 渲染任务列表。
 * @param nextState 当前视图状态。
 * @param post 向 Extension Host 发送消息的函数。
 */
export function renderTasks(nextState: PaseoViewState, post: PostMessage): HTMLElement {
  const section = el("main", "task-view");
  section.dataset.testid = "paseo-task-view";
  const list = el("div", "task-list");
  list.dataset.testid = "paseo-task-list";
  const tasks = listVisibleTasks(nextState);
  if (tasks.length === 0) {
    list.append(el("div", "empty", nextState.workspacePath ? "暂无任务" : "需要先打开文件夹"));
  }
  for (const agent of tasks) {
    list.append(renderTaskItem(agent, post));
  }
  section.append(list);
  return section;
}

/**
 * 查询任务列表中应展示的任务。
 * @param nextState 当前视图状态。
 */
export function listVisibleTasks(nextState: PaseoViewState): AgentView[] {
  return nextState.agents;
}

/**
 * 渲染单个任务。
 * @param agent agent 摘要。
 * @param post 向 Extension Host 发送消息的函数。
 */
function renderTaskItem(agent: AgentView, post: PostMessage): HTMLElement {
  const item = button("", agent.title, () => post({ type: "openAgent", agentId: agent.id }));
  item.className = "task-item";
  item.dataset.testid = "paseo-task-item";
  item.dataset.agentId = agent.id;
  item.innerHTML = "";
  const main = el("div", "task-main");
  main.append(el("div", "task-title", agent.title), el("div", "muted", formatAgentRuntimeLabel(agent)));
  const side = el("div", "task-side");
  side.append(el("div", "muted", formatRelativeTime(agent.updatedAt)));
  if (!agent.archivedAt) {
    const archive = iconButton("archive", "归档任务", (event) => {
      event.stopPropagation();
      post({ type: "archiveAgent", agentId: agent.id });
    });
    archive.dataset.testid = "paseo-archive-agent";
    side.append(archive);
  }
  item.append(main, side);
  return item;
}

/**
 * 格式化任务中的 agent 运行信息。
 * @param agent agent 摘要。
 */
export function formatAgentRuntimeLabel(agent: AgentView): string {
  const parts = [agent.provider, agent.model, agent.status].map(readVisibleAgentPart).filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "任务信息待同步";
}

/**
 * 读取可展示的 agent 信息片段。
 * @param value 原始片段。
 */
function readVisibleAgentPart(value: string | null): string {
  const text = value?.trim() ?? "";
  return text && text !== "-" ? text : "";
}
