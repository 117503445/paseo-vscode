package install

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

// config 描述扩展安装配置。
type config struct {
	vsixPath         string
	codeServerBin    string
	vscodeServerBin  string
	skipCodeServer   bool
	skipVSCodeServer bool
	dryRun           bool
}

// target 描述一个扩展安装目标。
type target struct {
	name string
	bin  string
}

// Run 执行扩展安装命令。
// ctx 控制命令生命周期。
// args 是 install-extension 子命令参数。
func Run(ctx context.Context, args []string) error {
	cfg, err := parseArgs(args)
	if err != nil {
		return err
	}
	targets, err := discoverTargets(cfg)
	if err != nil {
		return err
	}
	if len(targets) == 0 {
		return errors.New("未发现可用的 code-server 或 vscode-server 安装目标")
	}
	var installErrors []error
	for _, target := range targets {
		if err := installToTarget(ctx, target, cfg.vsixPath, cfg.dryRun); err != nil {
			installErrors = append(installErrors, fmt.Errorf("%s: %w", target.name, err))
		}
	}
	return errors.Join(installErrors...)
}

// parseArgs 解析安装参数。
// args 是 install-extension 子命令参数。
func parseArgs(args []string) (config, error) {
	fs := flag.NewFlagSet("install-extension", flag.ContinueOnError)
	fs.SetOutput(os.Stdout)
	cfg := config{
		codeServerBin:   os.Getenv("PASEO_CODE_SERVER_BIN"),
		vscodeServerBin: os.Getenv("PASEO_VSCODE_SERVER_BIN"),
	}
	fs.StringVar(&cfg.codeServerBin, "code-server-bin", cfg.codeServerBin, "宿主机 code-server 可执行文件路径")
	fs.StringVar(&cfg.vscodeServerBin, "vscode-server-bin", cfg.vscodeServerBin, "vscode-server code-server 可执行文件路径")
	fs.BoolVar(&cfg.skipCodeServer, "skip-code-server", false, "跳过宿主机 code-server 安装")
	fs.BoolVar(&cfg.skipVSCodeServer, "skip-vscode-server", false, "跳过 vscode-server 安装")
	fs.BoolVar(&cfg.dryRun, "dry-run", false, "只输出安装目标，不执行安装")
	if err := fs.Parse(args); err != nil {
		return config{}, err
	}
	if fs.NArg() != 1 {
		return config{}, errors.New("用法：install-extension [flags] <vsix>")
	}
	vsixPath, err := filepath.Abs(fs.Arg(0))
	if err != nil {
		return config{}, err
	}
	info, err := os.Stat(vsixPath)
	if err != nil {
		return config{}, fmt.Errorf("读取 VSIX 失败：%w", err)
	}
	if info.IsDir() {
		return config{}, fmt.Errorf("VSIX 路径不能是目录：%s", vsixPath)
	}
	cfg.vsixPath = vsixPath
	return cfg, nil
}

// discoverTargets 探测扩展安装目标。
// cfg 是安装配置。
func discoverTargets(cfg config) ([]target, error) {
	var targets []target
	seen := map[string]bool{}
	if !cfg.skipCodeServer {
		codeServerBin := cfg.codeServerBin
		if codeServerBin == "" {
			if path, err := exec.LookPath("code-server"); err == nil {
				codeServerBin = path
			}
		}
		if codeServerBin != "" && !isVSCodeServerPath(codeServerBin) {
			addTarget(&targets, seen, target{name: "code-server", bin: codeServerBin})
		}
	}
	if !cfg.skipVSCodeServer {
		if cfg.vscodeServerBin != "" {
			addTarget(&targets, seen, target{name: "vscode-server", bin: cfg.vscodeServerBin})
		}
		for _, bin := range discoverVSCodeServerBins() {
			addTarget(&targets, seen, target{name: "vscode-server", bin: bin})
		}
	}
	return targets, nil
}

// addTarget 添加未重复的安装目标。
// targets 是安装目标列表。
// seen 是已添加路径集合。
// item 是待添加安装目标。
func addTarget(targets *[]target, seen map[string]bool, item target) {
	key := canonicalPath(item.bin)
	if seen[key] {
		return
	}
	seen[key] = true
	*targets = append(*targets, target{name: item.name, bin: key})
}

// discoverVSCodeServerBins 查找官方 VS Code Server 的安装 CLI。
func discoverVSCodeServerBins() []string {
	roots := vscodeServerRoots()
	var bins []string
	for _, root := range roots {
		rootBins := discoverVSCodeServerBinsInRoot(root)
		bins = append(bins, rootBins...)
	}
	return uniqueStrings(bins)
}

// vscodeServerRoots 返回需要探测的 VS Code Server 根目录。
func vscodeServerRoots() []string {
	var roots []string
	if value := os.Getenv("VSCODE_AGENT_FOLDER"); value != "" {
		roots = append(roots, value)
	}
	home, err := os.UserHomeDir()
	if err == nil && home != "" {
		roots = append(roots, filepath.Join(home, ".vscode-server"))
		roots = append(roots, filepath.Join(home, ".vscode-server-insiders"))
	}
	return uniqueStrings(roots)
}

// discoverVSCodeServerBinsInRoot 查找单个 VS Code Server 根目录内的 CLI。
// root 是 VS Code Server 根目录。
func discoverVSCodeServerBinsInRoot(root string) []string {
	if !dirExists(root) {
		return nil
	}
	for _, serverName := range readLRUServerNames(filepath.Join(root, "cli", "servers", "lru.json")) {
		path := filepath.Join(root, "cli", "servers", serverName, "server", "bin", "code-server")
		if executableExists(path) {
			return []string{path}
		}
	}
	var bins []string
	patterns := []string{
		filepath.Join(root, "cli", "servers", "*", "server", "bin", "code-server"),
		filepath.Join(root, "bin", "*", "bin", "code-server"),
	}
	for _, pattern := range patterns {
		matches, _ := filepath.Glob(pattern)
		sort.Strings(matches)
		for _, match := range matches {
			if executableExists(match) {
				bins = append(bins, match)
			}
		}
	}
	return bins
}

// readLRUServerNames 读取 VS Code Server 最近使用的 server 名称。
// path 是 lru.json 文件路径。
func readLRUServerNames(path string) []string {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var names []string
	if err := json.Unmarshal(data, &names); err != nil {
		return nil
	}
	return names
}

// installToTarget 安装 VSIX 到指定目标。
// ctx 控制命令生命周期。
// installTarget 是安装目标。
// vsixPath 是 VSIX 文件路径。
// dryRun 表示只输出命令，不执行安装。
func installToTarget(ctx context.Context, installTarget target, vsixPath string, dryRun bool) error {
	args := []string{"--install-extension", vsixPath, "--force"}
	fmt.Printf("安装扩展到 %s：%s %s\n", installTarget.name, installTarget.bin, strings.Join(args, " "))
	if dryRun {
		return nil
	}
	cmd := exec.CommandContext(ctx, installTarget.bin, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// executableExists 判断路径是否是可执行文件。
// path 是待检查路径。
func executableExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		return false
	}
	return info.Mode()&0o111 != 0
}

// dirExists 判断路径是否是目录。
// path 是待检查路径。
func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// isVSCodeServerPath 判断路径是否属于官方 VS Code Server。
// path 是可执行文件路径。
func isVSCodeServerPath(path string) bool {
	path = filepath.ToSlash(path)
	return strings.Contains(path, "/.vscode-server/") || strings.Contains(path, "/.vscode-server-insiders/")
}

// canonicalPath 返回去重用的规范路径。
// path 是原始路径。
func canonicalPath(path string) string {
	if !strings.ContainsAny(path, `/\`) {
		if resolvedPath, err := exec.LookPath(path); err == nil {
			path = resolvedPath
		}
	}
	absPath, err := filepath.Abs(path)
	if err == nil {
		path = absPath
	}
	if realPath, err := filepath.EvalSymlinks(path); err == nil {
		path = realPath
	}
	return path
}

// uniqueStrings 返回保持顺序的去重字符串列表。
// values 是原始字符串列表。
func uniqueStrings(values []string) []string {
	result := make([]string, 0, len(values))
	seen := map[string]bool{}
	for _, value := range values {
		if value == "" {
			continue
		}
		key := canonicalPath(value)
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, key)
	}
	return result
}
