# Content guide for public pages

This guide sets the rules for any future public page: event and schedule pages, rider help, organizer help, and product pages. The aim is pages that riders can act on quickly and that search engines and AI answer systems can read accurately. No public pages exist yet, and none should be published before the roadmap allows it.

These rules apply to public content only. Rider data and organizer workspaces are private and must never be exposed to search engines or answer systems (see [Keep private data out of public pages](#keep-private-data-out-of-public-pages)).

## Document maintenance rule (mandatory)

Every change must review both [product.md](../product.md) and [roadmap.md](../roadmap.md) for impact.

- Update `product.md` when requirements, scope, user flows, business rules, acceptance criteria, or product decisions change.
- Update `roadmap.md` when priorities, dependencies, milestones, blockers, or delivery status change.
- When a change affects neither document, state that explicitly in the change summary instead of making cosmetic edits.
- Keep `README.md` and affected guides consistent with the implementation.
- Mark roadmap work complete only after its acceptance criteria are verified.
- Distinguish planned, implemented, and verified behavior.
- Do not maintain a competing product roadmap elsewhere.

## Start from the reader's question

Before writing a page, write down three things:

1. **Who is reading:** a rider, a parent, an organizer, a timer.
2. **The question that brought them here,** in their words: "How do I register for both days?", "Which category can a Cat 4 masters rider enter?", "What does start group mean?"
3. **What they should do next:** register, check their category, contact the organizer.

Give each page one main purpose. A schedule page answers "what races are there and can I enter them"; a help page answers one task. If a page tries to serve every reader, split it.

| Search intent | Example query | Page type |
|---|---|---|
| Navigational | "<event name> registration" | Event page with a clear register action |
| Informational | "what is a criterium" | Short explainer or glossary entry |
| How-to | "how to register for a weekend bundle" | Help page with numbered steps |
| Transactional | "<event name> entry fee" | Schedule page with visible, current prices |

## Titles, headings, and direct answers

- **Page title:** the entity first, then the purpose, under about 60 characters. Example: "Berkeley Hills Road Race 2027: schedule and registration". Avoid vague marketing titles.
- **Meta description:** about 140 to 160 characters that answer the intent and say what the reader can do on the page.
- **One H1** that matches the title's meaning. H2 and H3 headings describe what the section says, often as the question it answers.
- **Answer first.** Put a one- or two-sentence answer directly under the heading, written so it makes sense if quoted alone. Then add the detail. Example:

  > **What is a start group?** A start group is the set of registration categories that start a race together and share one field limit. Riders in the same start group can still be scored in separate classifications.

- Use numbered steps for tasks, tables for comparisons, and short paragraphs for explanations.

## Use cycling terms consistently and accurately

- Use the terms in the [glossary](documentation-guide.md#glossary) with the same meaning on every page. If riders know a different word (for example "wave" or "field"), mention it once and then stick to the project term.
- Write category names exactly as the organizer published them, such as "Masters 35+ Cat 3/4".
- Do not state federation rules (racing age, license categories, upgrade points, one-day license prices) from memory. Link to the governing body's current page and show the date you checked it. Rules change by season.
- Do not describe eligibility as a simple ladder of category numbers. Show the actual allowed categories and age range for each race.
- Distinguish what CycleReg does from what the organizer or federation decides. "The organizer sets the field limit" is accurate; "CycleReg limits fields to 60" is not.

## Make claims you can support

- Describe only features that are Verified (see the [status vocabulary](documentation-guide.md#status-vocabulary)). Never present planned behavior as available.
- Do not claim feature parity with any other platform, equivalent federation integration, lower fees, or better reliability unless the claim has been verified and the evidence is cited. This follows [product.md](../product.md#positioning-and-differentiation).
- Success measures in `product.md` are hypotheses. Do not publish them as results.
- No testimonials, logos, or partner names without written permission and a real source.
- Name sources. Replace "experts say" or "studies show" with the organization, document, and date.

## Write plainly

- Short sentences and everyday words. Read the page aloud; if a volunteer would not say it, rewrite it.
- No filler or hype: avoid "seamless", "cutting-edge", "game-changing", "unlock", "effortless", "in today's world", and closing paragraphs that repeat the page.
- No em dashes as sentence separators. Use a period, comma, or colon.
- One call to action per page, with one or two secondary links at most.
- Keep the page useful on its own. Do not create thin pages that exist only to target a keyword, and do not publish near-identical pages for each category or city.

## Internal links

- Link each page to the next step the reader needs: from an explainer to the schedule, from the schedule to registration help, from help to the event contact.
- Use descriptive anchor text ("how weekend bundles are priced"), never "click here" or "learn more".
- Every public page should be linked from at least one other relevant public page, so readers and crawlers can find it.
- Never link from a public page to a private workspace URL that exposes an identifier.

## Structured data

Structured data (JSON-LD markup that describes a page's content to search engines) must match what the reader can see on the page. Never mark up information that is not visible, and never add a type just because it exists.

| Type | Use when | Do not use when |
|---|---|---|
| `SportsEvent` | The page shows the event name, dates, and location | Dates or location are not yet confirmed |
| `Offer` within an event | The current entry price and availability are visible on the page | Prices are TBD or out of date |
| `Organization` / `SportsOrganization` | The page names the organizing club with verified details | Details are unconfirmed |
| `FAQPage` | The page has a genuine, visible FAQ | Questions were added only for markup |
| `BreadcrumbList` | The page shows breadcrumb navigation | No visible breadcrumbs |
| `HowTo` | A help page shows step-by-step instructions | The steps are not on the page |

Keep time-bound markup current. When an event passes or registration closes, update or remove the event status and offers. Never put participant names or other rider data in structured data. Validate every JSON-LD block before publishing.

## Make pages easy for search engines and AI answer systems

- State the entities fully on first mention: "Berkeley Bicycle Club", "USA Cycling (USAC)", "Berkeley Hills Road Race". Then use the same names consistently.
- Say how things relate in plain sentences: "The Berkeley Hills Road Race is part of the Berkeley Omnium weekend."
- Put dates, locations, and prices in visible text, not only in images.
- Give images descriptive file names and alt text that states what the image shows.
- Use real HTML headings, lists, and tables rather than styled text, so the structure survives extraction.
- Mark what is official (organizer-published) and what is general guidance, so readers and AI systems can tell them apart.

## Keep private data out of public pages

- Organizer workspaces, rider accounts, receipts, check-in screens, exports, and admin pages require sign-in and are marked `noindex`. They never appear in a sitemap.
- Public participant lists are off by default. When an organizer turns one on, show only fields riders have agreed to publish, and never emergency contacts, birth dates, license numbers, contact details, or payment information.
- No personal data in URLs, page titles, meta descriptions, structured data, or analytics events.
- Check-in codes and order links must not reveal personal details and must not be guessable.
- Do not let search previews or AI tools index pages behind sign-in. Robots rules are a courtesy, not protection; access control is what keeps pages private.

## Accessibility

Public pages follow the same accessibility rules as the application (see [coding-guide.md](coding-guide.md#accessibility-and-mobile-usability)): readable on a phone, keyboard usable, text alternatives for images, and color never the only cue.

## Pre-publish checklist

- [ ] One reader, one question, one next step
- [ ] Title and meta description describe the page accurately
- [ ] The direct answer appears under the relevant heading
- [ ] Cycling terms match the glossary; federation rules link to a dated source
- [ ] Every claim is verified or removed; no parity, fee, or reliability claims without evidence
- [ ] Internal links point to useful next steps with descriptive anchors
- [ ] Structured data matches visible content and validates
- [ ] No private rider or organizer data exposed
- [ ] Plain language; no filler, hype, or em dashes as separators
- [ ] Product and roadmap impact stated in the change summary
