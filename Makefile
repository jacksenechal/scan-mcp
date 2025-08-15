SHELL := /usr/bin/bash
.ONESHELL:

# Local dev Makefile for scan-mcp only
NVM_DIR ?= $(HOME)/.nvm
NVM_SH  ?= /usr/share/nvm/nvm.sh
NODE_VERSION ?= 22

define NVM_ACTIVATE
  export NVM_DIR="$(NVM_DIR)";
  if [ -s "$(NVM_SH)" ]; then source "$(NVM_SH)"; else echo "nvm.sh not found at $(NVM_SH)"; exit 1; fi;
  nvm use $(NODE_VERSION) >/dev/null
endef

.PHONY: node
node:
	$(NVM_ACTIVATE)
	node -v
	npm -v

.PHONY: install
install:
	$(NVM_ACTIVATE)
	npm install --no-audit --no-fund

.PHONY: typecheck
typecheck:
	$(NVM_ACTIVATE)
	npm run typecheck

.PHONY: lint
lint:
	$(NVM_ACTIVATE)
	npm run lint

.PHONY: lint-fix
lint-fix:
	$(NVM_ACTIVATE)
	npm run lint:fix

.PHONY: build
build:
	$(NVM_ACTIVATE)
	npm run build

.PHONY: test
test:
	$(NVM_ACTIVATE)
	npm test -- --run

## CLI-only targets removed; use mcptools to inspect the MCP server
.PHONY: tools
tools:
	$(NVM_ACTIVATE)
	mcp tools scan

.PHONY: verify
verify:
	$(MAKE) install
	$(MAKE) typecheck
	$(MAKE) lint
	$(MAKE) build
	$(MAKE) test
	$(MAKE) list

.PHONY: real-scan
# Example: make real-scan ARGS='{"resolution_dpi":300}'
real-scan: build
	$(NVM_ACTIVATE)
	mcp call /scan/start_scan_job --params '$(ARGS)' scan -f pretty
