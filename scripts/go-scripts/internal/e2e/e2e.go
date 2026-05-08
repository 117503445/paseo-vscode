package e2e

import (
	"context"
	"errors"
	"flag"
	"os"
	"path/filepath"
)

// Config 描述 E2E 运行配置。
type Config struct {
	Case         string
	InsideRunner bool
	ProjectRoot  string
}

var allCases = []string{"offline-daemon-start", "default-ready-provider", "composer-preserves-draft-on-error", "command-new-agent-default-provider", "codex-like-ux", "mock-chat", "reload-reconnect", "no-folder"}

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
