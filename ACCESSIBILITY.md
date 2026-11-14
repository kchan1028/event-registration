# Accessibility

CycleReg is meant to work for every rider, parent, and volunteer, including people who use a screen reader, a keyboard, zoom, or voice control. Riders register on phones and volunteers check riders in on tablets outdoors, so accessibility is a requirement, not a polish step.

> **Status: local prototype, not audited.** The organizer workspace prototype exists and runs only on a local computer ([setup](docs/runbooks/local-setup.md)). It is built to the rules below and has automated checks for keyboard focus in the phone editor drawer, but no WCAG audit or screen-reader test has been done. Treat everything below as a Planned commitment, not a claim of conformance.

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

Results will be recorded here, with the date, the tools and assistive technology used, and any known gaps, once there is an interface to test.

## Known limitations

None recorded. There is no interface yet.

## Report a barrier

If something in this repository or, later, in CycleReg is hard or impossible to use with your setup, please tell us. Open an issue that says:

- What you were trying to do
- What happened instead
- Your device, browser, and any assistive technology (for example a screen reader and its version)

Leave out personal details such as license numbers or emergency contacts. If the barrier also exposes private data, report it privately as described in [SECURITY.md](SECURITY.md#how-to-report).

## Documentation accessibility

These documents follow the same intent: plain English, descriptive link text, and a short text explanation under every diagram (see [docs/documentation-guide.md](docs/documentation-guide.md#diagrams)).
