SHELL := /usr/bin/bash
.ONESHELL:

# Local dev Makefile for scan-mcp only
# Configure nvm path if available; fall back to system node otherwise
NVM_DIR ?= $(HOME)/.nvm
NVM_SH  ?= /usr/share/nvm/nvm.sh
NODE_VERSION ?= 22

define NVM_ACTIVATE
  export NVM_DIR="$(NVM_DIR)";
  if [ -s "$(NVM_SH)" ]; then
    source "$(NVM_SH)";
    nvm use $(NODE_VERSION) >/dev/null;
  else
    echo "nvm.sh not found at $(NVM_SH); falling back to system node";
    if command -v node >/dev/null; then
      current_node=$$(node -v);
      case $$current_node in
        v$(NODE_VERSION).*) echo "Using system node $$current_node";;
        *) echo "Error: Node $(NODE_VERSION) required, found $$current_node"; exit 1;;
      esac;
    else
      echo "Error: node not found and nvm missing";
      exit 1;
    fi;
  fi
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
        $(MAKE) tools

.PHONY: real-scan
# Example: make real-scan ARGS='{"resolution_dpi":300}'
real-scan: build
	$(NVM_ACTIVATE)
	mcp call /scan/start_scan_job --params '$(ARGS)' scan -f pretty
