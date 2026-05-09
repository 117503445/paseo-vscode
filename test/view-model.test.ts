import { describe, expect, test } from "vitest";
import {
  appendTimelineEntry,
  appendTimelineStreamEvent,
  reduceTimelineEntries,
} from "../src/paseo/view-model";

describe("timeline view model", () => {
  test("merges continuous assistant chunks", () => {
    const timeline = reduceTimelineEntries([
      { item: { type: "assistant_message", text: "我会先" }, timestamp: "2026-05-09T00:00:00.000Z" },
      { item: { type: "assistant_message", text: "快速" }, timestamp: "2026-05-09T00:00:01.000Z" },
      { item: { type: "assistant_message", text: "检查。" }, timestamp: "2026-05-09T00:00:02.000Z" },
    ]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ type: "assistant", text: "我会先快速检查。" });
  });

  test("merges continuous reasoning chunks", () => {
    const timeline = reduceTimelineEntries([
      { item: { type: "reasoning", text: "扫描" }, timestamp: "2026-05-09T00:00:00.000Z" },
      { item: { type: "reasoning", text: "项目结构" }, timestamp: "2026-05-09T00:00:01.000Z" },
    ]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ type: "reasoning", text: "扫描项目结构" });
  });

  test("updates tool call by callId", () => {
    const running = appendTimelineEntry([], {
      item: {
        type: "tool_call",
        callId: "tool-1",
        name: "read_file",
        status: "running",
        detail: { type: "unknown", input: null, output: null },
        error: null,
      },
      timestamp: "2026-05-09T00:00:00.000Z",
    });
    const completed = appendTimelineEntry(running, {
      item: {
        type: "tool_call",
        callId: "tool-1",
        name: "read_file",
        status: "completed",
        detail: { type: "unknown", input: null, output: "ok" },
        error: null,
      },
      timestamp: "2026-05-09T00:00:01.000Z",
    });

    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ type: "tool", callId: "tool-1", status: "completed" });
  });

  test("formats tool call titles and expandable details", () => {
    const timeline = reduceTimelineEntries([
      {
        item: {
          type: "tool_call",
          callId: "shell-1",
          name: "exec_command",
          status: "completed",
          detail: {
            type: "shell",
            command: "npm test -- --run",
            cwd: "/workspace/project/paseo-vscode",
            output: "✓ test/view-model.test.ts",
            exitCode: 0,
          },
          error: null,
        },
      },
      {
        item: {
          type: "tool_call",
          callId: "read-1",
          name: "read_file",
          status: "completed",
          detail: {
            type: "read",
            filePath: "/workspace/project/paseo-vscode/src/paseo/view-model.ts",
            content: "export function mapTimelineEntry() {}",
          },
          error: null,
        },
      },
      {
        item: {
          type: "tool_call",
          callId: "search-1",
          name: "web_search",
          status: "completed",
          detail: {
            type: "search",
            query: "paseo tool call",
            toolName: "web_search",
            webResults: [{ title: "Paseo", url: "https://example.com/paseo" }],
          },
          error: null,
        },
      },
    ]);

    expect(timeline).toHaveLength(3);
    expect(timeline[0]).toMatchObject({
      type: "tool",
      title: "Shell · npm test -- --run",
      text: expect.stringContaining("输出\n✓ test/view-model.test.ts"),
      collapsible: true,
    });
    expect(timeline[0]?.text).toContain("退出码\n0");
    expect(timeline[1]).toMatchObject({
      type: "tool",
      title: "Read · /workspace/project/paseo-vscode/src/paseo/view-model.ts",
      text: expect.stringContaining("内容\nexport function mapTimelineEntry() {}"),
      collapsible: true,
    });
    expect(timeline[2]).toMatchObject({
      type: "tool",
      title: "Web Search · paseo tool call",
      text: expect.stringContaining("结果\nPaseo https://example.com/paseo"),
      collapsible: true,
    });
  });

  test("ignores non-timeline stream lifecycle events", () => {
    const timeline = appendTimelineStreamEvent([], {
      type: "turn_started",
      turnId: "turn-1",
    });

    expect(timeline).toEqual([]);
  });
});
