# One project service per utility process

[ADR index](Intro.md)

P02 confirms the proposed utility-process boundary. Each canonical open project has one service for its SQLite connection and later file/index work. Main owns window/native OS operations and supervision; renderer receives only validated snapshots/events.

This isolates project failures and native-module work from rendering. A stopped service emits an error/reconnecting state, restarts with a bounded budget, and supports explicit retry. Shutdown is graceful; no database is placed in the project. Tests use real Electron utility processes and native SQLite, including stopping a process and starting the packaged executable.

The cost is a small process and checked message protocol per project. The shared `voidra` package continues to own format/lifecycle rules. P03 will add actual records and watching without moving privileged operations into the renderer.
