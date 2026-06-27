package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/astoriel/trackboard/apps/guard/internal/config"
	"github.com/astoriel/trackboard/apps/guard/internal/contract"
	"github.com/astoriel/trackboard/apps/guard/internal/health"
	"github.com/astoriel/trackboard/apps/guard/internal/ingest"
	"github.com/astoriel/trackboard/apps/guard/internal/metrics"
	"github.com/astoriel/trackboard/apps/guard/internal/policy"
	"github.com/astoriel/trackboard/apps/guard/internal/validator"
)

type Server struct {
	httpServer *http.Server
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
	guardMetrics := metrics.New()
	mux.HandleFunc("GET /health/live", healthHandler.Live)
	mux.HandleFunc("GET /health/ready", healthHandler.Ready)
	mux.HandleFunc("GET /metrics", guardMetrics.Handler)
	mux.HandleFunc("POST /v1/track", trackHandler(cache, policy.Mode(cfg.Mode), guardMetrics))

	return &Server{
		httpServer: &http.Server{
			Addr:              cfg.HTTPAddr,
			Handler:           mux,
			ReadHeaderTimeout: 5 * time.Second,
		},
	}
}

func trackHandler(cache *contract.Cache, mode policy.Mode, guardMetrics *metrics.Metrics) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if cache == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "contract_not_loaded"})
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
	return s.httpServer.Shutdown(ctx)
}
