# Voidra Project — local setup & run (uses pnpm)
# Run `make help` for targets.
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
.DEFAULT_GOAL := help

.PHONY: help \
        install setup \
        build \
        lint format typecheck deprecations check clean \
        test test-watch gen gen-check

help: # Show this help
	@awk 'BEGIN {FS = ": *#+ *"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z0-9_-]+( +[a-zA-Z0-9_-]+)*: *#/ { gsub(/ +/, ", ", $$1); printf "  \033[36m%-25s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

# ── Setup ────────────────────────────────────────────────────────────
install: # Install pinned workspace dependencies
	@cd "$(ROOT)" && pnpm install --frozen-lockfile

setup: # Install dependencies and show next steps
	@$(MAKE) install
	@printf 'Next: make check. Desktop development arrives in P02.\n'

# ── App ──────────────────────────────────────────────────────────────
build: # Compile tooling and the format package
	@cd "$(ROOT)" && pnpm build

# ── Quality ──────────────────────────────────────────────────────────
lint: # Check code formatting and lint rules
	@cd "$(ROOT)" && pnpm lint

format: # Apply formatting and safe lint fixes
	@cd "$(ROOT)" && pnpm format

typecheck: # Check strict TypeScript projects
	@cd "$(ROOT)" && pnpm typecheck

deprecations: # List deprecations and reject invalid deadlines
	@cd "$(ROOT)" && pnpm deprecations

check: # Run lint, typecheck, tests, deprecations and generated reference check
	@$(MAKE) lint typecheck test deprecations gen-check

clean: # Remove generated typecheck output and coverage reports
	@cd "$(ROOT)" && rm -rf .cache/typecheck coverage packages/voidra/dist

# ── Test ─────────────────────────────────────────────────────────────
test: # Run unit and integration tests with coverage gates
	@cd "$(ROOT)" && pnpm test

test-watch: # Watch unit and integration tests
	@cd "$(ROOT)" && pnpm test:watch

gen: # Generate format schemas and shared references
	@cd "$(ROOT)" && pnpm gen

gen-check: # Reject stale generated format references
	@cd "$(ROOT)" && pnpm gen:check
