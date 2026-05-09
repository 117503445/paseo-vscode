const FENCE_RE = /^```([A-Za-z0-9_-]+)?\s*$/;
const ORDERED_LIST_RE = /^\d+\.\s+/;
const UNORDERED_LIST_RE = /^[-*+]\s+/;

/**
 * 将 assistant Markdown 渲染为安全 HTML。
 * @param source 原始 Markdown 文本。
 */
export function renderMarkdownToHtml(source: string): string {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const result = readCodeFence(lines, index, fenceMatch[1] ?? "");
      blocks.push(result.html);
      index = result.nextIndex;
      continue;
    }
    if (isUnorderedListLine(line) || isOrderedListLine(line)) {
      const result = readList(lines, index, isOrderedListLine(line) ? "ol" : "ul");
      blocks.push(result.html);
      index = result.nextIndex;
      continue;
    }
    const result = readParagraph(lines, index);
    blocks.push(result.html);
    index = result.nextIndex;
  }
  return blocks.join("\n");
}

/**
 * 读取代码块。
 * @param lines Markdown 行。
 * @param startIndex 起始行下标。
 * @param language 代码语言标识。
 */
function readCodeFence(lines: string[], startIndex: number, language: string): { html: string; nextIndex: number } {
  const codeLines: string[] = [];
  let index = startIndex + 1;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (/^```\s*$/.test(line)) {
      index += 1;
      break;
    }
    codeLines.push(line);
    index += 1;
  }
  const className = language ? ` class="language-${escapeAttribute(language)}"` : "";
  const code = codeLines.length > 0 ? `${codeLines.join("\n")}\n` : "";
  return { html: `<pre><code${className}>${escapeHtml(code)}</code></pre>`, nextIndex: index };
}

/**
 * 读取列表块。
 * @param lines Markdown 行。
 * @param startIndex 起始行下标。
 * @param tag 列表标签。
 */
function readList(lines: string[], startIndex: number, tag: "ul" | "ol"): { html: string; nextIndex: number } {
  const items: string[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (tag === "ul" && !isUnorderedListLine(line)) break;
    if (tag === "ol" && !isOrderedListLine(line)) break;
    const text = tag === "ul" ? line.replace(UNORDERED_LIST_RE, "") : line.replace(ORDERED_LIST_RE, "");
    items.push(`<li>${renderInlineMarkdown(text.trim())}</li>`);
    index += 1;
  }
  return { html: `<${tag}>\n${items.join("\n")}\n</${tag}>`, nextIndex: index };
}

/**
 * 读取段落块。
 * @param lines Markdown 行。
 * @param startIndex 起始行下标。
 */
function readParagraph(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const paragraphLines: string[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim() === "" || FENCE_RE.test(line) || isUnorderedListLine(line) || isOrderedListLine(line)) {
      break;
    }
    paragraphLines.push(line.trim());
    index += 1;
  }
  return { html: `<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`, nextIndex: index };
}

/**
 * 渲染行内 Markdown。
 * @param source 行内 Markdown 文本。
 */
function renderInlineMarkdown(source: string): string {
  let html = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "`") {
      const end = source.indexOf("`", index + 1);
      if (end > index) {
        html += `<code>${escapeHtml(source.slice(index + 1, end))}</code>`;
        index = end + 1;
        continue;
      }
    }
    if (source.startsWith("**", index)) {
      const end = source.indexOf("**", index + 2);
      if (end > index + 2) {
        html += `<strong>${renderInlineMarkdown(source.slice(index + 2, end))}</strong>`;
        index = end + 2;
        continue;
      }
    }
    if (char === "[") {
      const link = readInlineLink(source, index);
      if (link) {
        html += link.html;
        index = link.nextIndex;
        continue;
      }
    }
    html += escapeHtml(char ?? "");
    index += 1;
  }
  return html;
}

/**
 * 读取行内链接。
 * @param source 行内 Markdown 文本。
 * @param startIndex 起始下标。
 */
function readInlineLink(source: string, startIndex: number): { html: string; nextIndex: number } | null {
  const labelEnd = source.indexOf("]", startIndex + 1);
  if (labelEnd < 0 || source[labelEnd + 1] !== "(") return null;
  const urlEnd = source.indexOf(")", labelEnd + 2);
  if (urlEnd < 0) return null;
  const label = source.slice(startIndex + 1, labelEnd);
  const url = source.slice(labelEnd + 2, urlEnd).trim();
  if (!isSafeHref(url)) {
    return { html: renderInlineMarkdown(label), nextIndex: urlEnd + 1 };
  }
  return {
    html: `<a href="${escapeAttribute(url)}" target="_blank" rel="noreferrer noopener">${renderInlineMarkdown(label)}</a>`,
    nextIndex: urlEnd + 1,
  };
}

/**
 * 判断是否为无序列表行。
 * @param line Markdown 行。
 */
function isUnorderedListLine(line: string): boolean {
  return UNORDERED_LIST_RE.test(line);
}

/**
 * 判断是否为有序列表行。
 * @param line Markdown 行。
 */
function isOrderedListLine(line: string): boolean {
  return ORDERED_LIST_RE.test(line);
}

/**
 * 判断链接地址是否安全。
 * @param href 链接地址。
 */
function isSafeHref(href: string): boolean {
  if (!href) return false;
  if (/[\u0000-\u001F\u007F]/.test(href)) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    return /^(https?|mailto):/i.test(href);
  }
  return href.startsWith("#") || href.startsWith("/") || href.startsWith("./") || href.startsWith("../");
}

/**
 * 转义 HTML 文本。
 * @param value 原始文本。
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 转义 HTML 属性。
 * @param value 原始属性值。
 */
function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
