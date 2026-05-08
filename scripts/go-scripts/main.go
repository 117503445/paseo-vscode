package main

import (
	"context"
	"fmt"
	"os"
)

// main 是脚本入口。
func main() {
	if err := run(context.Background(), os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
