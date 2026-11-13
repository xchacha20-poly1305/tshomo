package main

import (
	"context"
	"flag"
	"os"
	"os/signal"
	"syscall"

	box "github.com/sagernet/sing-box"
	"github.com/sagernet/sing-box/include"
	"github.com/sagernet/sing-box/log"
	"github.com/sagernet/sing-box/option"
	E "github.com/sagernet/sing/common/exceptions"
	"github.com/sagernet/sing/common/json"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	configPath := flag.String("config", "", "Path to the test configuration")
	dataDir := flag.String("data-dir", "", "Isolated test data directory")
	flag.Parse()
	if *configPath == "" || *dataDir == "" {
		return E.New("both -config and -data-dir are required")
	}
	err := os.Chdir(*dataDir)
	if err != nil {
		return E.Cause(err, "enter data directory")
	}
	content, err := os.ReadFile(*configPath)
	if err != nil {
		return E.Cause(err, "read configuration")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx = include.Context(ctx)
	options, err := json.UnmarshalExtendedContext[option.Options](ctx, content)
	if err != nil {
		return E.Cause(err, "parse configuration")
	}
	instance, err := box.New(box.Options{Context: ctx, Options: options})
	if err != nil {
		return E.Cause(err, "create sing-box")
	}
	err = instance.Start()
	if err != nil {
		_ = instance.Close()
		return E.Cause(err, "start sing-box")
	}
	<-ctx.Done()
	return instance.Close()
}
