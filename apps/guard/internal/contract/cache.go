package contract

import (
	"errors"
	"sync/atomic"
)

type Cache struct {
	loader Loader
	value  atomic.Value
}

func NewCache(loader Loader) *Cache {
	return &Cache{loader: loader}
}

func (c *Cache) Load() (Contract, bool) {
	value := c.value.Load()
	if value == nil {
		return Contract{}, false
	}
	contract, ok := value.(Contract)
	return contract, ok
}

func (c *Cache) Reload() error {
	next, err := c.loader.Load()
	if err != nil {
		if c.value.Load() == nil {
			return err
		}
		return errors.Join(errors.New("keeping previous contract after reload failure"), err)
	}
	c.value.Store(next)
	return nil
}
