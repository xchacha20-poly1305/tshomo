package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	C "github.com/metacubex/mihomo/constant"
	"github.com/metacubex/mihomo/hub"
	"github.com/metacubex/mihomo/hub/executor"
	"github.com/metacubex/mihomo/log"
)

func main() {
	if err := run(); err != nil {
		log.Fatalln("%v", err)
	}
}

func run() error {
	configPath := flag.String("config", "", "Path to the test configuration")
	dataDir := flag.String("data-dir", "", "Isolated test data directory")
	flag.Parse()
	if *configPath == "" || *dataDir == "" {
		return fmt.Errorf("both -config and -data-dir are required")
	}
	C.SetHomeDir(*dataDir)
	C.SetConfig(*configPath)
	content, err := os.ReadFile(*configPath)
	if err != nil {
		return fmt.Errorf("read configuration: %w", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err = hub.Parse(content); err != nil {
		return fmt.Errorf("start mihomo: %w", err)
	}
	defer executor.Shutdown()
	<-ctx.Done()
	return nil
}
