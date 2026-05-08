import type { AgentView, PaseoViewState, TaskFilter } from "../paseo/types";
import { button, el, formatRelativeTime, iconButton, isAgentRunning, type PostMessage } from "./dom";

/**
 * 渲染任务列表。
 * @param nextState 当前视图状态。
 * @param post 向 Extension Host 发送消息的函数。
 */
export function renderTasks(nextState: PaseoViewState, post: PostMessage): HTMLElement {
  const section = el("main", "task-view");
  section.dataset.testid = "paseo-task-view";
  section.append(renderTaskFilters(nextState, post));
  const list = el("div", "task-list");
  list.dataset.testid = "paseo-task-list";
  const tasks = filterTasks(nextState);
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
 * 渲染任务过滤器。
 * @param nextState 当前视图状态。
 * @param post 向 Extension Host 发送消息的函数。
 */
function renderTaskFilters(nextState: PaseoViewState, post: PostMessage): HTMLElement {
  const filters = el("div", "filters");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "搜索任务";
  search.value = nextState.searchQuery;
  search.dataset.testid = "paseo-task-search";
  search.addEventListener("input", () => {
    post({ type: "setSearchQuery", query: search.value });
  });
  filters.append(search);
  const modes: Array<{ id: TaskFilter; label: string }> = [
    { id: "all", label: "全部" },
    { id: "running", label: "运行中" },
    { id: "archived", label: "已归档" },
  ];
  const group = el("div", "segmented");
  for (const mode of modes) {
    const item = button(mode.label, mode.label, () => post({ type: "setTaskFilter", filter: mode.id }));
    item.className = mode.id === nextState.taskFilter ? "active" : "";
    group.append(item);
  }
  filters.append(group);
  return filters;
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
  main.append(el("div", "task-title", agent.title), el("div", "muted", `${agent.provider} · ${agent.status}`));
  const side = el("div", "task-side");
  side.append(el("div", "muted", formatRelativeTime(agent.updatedAt)));
  if (!agent.archivedAt) {
    const archive = iconButton("×", "归档任务", (event) => {
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
 * 过滤任务。
 * @param nextState 当前视图状态。
 */
function filterTasks(nextState: PaseoViewState): AgentView[] {
  const query = nextState.searchQuery.trim().toLowerCase();
  return nextState.agents.filter((agent) => {
    if (nextState.taskFilter === "running" && !isAgentRunning(agent)) return false;
    if (nextState.taskFilter === "archived" && !agent.archivedAt) return false;
    if (nextState.taskFilter === "all" && agent.archivedAt) return false;
    if (!query) return true;
    return [agent.title, agent.provider, agent.status].join(" ").toLowerCase().includes(query);
  });
}
