package config

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	HTTPAddr     string
	ContractFile string
	StoreFile    string
	Destination  string
	Ready        bool
	Mode         string
}

func Default() Config {
	return Config{
		HTTPAddr:  ":8080",
		StoreFile: "guard.db",
		Ready:     false,
		Mode:      "block",
	}
}

func Load(path string) (Config, error) {
	cfg := Default()
	file, err := os.Open(path)
	if err != nil {
		return cfg, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			return cfg, fmt.Errorf("invalid config line %q", line)
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), "\"'")
		switch key {
		case "http_addr":
			cfg.HTTPAddr = value
		case "contract_file":
			cfg.ContractFile = value
		case "store_file":
			cfg.StoreFile = value
		case "destination":
			cfg.Destination = value
		case "ready":
			ready, err := strconv.ParseBool(value)
			if err != nil {
				return cfg, fmt.Errorf("invalid ready value: %w", err)
			}
			cfg.Ready = ready
		case "mode":
			cfg.Mode = value
		default:
			return cfg, fmt.Errorf("unknown config key %q", key)
		}
	}
	if err := scanner.Err(); err != nil {
		return cfg, err
	}
	return cfg, nil
}
