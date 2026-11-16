# Research index

Start here to find evidence, options, and recommendations. Research informs decisions; it does not approve requirements or change delivery priorities.

## Reports by topic

| Topic | Report and research date | Status and limitations |
|---|---|---|
| Customer and launch strategy | [Cycling customer and launch strategy](customer-launch-strategy.md), November 16, 2026 | Proposed segment, build-versus-buy, operating-cost and validation recommendations. No new interviews, analytics, fresh UI audit, accepted priorities or launch approval. Competitor sources are anonymized. |
| Prelaunch operational readiness | [Registration and operational readiness](prelaunch-readiness.md), November 16, 2026 | Proposed risk backlog, recovery/rules matrices, race-day checklist and measurement specification. Baseline code review plus five targeted checks; no fresh rendered walkthrough, provider exercise or staff rehearsal. Named competitor attribution appears only in its References. |
| Registration experience | [Design research](design-research.md), November 16, 2026 | Public-source review, code assessment, existing feedback, and Proposed design work. No new participant study or live UI accessibility audit. Sources are anonymized, limiting independent verification. |
| Payments | [Payment platform options](payment-platform-options.md) and source notes: [card processing](payment-platform-notes/stripe.md), [alternatives](payment-platform-notes/alternatives.md), [methods and reliability](payment-platform-notes/methods-reliability.md), November 15, 2026 | Research recommendations. Stripe is selected in [ADR 0002](../decisions/0002-stripe-payments.md); the merchant model remains Proposed in [ADR 0005](../decisions/0005-merchant-and-settlement-model.md). Recheck dated fees before relying on them. |
| Guardians and juniors | [Guardian accounts](guardian-accounts.md), November 15, 2026 | Research and the owner-accepted model. Steps 1–3 are implemented locally; later steps remain Planned as identified in the report. |
| Email | [Email providers](email-providers.md), November 15, 2026 | Research on adding marketing email later. Transactional email is decided in [ADR 0006](../decisions/0006-transactional-email-amazon-ses.md). Recheck historical prices and capabilities before purchase. |

These dates describe the research, not a promise that every source or implementation has been reverified today. Each report retains its evidence classifications and limitations.

## Related evidence and working materials

| Collection | What belongs there |
|---|---|
| [Field discovery](../discovery/README.md) | Phase 0 interview guides and anonymized summaries, workflow mapping, baselines, options comparison, and the continue-or-stop memo. |
| [Usability](../usability/README.md) | Test plans, scripts, tasks, and results. Expert dry runs and participant studies remain distinguishable. |
| [Organizer event case studies](../case-studies/organizer-templates/README.md) | Dated event-source observations and proposed setup exercises, including Berkeley Omnium. Research is not an approved race schedule or template. |
| [Payment model questions](../payment-model-questions.md) | Operating-model questions and responses for provider and treasurer review. |
| [Federation questions](../usac-questions.md) | External requirements awaiting confirmation. |
| [Timer export review](../timer-export-review.md) | Proposed format and questions awaiting timer agreement. |

## Filing rules

- **Research** records dated observations, documented capabilities, expert findings, and hypotheses. Keep desk-research reports and their source notes here. Link specialized collections from this index rather than duplicating them.
- **Decisions** record a significant choice, status, options, rationale, and consequences in [architecture decision records](../decisions/README.md). Keep decision context in the ADR and link supporting research. Proposed decisions remain open; Accepted decisions preserve their history.
- **Requirements** belong in [product.md](../../product.md). Reconcile accepted research recommendations there through review.
- **Priorities and delivery status** belong in [roadmap.md](../../roadmap.md). A written report does not verify the associated feature.

Give each new report a research date and evidence statement, separate findings from proposals, and add it to the topic table. Record unanswered questions in their authoritative home and preserve participant privacy. Follow the [documentation guide](../documentation-guide.md) for naming, status, and source handling.

Former report and source-note paths remain as short pointers for existing links. The reports linked above are the canonical copies.
