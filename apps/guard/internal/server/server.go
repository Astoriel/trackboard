package server

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/astoriel/trackboard/apps/guard/internal/config"
	"github.com/astoriel/trackboard/apps/guard/internal/contract"
	"github.com/astoriel/trackboard/apps/guard/internal/health"
	"github.com/astoriel/trackboard/apps/guard/internal/ingest"
	"github.com/astoriel/trackboard/apps/guard/internal/metrics"
	"github.com/astoriel/trackboard/apps/guard/internal/policy"
	"github.com/astoriel/trackboard/apps/guard/internal/store"
	"github.com/astoriel/trackboard/apps/guard/internal/validator"
)

type Server struct {
	httpServer *http.Server
	eventStore *store.Store
}

func New(cfg config.Config) *Server {
	mux := http.NewServeMux()
	healthHandler := health.New(cfg.Ready)
	var cache *contract.Cache
	if cfg.ContractFile != "" {
		cache = contract.NewCache(contract.NewLoader(cfg.ContractFile))
		if err := cache.Reload(); err == nil {
			healthHandler.SetReady(true)
		}
	}
	var eventStore *store.Store
	if cfg.StoreFile != "" {
		if opened, err := store.Open(context.Background(), cfg.StoreFile); err == nil {
			eventStore = opened
		}
	}
	guardMetrics := metrics.New()
	mux.HandleFunc("GET /health/live", healthHandler.Live)
	mux.HandleFunc("GET /health/ready", healthHandler.Ready)
	mux.HandleFunc("GET /metrics", guardMetrics.Handler)
	mux.HandleFunc("POST /v1/track", trackHandler(cache, eventStore, cfg.Destination, policy.Mode(cfg.Mode), guardMetrics))

	return &Server{
		httpServer: &http.Server{
			Addr:              cfg.HTTPAddr,
			Handler:           mux,
			ReadHeaderTimeout: 5 * time.Second,
		},
		eventStore: eventStore,
	}
}

func trackHandler(cache *contract.Cache, eventStore *store.Store, destination string, mode policy.Mode, guardMetrics *metrics.Metrics) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cache == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "contract_not_loaded"})
			return
		}
		if eventStore == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "store_not_loaded"})
			return
		}
		loaded, ok := cache.Load()
		if !ok {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "contract_not_loaded"})
			return
		}
		event, err := ingest.DecodeTrack(r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_track_payload", "message": err.Error()})
			return
		}
		violations := validator.Validate(loaded, event)
		decision := policy.Decide(mode, violations)
		payloadJSON, err := json.Marshal(event)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_track_payload", "message": err.Error()})
			return
		}
		reasonCodesJSON, err := json.Marshal(reasonCodes(violations))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid_track_payload", "message": err.Error()})
			return
		}
		idempotencyKey := event.MessageID
		if idempotencyKey == "" {
			idempotencyKey = fallbackID(destination, payloadJSON)
		}
		if decision.Forward {
			err = eventStore.EnqueueOutbox(r.Context(), store.OutboxEvent{
				ID:             idempotencyKey,
				IdempotencyKey: idempotencyKey,
				Destination:    destination,
				PayloadJSON:    string(payloadJSON),
			})
			if err != nil {
				writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "outbox_admission_failed", "message": err.Error()})
				return
			}
		}
		if decision.DLQ {
			err = eventStore.EnqueueDLQ(r.Context(), store.DLQEvent{
				ID:              fmt.Sprintf("%s:dlq", idempotencyKey),
				IdempotencyKey:  idempotencyKey,
				EventName:       event.Event,
				Severity:        decision.Severity,
				ReasonCodesJSON: string(reasonCodesJSON),
				PayloadJSON:     string(payloadJSON),
			})
			if err != nil {
				writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "dlq_admission_failed", "message": err.Error()})
				return
			}
		}
		guardMetrics.IncAccepted()
		if decision.Severity == "blocked" {
			guardMetrics.IncBlocked()
		}
		if decision.Severity == "warning" {
			guardMetrics.IncWarned()
		}
		writeJSON(w, http.StatusAccepted, map[string]any{
			"accepted":   true,
			"valid":      len(violations) == 0,
			"decision":   decision,
			"violations": violations,
			"version":    loaded.VersionNumber,
		})
	}
}

func reasonCodes(violations []validator.Violation) []string {
	codes := make([]string, 0, len(violations))
	for _, violation := range violations {
		codes = append(codes, violation.Code)
	}
	return codes
}

func fallbackID(destination string, payload []byte) string {
	sum := sha256.Sum256(append([]byte(destination), payload...))
	return fmt.Sprintf("sha256:%x", sum)
}

func writeJSON(w http.ResponseWriter, status int, payload map[string]any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *Server) ListenAndServe() error {
	err := s.httpServer.ListenAndServe()
	if err == http.ErrServerClosed {
		return nil
	}
	return err
}

func (s *Server) Shutdown(ctx context.Context) error {
	err := s.httpServer.Shutdown(ctx)
	if s.eventStore != nil {
		if closeErr := s.eventStore.Close(); err == nil {
			err = closeErr
		}
	}
	return err
}
