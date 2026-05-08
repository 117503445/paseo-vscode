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
