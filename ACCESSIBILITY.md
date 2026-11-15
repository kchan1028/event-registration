# Accessibility

CycleReg is meant to work for every rider, parent, and volunteer, including people who use a screen reader, a keyboard, zoom, or voice control. Riders register on phones and volunteers check riders in on tablets outdoors, so accessibility is a requirement, not a polish step.

> **Status: local build, not audited.** The app runs only on a local computer ([setup](docs/runbooks/local-setup.md)). It passes automated WCAG 2.2 A and AA checks on its main screens (see [Results](#results)) and has a keyboard-focus test for the phone editor drawer, but no manual keyboard pass, screen-reader test, real-phone test, or full WCAG audit has been done. Automated checks find only part of the barriers, so treat everything below as a commitment, not a claim of conformance.

## Target

The proposed target is **WCAG 2.2 level AA** (the W3C Web Content Accessibility Guidelines). It becomes an accepted requirement when the front-end architecture decision record (ADR) is written; see [docs/decisions/README.md](docs/decisions/README.md).

The detailed rules contributors must follow live in [docs/coding-guide.md](docs/coding-guide.md#accessibility-and-mobile-usability). In short:

- Every action works with a keyboard alone, with a visible focus indicator.
- Every input has a visible label, and errors explain how to fix them next to the field.
- Status never relies on color alone. The check-in ready or blocked result also uses text and an icon and stays readable in bright sunlight.
- Screens are designed for a 360-pixel-wide phone first, with large touch targets and no horizontal scrolling.
- Checkout works at 200% browser zoom.

The product-level requirement is in [product.md](product.md#quality-requirements).

## How accessibility will be checked

A flow is not Verified until it passes:

- Automated accessibility checks
- A manual keyboard-only pass
- A screen-reader pass with at least one screen reader
- A test on a real phone

Checkout and check-in are checked first because riders and volunteers cannot work around a barrier there. See the testing table in [docs/coding-guide.md](docs/coding-guide.md#what-must-be-tested).

## Results

| Check | Date | Scope | Tool | Result |
|---|---|---|---|---|
| Automated | November 14, 2026 | Organizer home, schedule, category editor, event setup, capacity pools, import, registrations, start lists, publish, rider preview; check-in list, ready rider, blocked rider, bib ranges; rider registration from choosing an event through every step, error summaries, and confirmation. Light and dark themes, desktop width | axe-core 4.10 through `@axe-core/playwright`, WCAG 2.0, 2.1, and 2.2 A and AA rules, in `e2e/accessibility.spec.ts` (runs in CI) | Two issues found and fixed: wide tables could not be scrolled with a keyboard (now focusable regions), and the category move buttons were 22 px tall (now 24 px). No violations remain on the scanned screens |
| Keyboard-only | Not done | Checkout and check-in first | | |
| Screen reader | Not done | Checkout and check-in first | | |
| Real phone | Not done | Rider registration | | Blocked: the app listens only on `127.0.0.1`; see [the usability kit](docs/usability/README.md#phone-sized-sessions) |

Not yet covered by the automated checks: phone-width layouts, 200% zoom, and states reached only by keyboard. The usability sessions in [docs/usability/](docs/usability/README.md) should include at least one participant who uses a keyboard or assistive technology.

## Known limitations

- No manual keyboard, screen-reader, or real-phone pass yet (see [Results](#results)).
- Real phones cannot reach the local build.

## Report a barrier

If something in this repository or, later, in CycleReg is hard or impossible to use with your setup, please tell us. Open an issue that says:

- What you were trying to do
- What happened instead
- Your device, browser, and any assistive technology (for example a screen reader and its version)

Leave out personal details such as license numbers or emergency contacts. If the barrier also exposes private data, report it privately as described in [SECURITY.md](SECURITY.md#how-to-report).

## Documentation accessibility

These documents follow the same intent: plain English, descriptive link text, and a short text explanation under every diagram (see [docs/documentation-guide.md](docs/documentation-guide.md#diagrams)).
