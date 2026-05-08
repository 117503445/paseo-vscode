package e2e

import (
	"context"
	"path/filepath"
)

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
	for _, name := range []string{"offline-daemon-start", "default-ready-provider", "composer-preserves-draft-on-error", "command-new-agent-default-provider", "codex-like-ux", "mock-chat", "reload-reconnect"} {
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
