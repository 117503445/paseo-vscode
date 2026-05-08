package e2e

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/playwright-community/playwright-go"
)

// runInsideRunner 在 Playwright runner 容器内运行浏览器用例。
// ctx 控制测试生命周期。
// cfg 是 E2E 配置。
func runInsideRunner(ctx context.Context, cfg Config) error {
	cases := allCases
	if cfg.Case == "" {
		cfg.Case = os.Getenv("PASEO_E2E_CASE")
	}
	if cfg.Case != "" {
		cases = []string{cfg.Case}
	}
	targetHost := "code-server"
	if len(cases) == 1 && cases[0] == "no-folder" {
		targetHost = "code-server-no-folder"
	}
	baseURL := fmt.Sprintf("http://%s:8080", targetHost)
	if err := waitHTTP(ctx, baseURL, 90*time.Second); err != nil {
		return err
	}
	pw, err := playwright.Run()
	if err != nil {
		return err
	}
	defer pw.Stop()
	launchOptions := playwright.BrowserTypeLaunchOptions{
		Headless: playwright.Bool(true),
		Args: []string{
			"--unsafely-treat-insecure-origin-as-secure=" + baseURL,
		},
	}
	if executablePath := os.Getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"); executablePath != "" {
		launchOptions.ExecutablePath = playwright.String(executablePath)
	}
	browser, err := pw.Chromium.Launch(launchOptions)
	if err != nil {
		return err
	}
	defer browser.Close()
	page, err := browser.NewPage()
	if err != nil {
		return err
	}
	if err := loginCodeServer(page, baseURL); err != nil {
		return err
	}
	for _, name := range cases {
		if err := runCase(ctx, page, baseURL, name); err != nil {
			artifactDir := os.Getenv("PASEO_E2E_ARTIFACT_DIR")
			if artifactDir == "" {
				artifactDir = "/tmp"
			}
			_ = os.MkdirAll(artifactDir, 0o755)
			_, _ = page.Screenshot(playwright.PageScreenshotOptions{
				Path: playwright.String(filepath.Join(artifactDir, "paseo-vscode-"+name+".png")),
			})
			return fmt.Errorf("%s: %w", name, err)
		}
	}
	return nil
}

// loginCodeServer 登录 code-server。
// page 是 Playwright 页面。
// baseURL 是 code-server 地址。
func loginCodeServer(page playwright.Page, baseURL string) error {
	if _, err := page.Goto(baseURL); err != nil {
		return err
	}
	password := page.Locator(`input[type="password"]`)
	count, err := password.Count()
	if err != nil {
		return err
	}
	if count == 0 {
		return trustWorkspaceIfPrompted(page)
	}
	if err := password.Fill("paseo-e2e"); err != nil {
		return err
	}
	if err := page.Keyboard().Press("Enter"); err != nil {
		return err
	}
	return trustWorkspaceIfPrompted(page)
}

// trustWorkspaceIfPrompted 处理 code-server 工作区信任弹窗。
// page 是 Playwright 页面。
func trustWorkspaceIfPrompted(page playwright.Page) error {
	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		buttons := []playwright.Locator{
			page.GetByRole(*playwright.AriaRoleButton, playwright.PageGetByRoleOptions{
				Name: "Yes, I trust the authors",
			}),
			page.Locator(`button:has-text("Yes, I trust the authors")`),
			page.Locator(`.monaco-button:has-text("Yes, I trust the authors")`),
		}
		for _, button := range buttons {
			if count, _ := button.Count(); count == 0 {
				continue
			}
			if err := button.First().Click(playwright.LocatorClickOptions{
				Timeout: playwright.Float(2_000),
			}); err == nil {
				time.Sleep(time.Second)
				return nil
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
	return nil
}

// openPaseoView 打开 Paseo 视图并返回 webview frame。
// page 是 Playwright 页面。
func openPaseoView(page playwright.Page) (playwright.Frame, error) {
	if err := page.Locator(`.monaco-workbench`).WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return nil, err
	}
	if err := trustWorkspaceIfPrompted(page); err != nil {
		return nil, err
	}
	if frame, err := waitPaseoFrame(page, 2*time.Second); err == nil {
		return frame, nil
	}
	selectors := []string{
		`.activitybar [aria-label="Paseo"]`,
		`.activitybar [aria-label*="Paseo"]`,
		`.activitybar [title="Paseo"]`,
		`[aria-label="Paseo"]`,
		`[title="Paseo"]`,
		`a[aria-label*="Paseo"]`,
	}
	for _, selector := range selectors {
		locator := page.Locator(selector).First()
		if count, _ := locator.Count(); count > 0 {
			if err := locator.Click(playwright.LocatorClickOptions{
				Timeout: playwright.Float(5_000),
			}); err == nil {
				time.Sleep(500 * time.Millisecond)
				break
			}
		}
	}
	frame, err := waitPaseoFrame(page, 60*time.Second)
	if err != nil {
		return nil, fmt.Errorf("%w；相关页面元素：%s；frames：%s", err, dumpPaseoElements(page), dumpFrames(page))
	}
	return frame, nil
}

// waitPaseoFrame 等待并返回包含 Paseo 根节点的 frame。
// page 是 Playwright 页面。
// timeout 是等待超时。
func waitPaseoFrame(page playwright.Page, timeout time.Duration) (playwright.Frame, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		for _, frame := range page.Frames() {
			count, err := frame.Locator(`[data-testid="paseo-root"]`).Count()
			if err == nil && count > 0 {
				return frame, nil
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return nil, fmt.Errorf("等待 Paseo webview 超时")
}

// dumpPaseoElements 输出页面中和 Paseo 相关的元素摘要。
// page 是 Playwright 页面。
func dumpPaseoElements(page playwright.Page) string {
	result, err := page.Evaluate(`() => Array.from(document.querySelectorAll('[aria-label],[title]'))
		.map((element) => ({
			tag: element.tagName,
			aria: element.getAttribute('aria-label') || '',
			title: element.getAttribute('title') || '',
			text: (element.textContent || '').trim().slice(0, 80)
		}))
		.filter((item) => /paseo|chat/i.test([item.aria, item.title, item.text].join(' ')))
		.slice(0, 20)
		.map((item) => item.tag + ' aria=' + item.aria + ' title=' + item.title + ' text=' + item.text)
		.join(' | ')`)
	if err != nil {
		return err.Error()
	}
	text, ok := result.(string)
	if !ok || text == "" {
		return "无"
	}
	return text
}

// dumpFrames 输出当前页面 frame 摘要。
// page 是 Playwright 页面。
func dumpFrames(page playwright.Page) string {
	frames := page.Frames()
	parts := make([]string, 0, len(frames))
	for _, frame := range frames {
		title, _ := frame.Title()
		body, _ := frame.Evaluate(`() => (document.body && document.body.innerHTML || '').replace(/\s+/g, ' ').slice(0, 160)`)
		bodyText, _ := body.(string)
		parts = append(parts, fmt.Sprintf("name=%s title=%s url=%s body=%s", frame.Name(), title, frame.URL(), bodyText))
	}
	return strings.Join(parts, " | ")
}
