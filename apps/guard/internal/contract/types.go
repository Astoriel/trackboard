package contract

import "fmt"

const FormatVersion = "trackboard.contract.v1"

type Contract struct {
	FormatVersion    string     `json:"format_version"`
	PlanID           string     `json:"plan_id"`
	VersionID        string     `json:"version_id"`
	VersionNumber    int        `json:"version_number"`
	Name             string     `json:"name"`
	Description      *string    `json:"description"`
	PublishedAt      *string    `json:"published_at"`
	Hash             string     `json:"hash"`
	GlobalProperties []Property `json:"global_properties"`
	Events           []Event    `json:"events"`

	eventIndex  map[string]Event
	globalIndex map[string]Property
}

type Event struct {
	EventName        string     `json:"event_name"`
	Status           string     `json:"status"`
	Description      *string    `json:"description"`
	Category         *string    `json:"category"`
	SortOrder        int        `json:"sort_order"`
	Properties       []Property `json:"properties"`
	GlobalProperties []string   `json:"global_properties"`
	propertyIndex    map[string]Property
}

type Property struct {
	Name        string         `json:"name"`
	Type        string         `json:"type"`
	Required    bool           `json:"required"`
	Constraints map[string]any `json:"constraints"`
	Description *string        `json:"description"`
	Examples    []any          `json:"examples"`
}

func (c Contract) Event(name string) (Event, bool) {
	event, ok := c.eventIndex[name]
	return event, ok
}

func (e Event) Property(name string) (Property, bool) {
	prop, ok := e.propertyIndex[name]
	return prop, ok
}

func compile(raw Contract) (Contract, error) {
	if raw.FormatVersion != FormatVersion {
		return raw, fmt.Errorf("unsupported format_version %q", raw.FormatVersion)
	}
	raw.eventIndex = make(map[string]Event, len(raw.Events))
	raw.globalIndex = make(map[string]Property, len(raw.GlobalProperties))
	for _, prop := range raw.GlobalProperties {
		if prop.Name == "" {
			return raw, fmt.Errorf("global property name is required")
		}
		if _, exists := raw.globalIndex[prop.Name]; exists {
			return raw, fmt.Errorf("duplicate global property %q", prop.Name)
		}
		raw.globalIndex[prop.Name] = prop
	}
	for i := range raw.Events {
		event := raw.Events[i]
		if event.EventName == "" {
			return raw, fmt.Errorf("event_name is required")
		}
		if _, exists := raw.eventIndex[event.EventName]; exists {
			return raw, fmt.Errorf("duplicate event %q", event.EventName)
		}
		event.propertyIndex = make(map[string]Property, len(event.Properties)+len(event.GlobalProperties))
		for _, prop := range event.Properties {
			if prop.Name == "" {
				return raw, fmt.Errorf("property name is required for event %q", event.EventName)
			}
			if _, exists := event.propertyIndex[prop.Name]; exists {
				return raw, fmt.Errorf("duplicate property %q on event %q", prop.Name, event.EventName)
			}
			event.propertyIndex[prop.Name] = prop
		}
		for _, name := range event.GlobalProperties {
			prop, ok := raw.globalIndex[name]
			if !ok {
				return raw, fmt.Errorf("event %q references unknown global property %q", event.EventName, name)
			}
			if _, exists := event.propertyIndex[name]; exists {
				return raw, fmt.Errorf("duplicate merged property %q on event %q", name, event.EventName)
			}
			event.propertyIndex[name] = prop
		}
		raw.Events[i] = event
		raw.eventIndex[event.EventName] = event
	}
	return raw, nil
}
