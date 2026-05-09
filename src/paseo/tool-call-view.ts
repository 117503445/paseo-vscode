/**
 * 格式化工具调用标题。
 * @param record 工具调用原始记录。
 */
export function formatToolCallTitle(record: Record<string, unknown>): string {
  const detail = isRecord(record.detail) ? record.detail : {};
  const displayName = resolveToolDisplayName(record, detail);
  const summary = resolveToolSummary(record, detail);
  return summary ? `${displayName} · ${summary}` : displayName;
}

/**
 * 格式化工具调用展开详情。
 * @param record 工具调用原始记录。
 */
export function formatToolCallText(record: Record<string, unknown>): string {
  const detail = isRecord(record.detail) ? record.detail : {};
  const sections = resolveToolDetailSections(record, detail);
  const errorText = formatUnknownValue(record.error);
  if (errorText) {
    sections.push(["错误", errorText]);
  }
  return sections.map(([label, value]) => `${label}\n${value}`).join("\n\n");
}

/**
 * 解析工具展示名称。
 * @param record 工具调用原始记录。
 * @param detail 工具调用详情。
 */
function resolveToolDisplayName(record: Record<string, unknown>, detail: Record<string, unknown>): string {
  const detailType = readString(detail.type);
  if (detailType === "shell") return "Shell";
  if (detailType === "read") return "Read";
  if (detailType === "edit") return "Edit";
  if (detailType === "write") return "Write";
  if (detailType === "search") return readString(detail.toolName) === "web_search" ? "Web Search" : "Search";
  if (detailType === "fetch") return "Fetch";
  if (detailType === "worktree_setup") return "Worktree Setup";
  if (detailType === "sub_agent") return readString(detail.subAgentType) || "Task";
  if (detailType === "plain_text") return readString(detail.label) || humanizeToolName(readString(record.name));
  if (detailType === "plan") return "Plan";
  if (detailType === "unknown" && looksLikeShellTool(readString(record.name))) return "Shell";
  return humanizeToolName(readString(record.name)) || "工具调用";
}

/**
 * 解析工具标题摘要。
 * @param record 工具调用原始记录。
 * @param detail 工具调用详情。
 */
function resolveToolSummary(record: Record<string, unknown>, detail: Record<string, unknown>): string {
  const detailType = readString(detail.type);
  if (detailType === "shell") return readString(detail.command);
  if (detailType === "read" || detailType === "edit" || detailType === "write") return readString(detail.filePath);
  if (detailType === "search") return readString(detail.query);
  if (detailType === "fetch") return readString(detail.url);
  if (detailType === "worktree_setup") return readString(detail.branchName) || readString(detail.worktreePath);
  if (detailType === "sub_agent") return readString(detail.description);
  if (detailType === "plain_text") return readString(detail.text);
  if (detailType === "unknown" && looksLikeShellTool(readString(record.name))) {
    return resolveUnknownShellCommand(detail);
  }
  return "";
}

/**
 * 解析工具详情段落。
 * @param record 工具调用原始记录。
 * @param detail 工具调用详情。
 */
function resolveToolDetailSections(
  record: Record<string, unknown>,
  detail: Record<string, unknown>,
): Array<[string, string]> {
  const detailType = readString(detail.type);
  if (detailType === "shell") return formatShellDetail(detail);
  if (detailType === "read") return formatReadDetail(detail);
  if (detailType === "edit") return formatEditDetail(detail);
  if (detailType === "write") return formatWriteDetail(detail);
  if (detailType === "search") return formatSearchDetail(detail);
  if (detailType === "fetch") return formatFetchDetail(detail);
  if (detailType === "worktree_setup") return formatWorktreeSetupDetail(detail);
  if (detailType === "sub_agent") return formatSubAgentDetail(detail);
  if (detailType === "plain_text") return formatPlainTextDetail(detail);
  if (detailType === "plan") return compactSections([["计划", readString(detail.text)]]);
  if (detailType === "unknown") return formatUnknownToolDetail(record, detail);
  return formatFallbackToolDetail(record, detail);
}

/**
 * 格式化 Shell 工具详情。
 * @param detail 工具调用详情。
 */
function formatShellDetail(detail: Record<string, unknown>): Array<[string, string]> {
  return compactSections([
    ["命令", readString(detail.command)],
    ["工作目录", readString(detail.cwd)],
    ["输出", readString(detail.output)],
    ["退出码", readNumberText(detail.exitCode)],
  ]);
}

/**
 * 格式化读取工具详情。
 * @param detail 工具调用详情。
 */
function formatReadDetail(detail: Record<string, unknown>): Array<[string, string]> {
  return compactSections([
    ["文件", readString(detail.filePath)],
    ["范围", formatReadRange(detail)],
    ["内容", readString(detail.content)],
  ]);
}

/**
 * 格式化编辑工具详情。
 * @param detail 工具调用详情。
 */
function formatEditDetail(detail: Record<string, unknown>): Array<[string, string]> {
  return compactSections([
    ["文件", readString(detail.filePath)],
    ["Diff", readString(detail.unifiedDiff)],
    ["旧内容", readString(detail.oldString)],
    ["新内容", readString(detail.newString)],
  ]);
}

/**
 * 格式化写入工具详情。
 * @param detail 工具调用详情。
 */
function formatWriteDetail(detail: Record<string, unknown>): Array<[string, string]> {
  return compactSections([
    ["文件", readString(detail.filePath)],
    ["内容", readString(detail.content)],
  ]);
}

/**
 * 格式化搜索工具详情。
 * @param detail 工具调用详情。
 */
function formatSearchDetail(detail: Record<string, unknown>): Array<[string, string]> {
  return compactSections([
    ["查询", readString(detail.query)],
    ["工具", readString(detail.toolName)],
    ["内容", readString(detail.content)],
    ["文件", formatStringArray(detail.filePaths)],
    ["结果", formatWebResults(detail.webResults)],
    ["统计", formatSearchStats(detail)],
  ]);
}

/**
 * 格式化抓取工具详情。
 * @param detail 工具调用详情。
 */
function formatFetchDetail(detail: Record<string, unknown>): Array<[string, string]> {
  return compactSections([
    ["URL", readString(detail.url)],
    ["提示", readString(detail.prompt)],
    ["结果", readString(detail.result)],
    ["状态", formatFetchStatus(detail)],
  ]);
}

/**
 * 格式化 worktree 初始化工具详情。
 * @param detail 工具调用详情。
 */
function formatWorktreeSetupDetail(detail: Record<string, unknown>): Array<[string, string]> {
  return compactSections([
    ["分支", readString(detail.branchName)],
    ["路径", readString(detail.worktreePath)],
    ["命令", formatWorktreeCommands(detail.commands)],
    ["日志", readString(detail.log)],
  ]);
}

/**
 * 格式化子 agent 工具详情。
 * @param detail 工具调用详情。
 */
function formatSubAgentDetail(detail: Record<string, unknown>): Array<[string, string]> {
  return compactSections([
    ["描述", readString(detail.description)],
    ["子任务", readString(detail.childSessionId)],
    ["动作", formatSubAgentActions(detail.actions)],
    ["日志", readString(detail.log)],
  ]);
}

/**
 * 格式化纯文本工具详情。
 * @param detail 工具调用详情。
 */
function formatPlainTextDetail(detail: Record<string, unknown>): Array<[string, string]> {
  return compactSections([
    ["标题", readString(detail.label)],
    ["内容", readString(detail.text)],
  ]);
}

/**
 * 格式化未知工具详情。
 * @param record 工具调用原始记录。
 * @param detail 工具调用详情。
 */
function formatUnknownToolDetail(
  record: Record<string, unknown>,
  detail: Record<string, unknown>,
): Array<[string, string]> {
  if (looksLikeShellTool(readString(record.name))) {
    return compactSections([
      ["命令", resolveUnknownShellCommand(detail)],
      ["输入", formatUnknownValue(detail.input)],
      ["输出", formatUnknownValue(detail.output)],
    ]);
  }
  return compactSections([
    ["输入", formatUnknownValue(detail.input)],
    ["输出", formatUnknownValue(detail.output)],
  ]);
}

/**
 * 格式化兜底工具详情。
 * @param record 工具调用原始记录。
 * @param detail 工具调用详情。
 */
function formatFallbackToolDetail(
  record: Record<string, unknown>,
  detail: Record<string, unknown>,
): Array<[string, string]> {
  return compactSections([
    ["工具", readString(record.name)],
    ["详情", formatUnknownValue(detail)],
  ]);
}

/**
 * 移除空白详情段落。
 * @param sections 原始详情段落。
 */
function compactSections(sections: Array<[string, string]>): Array<[string, string]> {
  return sections.filter(([, value]) => value.trim().length > 0);
}

/**
 * 格式化读取范围。
 * @param detail 工具调用详情。
 */
function formatReadRange(detail: Record<string, unknown>): string {
  const offset = readNumberText(detail.offset);
  const limit = readNumberText(detail.limit);
  if (offset && limit) return `offset ${offset}, limit ${limit}`;
  if (offset) return `offset ${offset}`;
  if (limit) return `limit ${limit}`;
  return "";
}

/**
 * 格式化字符串数组。
 * @param value 待格式化值。
 */
function formatStringArray(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((entry) => readString(entry)).filter(Boolean).join("\n");
}

/**
 * 格式化 Web 搜索结果。
 * @param value 待格式化值。
 */
function formatWebResults(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      if (!isRecord(entry)) return "";
      return [readString(entry.title), readString(entry.url)].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * 格式化搜索统计信息。
 * @param detail 工具调用详情。
 */
function formatSearchStats(detail: Record<string, unknown>): string {
  const stats = [
    formatLabeledNumber("文件", detail.numFiles),
    formatLabeledNumber("匹配", detail.numMatches),
    formatDuration(detail),
    detail.truncated === true ? "已截断" : "",
    readString(detail.mode),
  ].filter(Boolean);
  return stats.join(" · ");
}

/**
 * 格式化抓取状态信息。
 * @param detail 工具调用详情。
 */
function formatFetchStatus(detail: Record<string, unknown>): string {
  const code = readNumberText(detail.code);
  const parts = [
    code ? `${code}${readString(detail.codeText) ? ` ${readString(detail.codeText)}` : ""}` : "",
    formatLabeledNumber("字节", detail.bytes),
    formatDuration(detail),
  ].filter(Boolean);
  return parts.join(" · ");
}

/**
 * 格式化 worktree 初始化命令。
 * @param value 待格式化值。
 */
function formatWorktreeCommands(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      if (!isRecord(entry)) return "";
      const command = readString(entry.command);
      const status = readString(entry.status);
      const exitCode = readNumberText(entry.exitCode);
      const log = readString(entry.log);
      return compactSections([
        [`#${readNumberText(entry.index) || "?"}${status ? ` ${status}` : ""}`, command],
        ["退出码", exitCode],
        ["日志", log],
      ])
        .map(([label, text]) => `${label}\n${text}`)
        .join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 格式化子 agent 动作。
 * @param value 待格式化值。
 */
function formatSubAgentActions(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      if (!isRecord(entry)) return "";
      return [
        readNumberText(entry.index) ? `#${readNumberText(entry.index)}` : "",
        readString(entry.toolName),
        readString(entry.summary),
      ]
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * 格式化带标签的数值。
 * @param label 展示标签。
 * @param value 待格式化值。
 */
function formatLabeledNumber(label: string, value: unknown): string {
  const numberText = readNumberText(value);
  return numberText ? `${label} ${numberText}` : "";
}

/**
 * 格式化耗时。
 * @param detail 工具调用详情。
 */
function formatDuration(detail: Record<string, unknown>): string {
  const durationMs = readNumberText(detail.durationMs);
  if (durationMs) return `${durationMs}ms`;
  const durationSeconds = readNumberText(detail.durationSeconds);
  return durationSeconds ? `${durationSeconds}s` : "";
}

/**
 * 格式化数值。
 * @param value 待读取值。
 */
function readNumberText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

/**
 * 判断是否像 Shell 工具名。
 * @param name 工具名。
 */
function looksLikeShellTool(name: string): boolean {
  return ["bash", "shell", "exec", "exec_command", "command"].includes(name.trim().toLowerCase());
}

/**
 * 从未知详情里解析 Shell 命令。
 * @param detail 工具调用详情。
 */
function resolveUnknownShellCommand(detail: Record<string, unknown>): string {
  const input = isRecord(detail.input) ? detail.input : {};
  const command = readString(input.command) || readString(input.cmd);
  if (command) return command;
  if (Array.isArray(input.command)) return input.command.map((entry) => readString(entry)).filter(Boolean).join(" ");
  if (Array.isArray(input.cmd)) return input.cmd.map((entry) => readString(entry)).filter(Boolean).join(" ");
  return "";
}

/**
 * 人类可读化工具名。
 * @param name 原始工具名。
 */
function humanizeToolName(name: string): string {
  return name
    .trim()
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`)
    .join(" ");
}

/**
 * 格式化未知值。
 * @param value 待格式化值。
 */
function formatUnknownValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * 判断 unknown 是否为 record。
 * @param value 待判断值。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 读取字符串字段。
 * @param value 待读取值。
 */
function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
