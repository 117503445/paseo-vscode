package e2e

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/playwright-community/playwright-go"
)

// Config 描述 E2E 运行配置。
type Config struct {
	Case         string
	InsideRunner bool
	ProjectRoot  string
}

var allCases = []string{"offline-daemon-start", "mock-chat", "reload-reconnect", "no-folder"}

// Run 执行 E2E 命令。
// args 是 e2e 子命令参数。
func Run(ctx context.Context, args []string) error {
	cfg, err := parseArgs(args)
	if err != nil {
		return err
	}
	if cfg.InsideRunner {
		return runInsideRunner(ctx, cfg)
	}
	return runOrchestrator(ctx, cfg)
}

// parseArgs 解析 E2E 参数。
// args 是 e2e 子命令参数。
func parseArgs(args []string) (Config, error) {
	fs := flag.NewFlagSet("e2e", flag.ContinueOnError)
	fs.SetOutput(os.Stdout)
	var cfg Config
	fs.StringVar(&cfg.Case, "case", "", "只运行指定 E2E case")
	fs.BoolVar(&cfg.InsideRunner, "inside-runner", os.Getenv("PASEO_E2E_INSIDE_RUNNER") == "1", "在 runner 容器内运行")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	root, err := findProjectRoot()
	if err != nil {
		return Config{}, err
	}
	cfg.ProjectRoot = root
	return cfg, nil
}

// findProjectRoot 查找项目根目录。
func findProjectRoot() (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if fileExists(filepath.Join(wd, "package.json")) && fileExists(filepath.Join(wd, "Taskfile.yml")) {
			return wd, nil
		}
		next := filepath.Dir(wd)
		if next == wd {
			return "", errors.New("无法定位项目根目录")
		}
		wd = next
	}
}

// runOrchestrator 在宿主机上编排 Docker E2E。
// ctx 控制命令生命周期。
// cfg 是 E2E 配置。
func runOrchestrator(ctx context.Context, cfg Config) error {
	composeFile := filepath.Join(cfg.ProjectRoot, "docker", "e2e", "compose.yaml")
	if cfg.Case == "" {
		return runAllOrchestrator(ctx, cfg, composeFile)
	}
	service := "code-server"
	if cfg.Case == "no-folder" {
		service = "code-server-no-folder"
	}
	buildArgs := []string{"compose", "-f", composeFile, "build", service, "e2e-runner"}
	if err := runCommand(ctx, cfg.ProjectRoot, "docker", buildArgs...); err != nil {
		return err
	}
	defer func() {
		_ = runCommand(context.Background(), cfg.ProjectRoot, "docker", "compose", "-f", composeFile, "down", "-v", "--remove-orphans")
	}()
	if err := runCommand(ctx, cfg.ProjectRoot, "docker", "compose", "-f", composeFile, "up", "-d", service); err != nil {
		return err
	}
	args := []string{"compose", "-f", composeFile, "run", "--rm", "-e", "PASEO_E2E_INSIDE_RUNNER=1"}
	if cfg.Case != "" {
		args = append(args, "-e", "PASEO_E2E_CASE="+cfg.Case)
	}
	args = append(args, "e2e-runner")
	if cfg.Case != "" {
		args = append(args, "--case", cfg.Case)
	}
	if err := runCommand(ctx, cfg.ProjectRoot, "docker", args...); err != nil {
		_ = dumpComposeServiceLogs(cfg.ProjectRoot, composeFile, service)
		return err
	}
	return nil
}

// runAllOrchestrator 编排全部 E2E case。
// ctx 控制命令生命周期。
// cfg 是 E2E 配置。
// composeFile 是 Docker Compose 文件路径。
func runAllOrchestrator(ctx context.Context, cfg Config, composeFile string) error {
	if err := runCommand(ctx, cfg.ProjectRoot, "docker", "compose", "-f", composeFile, "build"); err != nil {
		return err
	}
	defer func() {
		_ = runCommand(context.Background(), cfg.ProjectRoot, "docker", "compose", "-f", composeFile, "down", "-v", "--remove-orphans")
	}()
	if err := runCommand(ctx, cfg.ProjectRoot, "docker", "compose", "-f", composeFile, "up", "-d", "code-server"); err != nil {
		return err
	}
	for _, name := range []string{"offline-daemon-start", "mock-chat", "reload-reconnect"} {
		extraEnv := []string{}
		if name == "reload-reconnect" {
			extraEnv = append(extraEnv, "PASEO_E2E_EXPECT_RELOAD_AGENT=1")
		}
		if err := runRunnerCaseWithEnv(ctx, cfg.ProjectRoot, composeFile, name, extraEnv); err != nil {
			_ = dumpComposeServiceLogs(cfg.ProjectRoot, composeFile, "code-server")
			return err
		}
	}
	if err := runCommand(ctx, cfg.ProjectRoot, "docker", "compose", "-f", composeFile, "up", "-d", "code-server-no-folder"); err != nil {
		return err
	}
	if err := runRunnerCase(ctx, cfg.ProjectRoot, composeFile, "no-folder"); err != nil {
		_ = dumpComposeServiceLogs(cfg.ProjectRoot, composeFile, "code-server-no-folder")
		return err
	}
	return nil
}

// runRunnerCase 在 runner 容器中运行单个 case。
// ctx 控制命令生命周期。
// projectRoot 是项目根目录。
// composeFile 是 Docker Compose 文件路径。
// name 是 case 名称。
func runRunnerCase(ctx context.Context, projectRoot string, composeFile string, name string) error {
	return runRunnerCaseWithEnv(ctx, projectRoot, composeFile, name, nil)
}

// runRunnerCaseWithEnv 在 runner 容器中运行单个 case，并附加环境变量。
// ctx 控制命令生命周期。
// projectRoot 是项目根目录。
// composeFile 是 Docker Compose 文件路径。
// name 是 case 名称。
// extraEnv 是额外传入 runner 的 KEY=VALUE 环境变量。
func runRunnerCaseWithEnv(ctx context.Context, projectRoot string, composeFile string, name string, extraEnv []string) error {
	args := []string{
		"compose", "-f", composeFile,
		"run", "--rm",
		"-e", "PASEO_E2E_INSIDE_RUNNER=1",
		"-e", "PASEO_E2E_CASE=" + name,
	}
	for _, value := range extraEnv {
		args = append(args, "-e", value)
	}
	args = append(args, "e2e-runner", "--case", name)
	return runCommand(ctx, projectRoot, "docker", args...)
}

// dumpComposeServiceLogs 输出服务日志和 paseo home 诊断信息。
// projectRoot 是项目根目录。
// composeFile 是 Docker Compose 文件路径。
// service 是服务名称。
func dumpComposeServiceLogs(projectRoot string, composeFile string, service string) error {
	if err := runCommand(context.Background(), projectRoot, "docker", "compose", "-f", composeFile, "logs", service); err != nil {
		return err
	}
	return runCommand(context.Background(), projectRoot, "docker", "compose", "-f", composeFile, "exec", "-T", service, "sh", "-lc", "ps -ef; find /tmp/paseo-home -maxdepth 3 -type f -print -exec sh -c 'echo ==== $1; tail -n 120 $1' sh {} \\;")
}

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
	agent := frame.Locator(`[data-testid="paseo-agent"]`).First()
	if err := agent.WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := agent.Click(); err != nil {
		return err
	}
	if err := waitLocatorCountAtLeast(frame.Locator(`[data-testid="paseo-timeline-user"]`), 1, 30*time.Second); err != nil {
		return err
	}
	return waitLocatorCountAtLeast(frame.Locator(`[data-testid="paseo-timeline-assistant"]`), 1, 30*time.Second)
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

// createMockChat 创建 mock agent 并断言 timeline。
// frame 是 Paseo webview frame。
func createMockChat(frame playwright.Frame) error {
	provider := frame.Locator(`[data-testid="paseo-provider-select"]`)
	if _, err := provider.SelectOption(playwright.SelectOptionValues{Values: &[]string{"mock"}}); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-model-select"]`), "ten-second-stream", 30*time.Second); err != nil {
		return err
	}
	if err := selectOptionWhenAvailable(frame.Locator(`[data-testid="paseo-mode-select"]`), "load-test", 30*time.Second); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-new-agent-prompt"]`).Fill("请输出一段测试消息"); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-create-agent"]`).Click(); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-agent"]`).First().WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-timeline-assistant"]`).First().WaitFor(playwright.LocatorWaitForOptions{
		Timeout: playwright.Float(60_000),
	}); err != nil {
		return err
	}
	sendButton := frame.Locator(`[data-testid="paseo-send-message"]`)
	if err := waitLocatorEnabled(sendButton, 60*time.Second); err != nil {
		return err
	}
	if err := frame.Locator(`[data-testid="paseo-message-input"]`).Fill("第二条测试消息"); err != nil {
		return err
	}
	if err := sendButton.Click(); err != nil {
		return err
	}
	return waitLocatorCountAtLeast(frame.Locator(`[data-testid="paseo-timeline-user"]`), 2, 30*time.Second)
}

// selectOptionWhenAvailable 等待目标 option 可用并选择。
// locator 是 select 元素。
// value 是目标 option value。
// timeout 是等待超时时间。
func selectOptionWhenAvailable(locator playwright.Locator, value string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var lastError error
	for time.Now().Before(deadline) {
		selected, err := locator.SelectOption(
			playwright.SelectOptionValues{Values: &[]string{value}},
			playwright.LocatorSelectOptionOptions{Timeout: playwright.Float(1_000)},
		)
		if err == nil && len(selected) > 0 {
			return nil
		}
		lastError = err
		time.Sleep(500 * time.Millisecond)
	}
	if lastError != nil {
		return fmt.Errorf("选择 option %q 超时：%w", value, lastError)
	}
	return fmt.Errorf("选择 option %q 超时", value)
}

// waitLocatorEnabled 等待元素变为可用状态。
// locator 是目标元素。
// timeout 是等待超时时间。
func waitLocatorEnabled(locator playwright.Locator, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		enabled, err := locator.IsEnabled()
		if err == nil && enabled {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("等待元素可用超时")
}

// waitLocatorCountAtLeast 等待元素数量达到下限。
// locator 是待计数元素。
// minimum 是期望最小数量。
// timeout 是等待超时时间。
func waitLocatorCountAtLeast(locator playwright.Locator, minimum int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	lastCount := 0
	for time.Now().Before(deadline) {
		count, err := locator.Count()
		if err == nil {
			lastCount = count
		}
		if err == nil && count >= minimum {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("等待元素数量达到 %d 超时，最后数量：%d", minimum, lastCount)
}

// expectText 等待元素包含指定文本。
// locator 是目标元素。
// expected 是期望文本。
// timeout 是等待超时。
func expectText(locator playwright.Locator, expected string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	lastText := ""
	for time.Now().Before(deadline) {
		text, err := locator.TextContent()
		if err == nil {
			lastText = text
		}
		if err == nil && strings.Contains(text, expected) {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("等待文本 %q 超时，最后文本：%q", expected, lastText)
}

// waitHTTP 等待 HTTP 服务可访问。
// ctx 控制等待生命周期。
// url 是服务地址。
// timeout 是等待超时。
func waitHTTP(ctx context.Context, url string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := http.Client{Timeout: 2 * time.Second}
	for time.Now().Before(deadline) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}
		resp, err := client.Do(req)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode < 500 {
				return nil
			}
		}
		time.Sleep(time.Second)
	}
	return fmt.Errorf("等待服务 %s 超时", url)
}

// runCommand 执行外部命令。
// ctx 控制命令生命周期。
// dir 是工作目录。
// name 是命令名称。
// args 是命令参数。
func runCommand(ctx context.Context, dir string, name string, args ...string) error {
	fmt.Printf("+ %s %s\n", name, strings.Join(args, " "))
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// fileExists 判断文件是否存在。
// path 是文件路径。
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
