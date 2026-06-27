package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "guard.yaml")
	err := os.WriteFile(path, []byte("http_addr: \":9090\"\ncontract_file: \"contract.json\"\nready: true\n"), 0o600)
	if err != nil {
		t.Fatal(err)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}

	if cfg.HTTPAddr != ":9090" {
		t.Fatalf("HTTPAddr = %q", cfg.HTTPAddr)
	}
	if cfg.ContractFile != "contract.json" {
		t.Fatalf("ContractFile = %q", cfg.ContractFile)
	}
	if !cfg.Ready {
		t.Fatal("Ready = false")
	}
}
