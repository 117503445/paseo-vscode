package main

import (
	"context"
	"fmt"

	"github.com/getpaseo/paseo-vscode/scripts/go-scripts/internal/e2e"
	"github.com/getpaseo/paseo-vscode/scripts/go-scripts/internal/install"
)

// run 分发脚本子命令。
// args 是命令行参数。
func run(ctx context.Context, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("缺少命令，支持：e2e、install-extension")
	}
	switch args[0] {
	case "e2e":
		return e2e.Run(ctx, args[1:])
	case "install-extension":
		return install.Run(ctx, args[1:])
	default:
		return fmt.Errorf("未知命令：%s", args[0])
	}
}
