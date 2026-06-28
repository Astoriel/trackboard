package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
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
	if len(os.Args) > 2 && os.Args[1] == "dlq" && os.Args[2] == "export" {
		if err := dlqExportCommand(os.Args[3:], os.Stdout); err != nil {
			slog.Error("dlq export failed", "error", err)
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

type dlqExportRecord struct {
	SchemaVersion  string         `json:"schema_version"`
	Source         string         `json:"source"`
	GuardDLQID     string         `json:"guard_dlq_id"`
	IdempotencyKey string         `json:"idempotency_key"`
	EventName      string         `json:"event_name"`
	Severity       string         `json:"severity"`
	ReasonCodes    []string       `json:"reason_codes"`
	Payload        map[string]any `json:"payload"`
	ReplayStatus   string         `json:"replay_status"`
	CreatedAt      time.Time      `json:"created_at"`
}

func dlqExportCommand(args []string, out io.Writer) error {
	flags := flag.NewFlagSet("dlq export", flag.ContinueOnError)
	configPath := flags.String("config", "guard.yaml", "path to Guard config file")
	format := flags.String("format", "ndjson", "export format; currently only ndjson")
	limit := flags.Int("limit", 100, "maximum DLQ rows to export")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *format != "ndjson" {
		return fmt.Errorf("unsupported format %q", *format)
	}
	if *limit < 1 {
		return fmt.Errorf("limit must be greater than 0")
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	db, err := store.Open(context.Background(), cfg.StoreFile)
	if err != nil {
		return err
	}
	defer db.Close()

	events, err := db.PendingDLQ(context.Background(), *limit)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(out)
	for _, event := range events {
		var reasonCodes []string
		if err := json.Unmarshal([]byte(event.ReasonCodesJSON), &reasonCodes); err != nil {
			return fmt.Errorf("decode reason codes for %s: %w", event.ID, err)
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(event.PayloadJSON), &payload); err != nil {
			return fmt.Errorf("decode payload for %s: %w", event.ID, err)
		}
		record := dlqExportRecord{
			SchemaVersion:  "trackboard.guard.dlq.export.v1",
			Source:         "trackboard-guard",
			GuardDLQID:     event.ID,
			IdempotencyKey: event.IdempotencyKey,
			EventName:      event.EventName,
			Severity:       event.Severity,
			ReasonCodes:    reasonCodes,
			Payload:        payload,
			ReplayStatus:   event.ReplayStatus,
			CreatedAt:      event.CreatedAt,
		}
		if err := encoder.Encode(record); err != nil {
			return err
		}
	}
	return nil
}
