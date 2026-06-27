package policy

import (
	"testing"

	"github.com/astoriel/trackboard/apps/guard/internal/validator"
)

func TestDecideBlockDoesNotForwardInvalidEvents(t *testing.T) {
	decision := Decide(Block, []validator.Violation{{Code: "unknown_event"}})
	if decision.Forward {
		t.Fatal("expected blocked event not to forward")
	}
	if !decision.DLQ || decision.Severity != "blocked" {
		t.Fatalf("decision = %#v", decision)
	}
}

func TestDecideObserveForwardsInvalidEvents(t *testing.T) {
	decision := Decide(Observe, []validator.Violation{{Code: "unknown_event"}})
	if !decision.Forward || decision.DLQ {
		t.Fatalf("decision = %#v", decision)
	}
}
