package ingest

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"
)

const MaxBodyBytes = 1 << 20

type TrackEvent struct {
	Event       string         `json:"event"`
	UserID      string         `json:"userId"`
	AnonymousID string         `json:"anonymousId"`
	MessageID   string         `json:"messageId"`
	Timestamp   *time.Time     `json:"timestamp"`
	Properties  map[string]any `json:"properties"`
	Context     map[string]any `json:"context"`
}

func DecodeTrack(r *http.Request) (TrackEvent, error) {
	body := http.MaxBytesReader(nil, r.Body, MaxBodyBytes)
	defer r.Body.Close()
	data, err := io.ReadAll(body)
	if err != nil {
		return TrackEvent{}, err
	}
	var event TrackEvent
	if err := json.Unmarshal(data, &event); err != nil {
		return TrackEvent{}, err
	}
	if event.Event == "" {
		return TrackEvent{}, errors.New("event is required")
	}
	if event.Properties == nil {
		event.Properties = map[string]any{}
	}
	return event, nil
}
