package policy

import "github.com/astoriel/trackboard/apps/guard/internal/validator"

type Mode string

const (
	Observe Mode = "observe"
	Warn    Mode = "warn"
	Block   Mode = "block"
)

type Decision struct {
	Forward  bool   `json:"forward"`
	DLQ      bool   `json:"dlq"`
	Severity string `json:"severity"`
}

func Decide(mode Mode, violations []validator.Violation) Decision {
	if len(violations) == 0 {
		return Decision{Forward: true, DLQ: false, Severity: "none"}
	}
	switch mode {
	case Block:
		return Decision{Forward: false, DLQ: true, Severity: "blocked"}
	case Warn:
		return Decision{Forward: true, DLQ: true, Severity: "warning"}
	default:
		return Decision{Forward: true, DLQ: false, Severity: "observed"}
	}
}
