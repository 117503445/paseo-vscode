import { describe, expect, test } from "vitest";
import type { AgentView, PaseoViewState, ProviderView } from "../src/paseo/types";
import { buildComposerProviderPickerOptions } from "../src/webview/composer";
import { buildSelectDisplayOptions, iconButton, type PaseoIconName } from "../src/webview/dom";
import { renderMarkdownToHtml } from "../src/webview/markdown";
import { formatAgentRuntimeLabel, listVisibleTasks } from "../src/webview/tasks";
import { renderTopTools } from "../src/webview/topbar";

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

class FakeElementNode {
  className = "";
  textContent = "";
  title = "";
  type = "";
  disabled = false;
  readonly children: FakeElementNode[] = [];
  readonly dataset: Record<string, string> = {};
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, unknown[]>();

  /**
   * 创建单测用假元素。
   * @param tagName 元素标签名。
   */
  constructor(readonly tagName: string) {}

  /**
   * 追加子节点。
   * @param nodes 子节点列表。
   */
  append(...nodes: FakeElementNode[]): void {
    this.children.push(...nodes);
  }

  /**
   * 写入元素属性。
   * @param name 属性名。
   * @param value 属性值。
   */
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  /**
   * 读取元素属性。
   * @param name 属性名。
   */
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  /**
   * 记录事件监听器。
   * @param type 事件类型。
   * @param listener 监听函数。
   */
  addEventListener(type: string, listener: unknown): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
}

/**
 * 安装最小 DOM mock 并执行断言。
 * @param run 断言回调。
 */
function withFakeDocument(run: () => void): void {
  const originalDocument = globalThis.document;
  const fakeDocument = {
    createElement: (tagName: string) => new FakeElementNode(tagName),
    createElementNS: (_namespace: string, tagName: string) => new FakeElementNode(tagName),
  } as unknown as Document;
  Object.defineProperty(globalThis, "document", { value: fakeDocument, configurable: true });
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, "document", { value: originalDocument, configurable: true });
  }
}

/**
 * 收集假元素树中的可见文本。
 * @param node 假元素根节点。
 */
function collectFakeText(node: FakeElementNode): string {
  return [node.textContent, ...node.children.map(collectFakeText)].join("");
}

/**
 * 判断假元素树中是否存在指定 testid。
 * @param node 假元素根节点。
 * @param testid 目标 testid。
 */
function hasFakeTestId(node: FakeElementNode, testid: string): boolean {
  return node.dataset.testid === testid || node.children.some((child) => hasFakeTestId(child, testid));
}

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

  test("composer missing selections use natural placeholders instead of dash", () => {
    const modelOptions = buildSelectDisplayOptions([], "", "使用默认模型");
    const modeOptions = buildSelectDisplayOptions([], "", "使用默认模式");

    expect(modelOptions).toEqual([{ id: "", label: "使用默认模型", isDefault: false }]);
    expect(modeOptions).toEqual([{ id: "", label: "使用默认模式", isDefault: false }]);
    expect([...modelOptions, ...modeOptions].map((option) => option.label)).not.toContain("-");
  });

  test("task agent runtime label hides missing model without dash separator", () => {
    const label = formatAgentRuntimeLabel({ ...baseAgent, provider: "codex", model: null, status: "idle" });

    expect(label).toBe("codex · idle");
    expect(label).not.toContain(" - ");
    expect(label).not.toBe("-");
  });

  test("topbar does not render running count badge when no task is running", () => {
    withFakeDocument(() => {
      const target = renderTopTools({ ...baseState, runningCount: 0 }, () => undefined) as unknown as FakeElementNode;

      expect(collectFakeText(target)).not.toContain("正在进行中");
      expect(hasFakeTestId(target, "paseo-running-count")).toBe(false);
    });
  });

  test("topbar does not render running count badge when tasks are running", () => {
    withFakeDocument(() => {
      const target = renderTopTools({ ...baseState, runningCount: 2 }, () => undefined) as unknown as FakeElementNode;

      expect(collectFakeText(target)).not.toContain("正在进行中");
      expect(hasFakeTestId(target, "paseo-running-count")).toBe(false);
    });
  });

  test("codex style icon buttons expose title and aria label", () => {
    const keyButtons: Array<[PaseoIconName, string]> = [
      ["settings", "设置"],
      ["refresh", "刷新"],
      ["new-task", "新任务"],
      ["back", "返回任务"],
      ["send", "发送"],
      ["stop", "停止"],
      ["add", "添加附件和上下文"],
      ["archive", "归档任务"],
      ["copy", "复制"],
    ];

    withFakeDocument(() => {
      for (const [icon, label] of keyButtons) {
        const target = iconButton(icon, label, () => undefined);

        expect(target.title).toBe(label);
        expect(target.getAttribute("aria-label")).toBe(label);
        expect(target.textContent).toBe("");
        expect(target.children[0]?.getAttribute("aria-hidden")).toBe("true");
      }
    });
  });
});
