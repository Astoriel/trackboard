package validator

import (
	"fmt"
	"math"

	"github.com/astoriel/trackboard/apps/guard/internal/contract"
	"github.com/astoriel/trackboard/apps/guard/internal/ingest"
)

type Violation struct {
	Code     string `json:"code"`
	Event    string `json:"event"`
	Property string `json:"property,omitempty"`
	Message  string `json:"message"`
}

func Validate(c contract.Contract, payload ingest.TrackEvent) []Violation {
	event, ok := c.Event(payload.Event)
	if !ok {
		return []Violation{{Code: "unknown_event", Event: payload.Event, Message: "event is not in contract"}}
	}
	violations := []Violation{}
	if event.Status != "" && event.Status != "active" {
		violations = append(violations, Violation{Code: "inactive_event", Event: payload.Event, Message: "event is not active"})
	}
	if payload.UserID == "" && payload.AnonymousID == "" && payload.Properties["user_id"] == nil {
		violations = append(violations, Violation{Code: "missing_identity", Event: payload.Event, Message: "userId, anonymousId, or user_id is required"})
	}
	expected := event.PropertyMap()
	for name, prop := range expected {
		if prop.Required && payload.Properties[name] == nil {
			violations = append(violations, Violation{Code: "missing_required_property", Event: payload.Event, Property: name, Message: fmt.Sprintf("%s is required", name)})
		}
	}
	for name, value := range payload.Properties {
		prop, ok := expected[name]
		if !ok {
			violations = append(violations, Violation{Code: "unknown_property", Event: payload.Event, Property: name, Message: fmt.Sprintf("%s is not defined", name)})
			continue
		}
		if !matchesType(value, prop.Type) {
			violations = append(violations, Violation{Code: "type_mismatch", Event: payload.Event, Property: name, Message: fmt.Sprintf("%s must be %s", name, prop.Type)})
			continue
		}
		if values, ok := prop.Constraints["enum_values"].([]any); ok && !contains(values, value) {
			violations = append(violations, Violation{Code: "enum_violation", Event: payload.Event, Property: name, Message: fmt.Sprintf("%s is not an allowed value", name)})
		}
	}
	return violations
}

func matchesType(value any, typ string) bool {
	switch typ {
	case "string":
		_, ok := value.(string)
		return ok
	case "integer":
		number, ok := value.(float64)
		return ok && math.Trunc(number) == number
	case "float":
		_, ok := value.(float64)
		return ok
	case "boolean":
		_, ok := value.(bool)
		return ok
	case "array":
		_, ok := value.([]any)
		return ok
	case "object":
		_, ok := value.(map[string]any)
		return ok
	default:
		return true
	}
}

func contains(values []any, needle any) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}
