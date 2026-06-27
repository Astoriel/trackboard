package metrics

import (
	"fmt"
	"net/http"
	"sync/atomic"
)

type Metrics struct {
	accepted  atomic.Int64
	blocked   atomic.Int64
	warned    atomic.Int64
	forwarded atomic.Int64
	retried   atomic.Int64
	failed    atomic.Int64
}

func New() *Metrics {
	return &Metrics{}
}

func (m *Metrics) IncAccepted()  { m.accepted.Add(1) }
func (m *Metrics) IncBlocked()   { m.blocked.Add(1) }
func (m *Metrics) IncWarned()    { m.warned.Add(1) }
func (m *Metrics) IncForwarded() { m.forwarded.Add(1) }
func (m *Metrics) IncRetried()   { m.retried.Add(1) }
func (m *Metrics) IncFailed()    { m.failed.Add(1) }

func (m *Metrics) Handler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	fmt.Fprintf(w, "trackboard_guard_events_accepted_total %d\n", m.accepted.Load())
	fmt.Fprintf(w, "trackboard_guard_events_blocked_total %d\n", m.blocked.Load())
	fmt.Fprintf(w, "trackboard_guard_events_warned_total %d\n", m.warned.Load())
	fmt.Fprintf(w, "trackboard_guard_events_forwarded_total %d\n", m.forwarded.Load())
	fmt.Fprintf(w, "trackboard_guard_events_retried_total %d\n", m.retried.Load())
	fmt.Fprintf(w, "trackboard_guard_events_failed_total %d\n", m.failed.Load())
}
