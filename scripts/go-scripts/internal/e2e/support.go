package e2e

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

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
