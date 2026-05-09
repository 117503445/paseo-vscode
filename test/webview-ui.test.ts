import { describe, expect, test } from "vitest";
import type { AgentView, PaseoViewState, ProviderView } from "../src/paseo/types";
import { buildComposerProviderPickerOptions } from "../src/webview/composer";
import { renderMarkdownToHtml } from "../src/webview/markdown";
import { listVisibleTasks } from "../src/webview/tasks";

const baseAgent: AgentView = {
  id: "agent-base",
  title: "Base",
  provider: "mock",
  cwd: "/workspace",
  status: "idle",
  model: null,
  modeId: null,
  updatedAt: "2026-05-09T00:00:00.000Z",
  archivedAt: null,
  lastError: null,
};

const baseProvider: ProviderView = {
  provider: "mock",
  label: "Mock",
  status: "ready",
  error: null,
  models: [],
  modes: [],
  defaultModeId: null,
};

const baseState: PaseoViewState = {
  workspacePath: "/workspace",
  screen: "tasks",
  taskFilter: "running",
  searchQuery: "只匹配旧搜索",
  runningCount: 1,
  daemon: {
    status: "connected",
    host: null,
    message: null,
    logPath: null,
  },
  agents: [],
  providers: [baseProvider],
  selectedAgentId: null,
  selectedAgent: null,
  timeline: [],
  composerDefaults: {
    provider: "mock",
    model: "",
    modeId: "",
  },
  settingsSummary: {
    daemonHost: null,
    daemonLogPath: null,
    defaultProvider: "",
    defaultModel: "",
    defaultMode: "",
  },
  busy: false,
  error: null,
};

describe("webview user visible ui", () => {
  test("task list always shows every task without search or status filtering", () => {
    const agents: AgentView[] = [
      { ...baseAgent, id: "idle", title: "普通任务", status: "idle" },
      { ...baseAgent, id: "running", title: "运行任务", status: "running" },
      { ...baseAgent, id: "archived", title: "归档任务", archivedAt: "2026-05-09T01:00:00.000Z" },
    ];

    const visible = listVisibleTasks({ ...baseState, agents });

    expect(visible.map((agent) => agent.id)).toEqual(["idle", "running", "archived"]);
  });

  test("assistant markdown renders common blocks and escapes unsafe html", () => {
    const html = renderMarkdownToHtml(
      [
        "第一段",
        "",
        "- 项目 `inline`",
        "- 第二项",
        "",
        "```ts",
        "const value = 1;",
        "```",
        "",
        "[链接](https://example.com)",
        "",
        "<script>alert(1)</script>",
        "[危险](javascript:alert(1))",
      ].join("\n"),
    );

    expect(html).toContain("<p>第一段</p>");
    expect(html).toContain("<li>项目 <code>inline</code></li>");
    expect(html).toContain('<code class="language-ts">const value = 1;\n</code>');
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noreferrer noopener">链接</a>');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });

  test("composer provider picker exposes codex and claude provider choices", () => {
    const options = buildComposerProviderPickerOptions([
      { ...baseProvider, provider: "codex", label: "Codex" },
      { ...baseProvider, provider: "claude", label: "Claude" },
    ]);

    expect(options).toEqual([
      { id: "codex", label: "Codex", isDefault: false },
      { id: "claude", label: "Claude", isDefault: false },
    ]);
  });
});
