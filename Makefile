SHELL := /usr/bin/bash
.ONESHELL:

# Local dev Makefile for scan-mcp only

.PHONY: install
install:
	npm install --no-audit --no-fund

.PHONY: typecheck
typecheck:
	npm run typecheck

.PHONY: lint
lint:
	npm run lint

.PHONY: lint-fix
lint-fix:
	npm run lint:fix

.PHONY: build
build:
	npm run build

.PHONY: test
test:
	npm test -- --run

.PHONY: verify
verify:
	$(MAKE) install
	$(MAKE) typecheck
	$(MAKE) lint
	$(MAKE) build
	$(MAKE) test
