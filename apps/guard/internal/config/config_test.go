package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "guard.yaml")
	err := os.WriteFile(path, []byte("http_addr: \":9090\"\ncontract_file: \"contract.json\"\nstore_file: \"guard.db\"\ndestination: \"http://example.test/track\"\nready: true\n"), 0o600)
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
	if cfg.StoreFile != "guard.db" {
		t.Fatalf("StoreFile = %q", cfg.StoreFile)
	}
	if cfg.Destination != "http://example.test/track" {
		t.Fatalf("Destination = %q", cfg.Destination)
	}
	if !cfg.Ready {
		t.Fatal("Ready = false")
	}
}
