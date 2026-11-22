---
brief: Documentation index for the COI form digitisation project.
tags: [overview, documentation]
---

# FORMIQ documentation

Domyślny start całego PoC opisują [instrukcja Docker Compose](0307-docker-poc.pl.md) oraz [kontrakt Harness API](0209-harness-api.pl.md). DEV i klasyczne QA pozostają osobnymi środowiskami deweloperskimi.


Start with the [local setup and service addresses](../README.md). FORMIQ runs without Nginx. The PoC serves HTTP on 127.0.0.1. DEV and classic QA serve HTTPS directly on separate localhost ports.

| Chapter | Contents |
| --- | --- |
| [Licensing and contributions](0100-licensing.pl.md) | Third-party inventory sources and contribution agreement template |
| [Architecture](0200-architecture.pl.md) | Service and data flows, [COI application requirements](0203-application-requirements.pl.md), form generation and review of the EXTENDED tax overpayment profile |
| [Development cookbook](0300-cookbook.pl.md) | DEV/QA, TLS, Prisma, identity, Web, workers and monitoring |
| [Materiały Word i reguły importu](0205-materialy-docx.pl.md) | Odczyt dziewięciu blankietów, wizualizacje, kontrakt COI i kaskady adresowe |
| [Operations](0400-runbooks.pl.md) | Failure diagnosis, verification commands, storage reconciliation and offline recovery |
| [COI delivery backlog](9999-backlog.pl.md) | Requirements, acceptance criteria and reference forms |
