package e2e

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/playwright-community/playwright-go"
)

// runCase 执行单个浏览器用例。
// ctx 控制用例生命周期。
// page 是 Playwright 页面。
// baseURL 是 code-server 地址。
// name 是用例名称。
func runCase(ctx context.Context, page playwright.Page, baseURL string, name string) error {
	_ = ctx
	switch name {
	case "command-new-agent-cold-start":
		return createAgentFromCommandPaletteColdStart(page)
	case "offline-daemon-start":
		frame, err := openPaseoView(page)
		if err != nil {
			return err
		}
		return expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "已连接", 60*time.Second)
	case "mock-chat":
		frame, err := openPaseoView(page)
		if err != nil {
			return err
		}
		if err := expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "已连接", 60*time.Second); err != nil {
			return err
		}
		return createMockChat(frame)
	case "default-ready-provider":
		frame, err := openPaseoView(page)
		if err != nil {
			return err
		}
		if err := expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "已连接", 60*time.Second); err != nil {
			return err
		}
		return createChatWithDefaultReadyProvider(frame)
	case "composer-preserves-draft-on-error":
		frame, err := openPaseoView(page)
		if err != nil {
			return err
		}
		if err := expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "已连接", 60*time.Second); err != nil {
			return err
		}
		return expectComposerPreservesDraftOnError(frame)
	case "command-new-agent-default-provider":
		frame, err := openPaseoView(page)
		if err != nil {
			return err
		}
		if err := expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "已连接", 60*time.Second); err != nil {
			return err
		}
		return createAgentFromCommandPalette(page, frame)
	case "codex-like-ux":
		frame, err := openPaseoView(page)
		if err != nil {
			return err
		}
		if err := expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "已连接", 60*time.Second); err != nil {
			return err
		}
		return expectCodexLikeUX(frame)
	case "running-count-hidden":
		frame, err := openPaseoView(page)
		if err != nil {
			return err
		}
		if err := expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "已连接", 60*time.Second); err != nil {
			return err
		}
		return expectRunningCountHiddenInZeroAndRunningStates(frame)
	case "timeline-stream-coalescing":
		frame, err := openPaseoView(page)
		if err != nil {
			return err
		}
		if err := expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "已连接", 60*time.Second); err != nil {
			return err
		}
		return expectTimelineStreamCoalescing(frame)
	case "tool-call-readable-details":
		frame, err := openPaseoView(page)
		if err != nil {
			return err
		}
		if err := expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "已连接", 60*time.Second); err != nil {
			return err
		}
		return expectToolCallReadableDetails(frame)
	case "reload-reconnect":
		if _, err := page.Goto(baseURL); err != nil {
			return err
		}
		frame, err := openPaseoView(page)
		if err != nil {
			return err
		}
		if err := expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "已连接", 60*time.Second); err != nil {
			return err
		}
		if os.Getenv("PASEO_E2E_EXPECT_RELOAD_AGENT") == "1" {
			return expectReloadedAgent(frame)
		}
		return nil
	case "no-folder":
		frame, err := openPaseoView(page)
		if err != nil {
			return err
		}
		return expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "未打开文件夹", 30*time.Second)
	default:
		return fmt.Errorf("未知 E2E case：%s", name)
	}
}

// expectReloadedAgent 断言刷新后能读取已有 agent 和 timeline。
// frame 是 Paseo webview frame。
func expectReloadedAgent(frame playwright.Frame) error {
	agent := frame.Locator(`[data-testid="paseo-task-item"]`).First()
	if err := agent.WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := agent.Click(); err != nil {
		return err
	}
	if err := waitLocatorCountAtLeast(frame.Locator(`[data-testid="paseo-message-user"]`), 1, 30*time.Second); err != nil {
		return err
	}
	return waitLocatorCountAtLeast(frame.Locator(`[data-testid="paseo-message-assistant"]`), 1, 30*time.Second)
}

// createMockChat 创建 mock agent 并断言 timeline。
// frame 是 Paseo webview frame。
func createMockChat(frame playwright.Frame) error {
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-provider"]`), "mock", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-model"]`), "ten-second-stream", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-mode"]`), "load-test", 30*time.Second); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-input"]`).Fill("请输出一段测试消息"); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-send"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-thread-view"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-message-assistant"]`).First().WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	sendButton := frame.Locator(`[data-testid="paseo-composer-send"]`)
	if err := sendButton.WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-input"]`).Fill("第二条测试消息"); err != nil {
		return err
	}
	if err := waitLocatorEnabled(sendButton, 10*time.Second); err != nil {
		return err
	}
	if err := sendButton.Click(); err != nil {
		return err
	}
	return waitLocatorCountAtLeast(frame.Locator(`[data-testid="paseo-message-user"]`), 2, 30*time.Second)
}

// expectRunningCountHiddenInZeroAndRunningStates 断言空闲和运行中都不展示运行中数量徽标。
// frame 是 Paseo webview frame。
func expectRunningCountHiddenInZeroAndRunningStates(frame playwright.Frame) error {
	if err := expectRunningCountHidden(frame, 5*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-provider"]`), "mock", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-model"]`), "ten-second-stream", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-mode"]`), "load-test", 30*time.Second); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-input"]`).Fill("验证运行中数量徽标不展示"); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-send"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-thread-view"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-stop"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(30_000),
	}); err != nil {
		return err
	}
	if err := expectRunningCountHidden(frame, 5*time.Second); err != nil {
		return err
	}
	if err := waitSelectedAgentIdle(frame, 90*time.Second); err != nil {
		return err
	}
	return expectRunningCountHidden(frame, 5*time.Second)
}

// expectTimelineStreamCoalescing 断言流式输出不会按 token 拆成多条消息。
// frame 是 Paseo webview frame。
func expectTimelineStreamCoalescing(frame playwright.Frame) error {
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-provider"]`), "mock", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-model"]`), "ten-second-stream", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-mode"]`), "load-test", 30*time.Second); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-input"]`).Fill("emit 100 coalesced agent stream updates"); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-send"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-thread-view"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-message-assistant"]`).First().WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := waitSelectedAgentIdle(frame, 90*time.Second); err != nil {
		return err
	}
	if err := expectRunningCountHidden(frame, 5*time.Second); err != nil {
		return err
	}
	if err := expectLocatorCountAtMost(frame.Locator(`[data-testid="paseo-message-assistant"]`), 2, 5*time.Second); err != nil {
		return err
	}
	if err := expectLocatorCountAtMost(frame.Locator(`[data-testid="paseo-processing-group"]`), 8, 5*time.Second); err != nil {
		return err
	}
	timelineText, err := frame.Locator(`[data-testid="paseo-timeline"]`).TextContent()
	if err != nil {
		return err
	}
	if strings.Contains(timelineText, "turn_started") || strings.Contains(timelineText, "turn_completed") {
		return fmt.Errorf("timeline 不应显示生命周期事件，实际文本：%q", timelineText)
	}
	return nil
}

// expectToolCallReadableDetails 断言工具调用标题可读且详情可展开。
// frame 是 Paseo webview frame。
func expectToolCallReadableDetails(frame playwright.Frame) error {
	if err := returnToTaskListIfOpen(frame); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-provider"]`), "mock", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-model"]`), "ten-second-stream", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-mode"]`), "load-test", 30*time.Second); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-input"]`).Fill("请生成工具调用详情用于测试"); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-send"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-thread-view"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	readTool := frame.Locator(`details[data-testid="paseo-processing-group"]:has-text("Read · packages/app/src/components/conversation-list.tsx")`).First()
	if err := readTool.WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := expectText(readTool, "内容", 5*time.Second); err != nil {
		return err
	}
	searchTool := frame.Locator(`details[data-testid="paseo-processing-group"]:has-text("Search · scrollToEnd")`).First()
	if err := searchTool.WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := expectText(searchTool, "文件", 5*time.Second); err != nil {
		return err
	}
	shellTool := frame.Locator(`details[data-testid="paseo-processing-group"]:has-text("Shell · node scripts/simulate-stream-burst.mjs")`).First()
	if err := shellTool.WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(90_000),
	}); err != nil {
		return err
	}
	if err := waitSelectedAgentIdle(frame, 90*time.Second); err != nil {
		return err
	}
	if err := expectRunningCountHidden(frame, 5*time.Second); err != nil {
		return err
	}
	if err := expectDetailsOpen(shellTool, false); err != nil {
		return err
	}
	if err := clickDetailsSummary(shellTool, "Shell 工具"); err != nil {
		return err
	}
	if err := expectDetailsOpen(shellTool, true); err != nil {
		return err
	}
	if err := expectText(shellTool, "输出", 5*time.Second); err != nil {
		return err
	}
	if err := expectText(shellTool, "[burst] tick 1 userIsAtBottom=true", 5*time.Second); err != nil {
		return err
	}
	return stopSelectedAgentIfRunning(frame)
}

// clickDetailsSummary 滚动到 details 标题并点击展开。
// details 是待操作 details 元素。
// label 是错误提示中的详情名称。
func clickDetailsSummary(details playwright.Locator, label string) error {
	summary := details.Locator("summary")
	if err := summary.ScrollIntoViewIfNeeded(playwright.LocatorScrollIntoViewIfNeededOptions{
		Timeout: playwright.Float(10_000),
	}); err != nil {
		return fmt.Errorf("滚动 %s 标题失败：%w", label, err)
	}
	_ = summary.Click(playwright.LocatorClickOptions{
		Timeout: playwright.Float(2_000),
	})
	open, err := details.Evaluate(`element => {
		if (element.open) return true;
		element.querySelector("summary")?.click();
		return element.open;
	}`, nil)
	if err != nil {
		return fmt.Errorf("点击 %s 标题失败：%w", label, err)
	}
	opened, ok := open.(bool)
	if !ok || !opened {
		return fmt.Errorf("%s 标题点击后未展开", label)
	}
	return nil
}

// returnToTaskListIfOpen 在当前处于线程页时返回任务列表。
// frame 是 Paseo webview frame。
func returnToTaskListIfOpen(frame playwright.Frame) error {
	back := frame.Locator(`[data-testid="paseo-back-to-tasks"]`).First()
	count, err := back.Count()
	if err != nil {
		return err
	}
	if count == 0 {
		return nil
	}
	visible, err := back.IsVisible()
	if err != nil {
		return err
	}
	if !visible {
		return nil
	}
	if err := back.Click(); err != nil {
		return err
	}
	return frame.Locator(`[data-testid="paseo-task-view"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(30_000),
	})
}

// expectDetailsOpen 断言 details 元素展开状态。
// locator 是 details 元素。
// expected 是期望的展开状态。
func expectDetailsOpen(locator playwright.Locator, expected bool) error {
	value, err := locator.Evaluate(`element => element.open`, nil)
	if err != nil {
		return err
	}
	open, ok := value.(bool)
	if !ok {
		return fmt.Errorf("details open 状态不是布尔值：%v", value)
	}
	if open != expected {
		return fmt.Errorf("details open 状态为 %v，期望 %v", open, expected)
	}
	return nil
}

// createChatWithDefaultReadyProvider 验证首次使用时默认可用 provider 可直接发送。
// frame 是 Paseo webview frame。
func createChatWithDefaultReadyProvider(frame playwright.Frame) error {
	if err := expectSelectValue(frame.Locator(`[data-testid="paseo-composer-provider"]`), "mock", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-model"]`), "ten-second-stream", 30*time.Second); err != nil {
		return err
	}
	if err := expectSelectValue(frame.Locator(`[data-testid="paseo-composer-mode"]`), "load-test", 30*time.Second); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-input"]`).Fill("请用默认 provider 回复一段测试消息"); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-send"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-thread-view"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	return frame.Locator(`[data-testid="paseo-message-assistant"]`).First().WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	})
}

// expectComposerPreservesDraftOnError 断言发送失败后保留 composer 草稿。
// frame 是 Paseo webview frame。
func expectComposerPreservesDraftOnError(frame playwright.Frame) error {
	message := "这条消息应该失败但保留"
	if err := selectSyntheticOption(frame.Locator(`[data-testid="paseo-composer-provider"]`), "broken-provider", "Broken Provider"); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-input"]`).Fill(message); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-send"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-error"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(30_000),
	}); err != nil {
		return err
	}
	return expectInputValue(frame.Locator(`[data-testid="paseo-composer-input"]`), message, 10*time.Second)
}

// createAgentFromCommandPalette 通过命令面板创建 agent 并断言有回复。
// page 是 code-server 页面。
// frame 是 Paseo webview frame。
func createAgentFromCommandPalette(page playwright.Page, frame playwright.Frame) error {
	if err := expectSelectValue(frame.Locator(`[data-testid="paseo-composer-provider"]`), "mock", 30*time.Second); err != nil {
		return err
	}
	if err := runNewAgentCommand(page, "请从命令面板创建一段测试消息"); err != nil {
		return err
	}
	return expectCommandCreatedAgent(frame)
}

// createAgentFromCommandPaletteColdStart 从未打开侧栏的命令面板创建 agent。
// page 是 code-server 页面。
func createAgentFromCommandPaletteColdStart(page playwright.Page) error {
	if err := page.Locator(`.monaco-workbench`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := trustWorkspaceIfPrompted(page); err != nil {
		return err
	}
	if err := runNewAgentCommand(page, "请从冷启动命令面板创建一段测试消息"); err != nil {
		return err
	}
	frame, err := openPaseoView(page)
	if err != nil {
		return err
	}
	if err := expectText(frame.Locator(`[data-testid="paseo-daemon-status"]`), "已连接", 60*time.Second); err != nil {
		return err
	}
	return expectCommandCreatedAgent(frame)
}

// expectCommandCreatedAgent 断言命令面板创建的 agent 有回复并清理运行状态。
// frame 是 Paseo webview frame。
func expectCommandCreatedAgent(frame playwright.Frame) error {
	if err := frame.Locator(`[data-testid="paseo-thread-view"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-message-assistant"]`).First().WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	return stopSelectedAgentIfRunning(frame)
}

// runNewAgentCommand 执行命令面板新建 agent 命令并填写提示词。
// page 是 code-server 页面。
// message 是初始用户消息。
func runNewAgentCommand(page playwright.Page, message string) error {
	if err := page.Keyboard().Press("Control+Shift+P"); err != nil {
		return err
	}
	commandInput := page.Locator(`.quick-input-widget input`).First()
	if err := commandInput.WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(10_000),
	}); err != nil {
		return err
	}
	if err := commandInput.Fill(">Paseo: New Agent"); err != nil {
		return err
	}
	commandItem := page.Locator(`.quick-input-list .monaco-list-row:has-text("Paseo: New Agent")`).First()
	if err := commandItem.WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(10_000),
	}); err != nil {
		return err
	}
	if err := commandItem.Click(); err != nil {
		return err
	}
	promptInput := page.Locator(`.quick-input-widget input`).First()
	if err := promptInput.WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(10_000),
	}); err != nil {
		return err
	}
	if err := promptInput.Fill(message); err != nil {
		return err
	}
	return page.Keyboard().Press("Enter")
}

// stopSelectedAgentIfRunning 停止当前仍在运行的 agent，避免污染后续用例。
// frame 是 Paseo webview frame。
func stopSelectedAgentIfRunning(frame playwright.Frame) error {
	stopButton := frame.Locator(`[data-testid="paseo-composer-stop"]`).First()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		count, countErr := stopButton.Count()
		visible, visibleErr := stopButton.IsVisible()
		enabled, enabledErr := stopButton.IsEnabled()
		if countErr == nil && visibleErr == nil && enabledErr == nil && count > 0 && visible && enabled {
			if err := stopButton.Click(); err != nil {
				return err
			}
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if err := waitSelectedAgentIdle(frame, 30*time.Second); err != nil {
		return err
	}
	return expectRunningCountHidden(frame, 5*time.Second)
}

// expectCodexLikeUX 断言 Paseo 具备 Codex 风格任务交互。
// frame 是 Paseo webview frame。
func expectCodexLikeUX(frame playwright.Frame) error {
	if err := frame.Locator(`[data-testid="paseo-task-view"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(30_000),
	}); err != nil {
		return err
	}
	if err := expectRunningCountHidden(frame, 5*time.Second); err != nil {
		return err
	}
	searchCount, err := frame.Locator(`[data-testid="paseo-task-search"]`).Count()
	if err != nil {
		return err
	}
	if searchCount != 0 {
		return fmt.Errorf("任务列表不应展示搜索框，实际数量：%d", searchCount)
	}
	filterCount, err := frame.Locator(`.segmented`).Count()
	if err != nil {
		return err
	}
	if filterCount != 0 {
		return fmt.Errorf("任务列表不应展示过滤控件，实际数量：%d", filterCount)
	}
	if err := expectCodexLikeVisualChrome(frame); err != nil {
		return err
	}
	if err := expectComposerSelectsWithoutDashPlaceholder(frame); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-provider"]`), "mock", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-model"]`), "ten-second-stream", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-composer-mode"]`), "load-test", 30*time.Second); err != nil {
		return err
	}
	planModeCount, err := frame.Locator(`[data-testid="paseo-toggle-plan-mode"]`).Count()
	if err != nil {
		return err
	}
	if planModeCount != 0 {
		return fmt.Errorf("计划模式不应作为 composer 常驻入口展示，实际数量：%d", planModeCount)
	}
	ideContextCount, err := frame.Locator(`[data-testid="paseo-toggle-ide-context"]`).Count()
	if err != nil {
		return err
	}
	if ideContextCount != 0 {
		return fmt.Errorf("IDE 背景信息不应作为常驻入口展示，实际数量：%d", ideContextCount)
	}
	if err := frame.Locator(`[data-testid="paseo-composer-menu"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-toggle-ide-context"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(10_000),
	}); err != nil {
		return err
	}
	planMode := frame.Locator(`[data-testid="paseo-toggle-plan-mode"]`)
	if err := planMode.WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(10_000),
	}); err != nil {
		return err
	}
	planModeInput := frame.Locator(`[data-testid="paseo-toggle-plan-mode"] input`)
	checked, err := planModeInput.IsChecked()
	if err != nil {
		return err
	}
	if checked {
		return fmt.Errorf("计划模式默认不应启用")
	}
	if err := planMode.Click(); err != nil {
		return err
	}
	checked, err = planModeInput.IsChecked()
	if err != nil {
		return err
	}
	if !checked {
		return fmt.Errorf("计划模式菜单项点击后应启用")
	}
	if err := planMode.Click(); err != nil {
		return err
	}
	checked, err = planModeInput.IsChecked()
	if err != nil {
		return err
	}
	if checked {
		return fmt.Errorf("计划模式菜单项再次点击后应关闭")
	}
	if err := frame.Locator(`[data-testid="paseo-composer-input"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-input"]`).Fill("请输出一段测试消息"); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-send"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-thread-view"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := waitLocatorCountAtLeast(frame.Locator(`[data-testid="paseo-processing-group"]`), 1, 30*time.Second); err != nil {
		return err
	}
	if err := expectCodexLikeProcessingStyle(frame); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-composer-stop"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(30_000),
	}); err != nil {
		return err
	}
	if err := expectRunningCountHidden(frame, 5*time.Second); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-message-assistant"]`).First().WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-back-to-tasks"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-task-item"]`).First().WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(30_000),
	}); err != nil {
		return err
	}
	if err := expectCodexLikeTaskRowStyle(frame); err != nil {
		return err
	}
	return frame.Locator(`[data-testid="paseo-archive-agent"]`).First().WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(30_000),
	})
}

// expectCodexLikeVisualChrome 断言关键控件具备紧凑、可操作的视觉骨架。
// frame 是 Paseo webview frame。
func expectCodexLikeVisualChrome(frame playwright.Frame) error {
	controls := []struct {
		selector       string
		label          string
		requireEnabled bool
	}{
		{`[data-testid="paseo-composer-input"]`, "composer 输入框", true},
		{`[data-testid="paseo-composer-menu"]`, "composer 加号菜单", true},
		{`[data-testid="paseo-composer-provider"]`, "provider 选择器", true},
		{`[data-testid="paseo-composer-model"]`, "模型选择器", true},
		{`[data-testid="paseo-composer-mode"]`, "模式选择器", true},
		{`[data-testid="paseo-composer-send"]`, "发送按钮", false},
	}
	for _, control := range controls {
		if err := expectControlVisible(frame.Locator(control.selector), control.label, control.requireEnabled); err != nil {
			return err
		}
	}
	return expectBorderRadiusAtLeast(frame.Locator(`.composer-panel`).First(), "composer 面板", 14)
}

// expectComposerSelectsWithoutDashPlaceholder 断言 composer 选择框没有短横线占位。
// frame 是 Paseo webview frame。
func expectComposerSelectsWithoutDashPlaceholder(frame playwright.Frame) error {
	controls := []struct {
		selector string
		label    string
	}{
		{`[data-testid="paseo-composer-provider"]`, "provider 选择器"},
		{`[data-testid="paseo-composer-model"]`, "模型选择器"},
		{`[data-testid="paseo-composer-mode"]`, "模式选择器"},
	}
	for _, control := range controls {
		if err := expectSelectWithoutDashPlaceholder(frame.Locator(control.selector), control.label); err != nil {
			return err
		}
	}
	return nil
}

// expectSelectWithoutDashPlaceholder 断言单个选择框不包含短横线占位。
// locator 是待检查选择框。
// label 是错误提示中的控件名称。
func expectSelectWithoutDashPlaceholder(locator playwright.Locator, label string) error {
	value, err := locator.Evaluate(`element => Array.from(element.options).map(option => option.textContent.trim())`, nil)
	if err != nil {
		return fmt.Errorf("读取 %s 选项失败：%w", label, err)
	}
	options, ok := value.([]interface{})
	if !ok {
		return fmt.Errorf("%s 选项格式异常：%v", label, value)
	}
	for _, option := range options {
		text, ok := option.(string)
		if !ok {
			return fmt.Errorf("%s 选项不是文本：%v", label, option)
		}
		if text == "-" {
			return fmt.Errorf("%s 不应展示短横线占位", label)
		}
	}
	return nil
}

// expectCodexLikeProcessingStyle 断言处理中详情使用紧凑圆角样式。
// frame 是 Paseo webview frame。
func expectCodexLikeProcessingStyle(frame playwright.Frame) error {
	group := frame.Locator(`[data-testid="paseo-processing-group"]`).First()
	if err := expectBorderRadiusAtLeast(group, "处理中详情", 6); err != nil {
		return err
	}
	return expectElementBox(group.Locator("summary"), "处理中详情标题", 80, 36)
}

// expectCodexLikeTaskRowStyle 断言任务列表行具备可点击的圆角行样式。
// frame 是 Paseo webview frame。
func expectCodexLikeTaskRowStyle(frame playwright.Frame) error {
	row := frame.Locator(`[data-testid="paseo-task-item"]`).First()
	if err := expectControlVisible(row, "任务列表行", true); err != nil {
		return err
	}
	return expectBorderRadiusAtLeast(row, "任务列表行", 6)
}

// expectControlVisible 断言控件可见，并按需断言可用。
// locator 是待检查控件。
// label 是错误提示中的控件名称。
// requireEnabled 表示是否要求控件可用。
func expectControlVisible(locator playwright.Locator, label string, requireEnabled bool) error {
	if err := locator.WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(10_000),
	}); err != nil {
		return fmt.Errorf("%s 不可见：%w", label, err)
	}
	visible, err := locator.IsVisible()
	if err != nil {
		return err
	}
	if !visible {
		return fmt.Errorf("%s 应可见", label)
	}
	if !requireEnabled {
		return nil
	}
	enabled, err := locator.IsEnabled()
	if err != nil {
		return err
	}
	if !enabled {
		return fmt.Errorf("%s 应可操作", label)
	}
	return nil
}

// expectElementBox 断言元素尺寸紧凑且文字不竖排。
// locator 是待检查元素。
// label 是错误提示中的元素名称。
// minWidth 是最小宽度。
// maxHeight 是最大高度。
func expectElementBox(locator playwright.Locator, label string, minWidth float64, maxHeight float64) error {
	if err := expectControlVisible(locator, label, false); err != nil {
		return err
	}
	value, err := locator.Evaluate(`element => {
		const rect = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		return { width: rect.width, height: rect.height, whiteSpace: style.whiteSpace };
	}`, nil)
	if err != nil {
		return err
	}
	metrics, ok := value.(map[string]interface{})
	if !ok {
		return fmt.Errorf("%s 尺寸信息不可读：%v", label, value)
	}
	width, widthOK := numberMetric(metrics["width"])
	height, heightOK := numberMetric(metrics["height"])
	whiteSpace, _ := metrics["whiteSpace"].(string)
	if !widthOK || !heightOK {
		return fmt.Errorf("%s 尺寸数值不可读：%v", label, metrics)
	}
	if width < minWidth || height > maxHeight || whiteSpace != "nowrap" {
		return fmt.Errorf("%s 尺寸不够紧凑：width=%.1f height=%.1f white-space=%s", label, width, height, whiteSpace)
	}
	return nil
}

// expectBorderRadiusAtLeast 断言元素圆角达到指定下限。
// locator 是待检查元素。
// label 是错误提示中的元素名称。
// minimum 是最小圆角像素值。
func expectBorderRadiusAtLeast(locator playwright.Locator, label string, minimum float64) error {
	if err := expectControlVisible(locator, label, false); err != nil {
		return err
	}
	value, err := locator.Evaluate(`element => parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0`, nil)
	if err != nil {
		return err
	}
	radius, ok := numberMetric(value)
	if !ok {
		return fmt.Errorf("%s 圆角信息不可读：%v", label, value)
	}
	if radius < minimum {
		return fmt.Errorf("%s 圆角过小：%.1fpx，期望至少 %.1fpx", label, radius, minimum)
	}
	return nil
}

// numberMetric 将 Playwright 返回的数值归一化为 float64。
// value 是 Evaluate 返回的原始数值。
func numberMetric(value interface{}) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case int32:
		return float64(typed), true
	default:
		return 0, false
	}
}
