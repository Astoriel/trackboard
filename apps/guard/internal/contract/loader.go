package contract

import (
	"encoding/json"
	"os"
)

type Loader struct {
	path string
}

func NewLoader(path string) Loader {
	return Loader{path: path}
}

func (l Loader) Load() (Contract, error) {
	data, err := os.ReadFile(l.path)
	if err != nil {
		return Contract{}, err
	}
	var raw Contract
	if err := json.Unmarshal(data, &raw); err != nil {
		return Contract{}, err
	}
	return compile(raw)
}
