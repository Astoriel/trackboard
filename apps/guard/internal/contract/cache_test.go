package contract

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestCacheReloadKeepsPreviousContractOnFailure(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "contract.json")
	if err := os.WriteFile(path, []byte(validContractJSON()), 0o600); err != nil {
		t.Fatal(err)
	}
	cache := NewCache(NewLoader(path))
	if err := cache.Reload(); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(path, []byte(`{"format_version":"wrong"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := cache.Reload(); err == nil {
		t.Fatal("expected reload error")
	}
	loaded, ok := cache.Load()
	if !ok {
		t.Fatal("expected previous contract")
	}
	if loaded.VersionID != "version_1" {
		t.Fatalf("version id = %q", loaded.VersionID)
	}
}

func TestCacheConcurrentReadersDuringReload(t *testing.T) {
	path := writeContract(t, validContractJSON())
	cache := NewCache(NewLoader(path))
	if err := cache.Reload(); err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	for i := 0; i < 64; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				if _, ok := cache.Load(); !ok {
					t.Error("cache unexpectedly empty")
				}
			}
		}()
	}
	for i := 0; i < 10; i++ {
		if err := cache.Reload(); err != nil {
			t.Fatal(err)
		}
	}
	wg.Wait()
}
