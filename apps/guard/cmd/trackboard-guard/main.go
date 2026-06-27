package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/astoriel/trackboard/apps/guard/internal/config"
	"github.com/astoriel/trackboard/apps/guard/internal/contract"
	"github.com/astoriel/trackboard/apps/guard/internal/replay"
	"github.com/astoriel/trackboard/apps/guard/internal/server"
	"github.com/astoriel/trackboard/apps/guard/internal/store"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "replay" {
		if err := replayCommand(os.Args[2:]); err != nil {
			slog.Error("replay failed", "error", err)
			os.Exit(1)
		}
		return
	}

	configPath := flag.String("config", "guard.yaml", "path to Guard config file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	srv := server.New(cfg)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.ListenAndServe()
	}()
	slog.Info("trackboard guard listening", "addr", cfg.HTTPAddr)

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			slog.Error("graceful shutdown failed", "error", err)
			os.Exit(1)
		}
	case err := <-errCh:
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}
}

func replayCommand(args []string) error {
	flags := flag.NewFlagSet("replay", flag.ContinueOnError)
	configPath := flags.String("config", "guard.yaml", "path to Guard config file")
	limit := flags.Int("limit", 100, "maximum DLQ rows to replay")
	if err := flags.Parse(args); err != nil {
		return err
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	loaded, err := contract.NewLoader(cfg.ContractFile).Load()
	if err != nil {
		return err
	}
	db, err := store.Open(context.Background(), cfg.StoreFile)
	if err != nil {
		return err
	}
	defer db.Close()
	summary, err := replay.Run(context.Background(), db, loaded, cfg.Destination, *limit)
	if err != nil {
		return err
	}
	fmt.Printf("replay scanned=%d queued=%d retained=%d\n", summary.Scanned, summary.Queued, summary.Retained)
	return nil
}
