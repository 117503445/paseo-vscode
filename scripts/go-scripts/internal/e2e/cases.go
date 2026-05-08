package e2e

import (
	"context"
	"fmt"
	"os"
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
	return expectText(frame.Locator(`[data-testid="paseo-running-count"]`), "0 正在进行中", 30*time.Second)
}

// expectCodexLikeUX 断言 Paseo 具备 Codex 风格任务交互。
// frame 是 Paseo webview frame。
func expectCodexLikeUX(frame playwright.Frame) error {
	if err := frame.Locator(`[data-testid="paseo-task-view"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(30_000),
	}); err != nil {
		return err
	}
	if err := expectText(frame.Locator(`[data-testid="paseo-running-count"]`), "0 正在进行中", 30*time.Second); err != nil {
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
	if err := frame.Locator(`[data-testid="paseo-composer-menu"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-toggle-ide-context"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(10_000),
	}); err != nil {
		return err
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
	if err := frame.Locator(`[data-testid="paseo-composer-stop"]`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(30_000),
	}); err != nil {
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
	return frame.Locator(`[data-testid="paseo-archive-agent"]`).First().WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(30_000),
	})
}
