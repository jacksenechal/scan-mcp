SHELL := /usr/bin/bash
.ONESHELL:

# Local dev Makefile for scan-mcp only
NVM_DIR ?= $(HOME)/.nvm
NVM_SH  ?= /usr/share/nvm/nvm.sh
NODE_VERSION ?= 20

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

.PHONY: list
list: build
	$(NVM_ACTIVATE)
	node dist/server.js list

.PHONY: call
# Usage: make call TOOL="/scan/list_devices" PAYLOAD='{}'
call: build
	$(NVM_ACTIVATE)
	node dist/server.js call $(TOOL) '$(PAYLOAD)'

.PHONY: verify
verify:
	$(MAKE) install
	$(MAKE) typecheck
	$(MAKE) lint
	$(MAKE) build
	$(MAKE) test
	$(MAKE) list

.PHONY: real-list
real-list: build
	$(NVM_ACTIVATE)
	SCAN_MOCK=0 node dist/server.js call /scan/list_devices '{}'

.PHONY: real-start
# Example: make real-start DEVICE_ID="epjitsu:libusb:001:004" RES=300 SOURCE="ADF Duplex"
real-start: build
	$(NVM_ACTIVATE)
	SCAN_MOCK=0 node dist/server.js call /scan/start_scan_job '{"device_id":"$(DEVICE_ID)","resolution_dpi":$(RES),"source":"$(SOURCE)"}'

.PHONY: mock-start
mock-start: build
	$(NVM_ACTIVATE)
	SCAN_MOCK=1 node dist/server.js call /scan/start_scan_job '{}'

