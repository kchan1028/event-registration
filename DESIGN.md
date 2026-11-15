---
name: CycleReg rider and organizer workspace
description: Race-day clarity with selective Liquid Glass for rider and organizer workflows.
colors:
  ink: "#181d26"
  body: "#333840"
  muted: "#5b616b"
  hairline: "#dddddd"
  hairline-soft: "#ebebe8"
  border-strong: "#9297a0"
  canvas: "#ffffff"
  tyvek: "#f7f7f4"
  tyvek-deep: "#efefea"
  link: "#1b61c9"
  focus: "#1b61c9"
  day-1: "#1d6b3a"
  day-2: "#2f56b0"
  day-3: "#6a3fa0"
  day-4: "#7a4a00"
  error: "#b42318"
  error-bg: "#fdf0ee"
  warn: "#7a5200"
  warn-bg: "#fff6e0"
  ok: "#1e6b34"
  ok-bg: "#edf7ef"
  pending: "#4a4f8a"
  pending-bg: "#f1f1fa"
typography:
  display:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.25
  title:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  body-dense:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Public Sans, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.4
  numeral:
    fontFamily: "Barlow Condensed, Public Sans, system-ui, sans-serif"
    fontSize: "1.08em"
    fontWeight: 600
    letterSpacing: "0.01em"
    fontFeature: "tnum, lnum"
  code:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "12px"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "11px"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "38px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "38px"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "38px"
  button-ghost-hover:
    backgroundColor: "{colors.tyvek-deep}"
  button-small:
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-dense}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
    height: "38px"
  tag:
    backgroundColor: "{colors.tyvek-deep}"
    textColor: "{colors.body}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  chip:
    textColor: "{colors.body}"
    rounded: "16px"
    padding: "0 12px"
    height: "32px"
  chip-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
  rail-item:
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "38px"
  rail-item-active:
    backgroundColor: "{colors.canvas}"
  clip:
    backgroundColor: "{colors.tyvek}"
    rounded: "{rounded.lg}"
    padding: "20px 16px 16px"
  tagchip:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "40px"
  tally-track:
    backgroundColor: "{colors.tyvek-deep}"
    rounded: "6px"
    height: "12px"
---

# Design System: CycleReg rider and organizer workspace

## Overview

**Creative North Star: "The Race-Tent Field Board, with Liquid Glass"**

Status: **Planned design direction**, November 14, 2026. This documentation change does not implement glass, photography, new settings, or purchase capabilities. The existing YAML tokens above describe the current baseline; the material recipe and acceptance checks below are targets for future implementation. [product.md](product.md) owns requirements and [roadmap.md](roadmap.md) owns delivery status.

Apple-inspired means translucent navigation, subtle depth, refined type, and responsive, interruptible interactions. Preserve CycleReg's field-board identity, day hues, Public Sans, and Barlow Condensed numerals. Forms, pricing, race options, receipts, and dense tables stay opaque. Glass belongs to a small functional layer above the content, with no decorative refraction or moving highlights.

Inspection basis: the local rider catalog and Berkeley race-selection screen in dark theme, plus the committed [organizer schedule screenshot](docs/screenshots/02-category-schedule.png). The rider UI already groups category details, availability, and prices, and labels simulated payment and disconnected license checks. The organizer table uses clear hairlines and separate start-group cards. Keep these strengths. This inspection is not a keyboard, mobile, or contrast conformance test.

The workspace is the registration table at a bike race, drawn as software. The ground is Tyvek white like a race bib, the text is bib-black ink, and each race day gets one hue that follows its races everywhere: the rail swatch, the rule under the race header, the clip on each start group, and the segments of its tally bar. Times, counts, caps, and prices are set in a condensed numeral face so they read like bib numbers. Everything else is quiet: hairline borders, modest weights, and one ink button per area.

Density is that of a working tool. Three columns at desktop (rail, schedule, inspector), tables with 10px cell padding, 14px dense text, and status shown in small tinted tags rather than large banners. The one place the world becomes literal is the field board, where start groups are cards with a short day-hue clip across the top edge holding a stack of category tags, with a shared tally bar underneath. The clip metaphor stops there: tags, the clip bar, and the tally.

Detailing keeps the existing ink primary, outlined secondary, hairlines, and medium (500) headings. Liquid Glass adds depth only where navigation or controls overlap content; it does not replace the working surfaces with translucent cards.

**Key Characteristics:**
- Stable canvas and Tyvek working surfaces, with selective glass navigation and overlays.
- One hue per race day, applied through a single inherited day color on each race scope.
- Condensed tabular numerals for every time, count, cap, and price.
- Ink primary button, outlined secondary, ghost tertiary.
- Status as tinted pills and notes (ok, warn, error, pending), each a text color on its own pale ground.
- Field board clips with segmented tally bars as the signature component.

## Colors

A near-neutral ink-on-Tyvek palette where color carries meaning: day identity, status, or a link.

### Primary
- **Bib Ink** (ink): headings, primary buttons, selected chips, the active row marker, checkbox accents, and all numerals. It is the only fill color used for a primary action.

### Secondary
- **Day hues** (day-1 Road-Race Green, day-2 Criterium Blue, day-3 Course Violet, day-4 Saddle Brown): one per race day, assigned in order and cycled every four days. Each race scope sets a single inherited day color, and every day-colored element reads from it. Tally segments derive lighter and darker steps from the same day hue by mixing with white or black.

### Tertiary
- **Link Blue** (link, also used as focus): text links, link buttons, the focus outline, and a 7% tint for the selected table row. It is not used for buttons or fills.

### Neutral
- **Canvas** (canvas): the main working surface, table cells, inputs, tag chips, and the inspector.
- **Tyvek** (tyvek): the rail, field board clips, notes, issue rows, table group headers, and empty states.
- **Tyvek Deep** (tyvek-deep): neutral tags, ghost and icon button hover, the empty tally track, inline code.
- **Body Graphite** (body): running text.
- **Muted Slate** (muted): secondary text, column headers, hints, stat labels, icon buttons at rest.
- **Hairline** (hairline): input, button, table, and tag chip borders.
- **Soft Hairline** (hairline-soft): row dividers, rail and inspector edges, clip borders.
- **Strong Border** (border-strong): input and secondary button hover borders, and the clip bar on unassigned groups.

### Status
- **Error** (error on error-bg), **Warning** (warn on warn-bg), **OK** (ok on ok-bg), **Pending integration** (pending on pending-bg). Each pair is used together: the dark tone as text, the pale tone as ground.

### Dark theme
The registration tent after sundown. `:root[data-theme='dark']` (screen media only) redefines every color token: a charcoal ground with a faint cool cast (canvas #15181d, tyvek #1b1f25, tyvek-deep #242830), chalk-white ink (#eeede8), and day hues lifted so each stays recognizably the same day while reading at 7:1 on canvas. Ink becomes the light tone, so the primary button turns chalk with dark text (`on-ink`). Status pairs invert: the light status tone on its deep tinted ground. Tints that mixed with white now mix with `canvas`, and the darkest tally step mixes with `mix-strong` (black in light, white in dark). Print always uses the light palette.

The theme follows the system setting until the user picks one with the header toggle (sun or moon icon, accessible name states the current theme). The choice is stored per device under `cyclereg-theme` and applied by an inline script in `index.html` before first paint.

### Named Rules
**The Day Hue Rule.** A day hue appears only on things that belong to that day: rail swatch, race header rule, clip bar, tally segments, rider preview day rule and group labels. It is never used as a general accent or for buttons.

**The Paired Status Rule.** Status color is always a dark text tone on its matching pale ground (inverted in the dark theme: light tone on deep ground). Never place status text on canvas alone or a status fill behind white text, except the explicitly defined high-contrast check-in result below.

## Typography

**Display Font:** Public Sans (with system-ui, -apple-system, Segoe UI)
**Body Font:** Public Sans
**Numeral Font:** Barlow Condensed (with Public Sans)
**Code Font:** ui-monospace stack, for category codes

**Character:** A plain, civic grotesque for words and a condensed race-number face for figures. The contrast between the two is what makes a schedule scannable.

### Hierarchy
- **Display** (500, 28px, -0.01em): the race name in the race header. The home intro and rider preview title use the same weight at 34px.
- **Headline** (500, 24px): page titles in settings, pools, and publish views. Rider preview day titles use 500 at 22px.
- **Title** (600, 17px): section heads such as "Category schedule" and "Start groups". Card and row names use 600 at 14.5px.
- **Body** (400, 15px, 1.5): default text and ledes, with ledes capped at 68ch and section notes at 70ch. Dense desktop surfaces (tables, rail, buttons) use 14px. Editable inputs on phones use at least 16px to avoid focus zoom.
- **Label** (600, 12.5px): table column headers, stat labels, issue locations. Sentence case, muted color, no tracking.
- **Numeral** (Barlow Condensed 600, tabular and lining figures): inline at 1.08em of its context; at 26px for start times on clips, 20px for the tally used count, 16px in numeric inputs.
- **Code** (monospace 12px on tyvek-deep, 4px radius): category codes such as RR-P12. Code inputs are uppercase.

### Named Rules
**The Bib Number Rule.** Any time, count, cap, entry total, or price is set in the numeral face with tabular figures. Words never use it, except the uppercase CYCLEREG wordmark.

**The Modest Weight Rule.** Large headings are 500, not bold. Weight 600 is reserved for titles, labels, and numerals.

## Layout

The desktop workspace is a fixed-height app: a 60px top bar, then a three-column grid with a 236px rail, a flexible main column, and a 400px inspector, each scrolling independently. At 1280px and below the columns narrow to 216px and 360px. At 1080px and below the inspector becomes a fixed right drawer (up to 460px wide) that slides in when opened. At 760px and below the app scrolls as one page, the rail becomes a sticky horizontal strip, and the breadcrumb wraps to its own row.

Spacing follows a 4px base scale (s-1 through s-6). Main content uses 24px padding and 32px gaps between sections; panels and clips use 16px padding; form rows use 12px gaps; tag stacks and chip groups use 6px. The field board is an auto-fill grid with a 290px minimum column. Forms use auto-fit grids with a 150px minimum field width.

## Elevation & Depth

Working surfaces remain flat. Depth comes from the canvas/Tyvek step, hairlines, selection markers, and a restrained shadow on overlapping controls. Liquid Glass is a navigation and overlay material, never a data container.

### Selective Liquid Glass (Planned)

| Surface | Material rule |
|---|---|
| Top navigation, floating action toolbar, mobile entry-tray shell | Glass allowed; keep text and controls on a consistent high-opacity tint. |
| Popover, menu, sheet or drawer frame | Glass allowed on the frame; form fields, prices, errors, and long reading areas inside remain opaque canvas. Modal sheets also need a separate scrim. |
| Category rows, tables and sticky table headers, editor fields, package comparisons, checkout totals, receipt, check-in result | Opaque canvas, Tyvek, or paired status ground. No backdrop blur. |
| Event photography | Content, not a glass texture. No glass cards stacked over other glass. |

Starting material tokens for future implementation, subject to measured contrast: `glass-light` = white at 90% opacity, `glass-dark` = #15181d at 94%, `glass-blur` = 16px, `glass-edge` = the theme's hairline, and `glass-shadow` = 0 4px 16px ink at 10% opacity in light theme. Use a visible theme-appropriate edge in dark theme instead of increasing glow. Keep the existing radius scale; a floating toolbar may use a 16px radius, while fields and tables retain their existing corners. No animated blur, lens distortion, chromatic fringes, or cursor-following shine.

Treat those values as starting points, not proof of contrast. Measure the composited result over the brightest, darkest, and busiest underlying content in both themes. Raise opacity or switch to opaque canvas whenever a contrast target fails. Limit glass to one overlapping layer per region and avoid full-page blur.

**Opaque fallback:** reduced transparency, increased contrast, forced colors, unsupported backdrop filtering, and print use solid canvas with a defined border and no blur. Honor system preferences where supported and provide an explicit Reduce transparency setting so the fallback is always reachable. That setting is Planned. It is independent of theme and reduced motion; all controls, labels, and information remain available in every combination.

### Shadow Vocabulary
- **Rail selection** (`box-shadow: 0 1px 2px rgba(24, 29, 38, 0.08), 0 0 0 1px var(--hairline)`): the active rail item, a white tab lifted slightly off the Tyvek rail.
- **Selection ring** (`box-shadow: 0 0 0 1px var(--ink)`): a selected tag chip, doubling its ink border.
- **Row marker** (`box-shadow: inset 3px 0 0 var(--ink)`): the left edge of the selected schedule row.
- **Drawer** (`box-shadow: -12px 0 32px rgba(24, 29, 38, 0.16)`): the inspector when it overlays content below 1080px.

### Named Rules
**The Hairline Over Shadow Rule.** Separate surfaces with a 1px hairline or a tonal step. A drop shadow is allowed only for a surface that actually overlaps other content.

## Shapes

Corners are gently rounded and step with size: 6px for inputs, rail items, icon buttons, and notes; 8px for buttons, tag chips, alerts, and segmented controls; 10px for tables, clips, empty states, and settings panels. Pills (11px on 22px-high tags and status, 16px on 32px chips) mark status and selectable options. Borders are 1px solid; dashed borders mean "not yet assigned" (the loose clip and empty states). The one heavier line is the 3px day-hue rule under race headers and rider preview day titles. The clip bar is a 44 by 6px tab with only its bottom corners rounded (3px).

## Components

### Buttons
Quiet and compact; the ink button is the only filled button.
- **Shape:** gently rounded (8px), 38px high, 14px horizontal padding, 500 weight 14px label, optional 16px stroke icon with a 6px gap.
- **Primary:** ink fill, white text. Hover darkens to near-black.
- **Secondary:** canvas fill, ink text, hairline border. Hover strengthens the border.
- **Ghost:** no fill or border; hover fills Tyvek Deep. Used for Edit and in-panel actions.
- **Danger:** ghost with error text.
- **Small:** 32px high, 10px padding, 13px label.
- **States:** press feedback follows the motion rules below; disabled controls retain readable labels and an adjacent reason when progress is blocked, rather than relying on low opacity alone. Hover styles apply only on hover-capable fine pointers.
- **Icon button:** 32px square, 6px radius, muted icon, Tyvek Deep on hover, press feedback must not displace its icon or reduce its effective target.

### Tags and status
- **Tag:** 22px pill, Tyvek Deep ground, 12px 500 text. Warn and error variants use the paired status colors.
- **Status pill:** same geometry at 600 weight; eligible uses OK, needs review uses Warning, ineligible uses Tyvek Deep with muted text.
- **Issue count:** text such as "2 errors, 3 warnings" with a status dot, in the paired status tone; "No issues" in green when clear. Never a bare number.

### Check-in result
The race-day check-in result is the one place status uses a solid fill: white text on deep green (#0b5a2b, "Ready to race") or deep red (#9e1b12, "Not ready"), with a check or cross icon and the words in condensed caps. The fill is the same in light and dark themes because tinted grounds wash out in direct sun; both pairs stay above 7:1. Blockers sit underneath on the paired error ground, each with the action to take. The issued bib is shown as a large condensed numeral. Motion is limited to press feedback, since volunteers repeat these actions all morning.

### Chips and segmented controls
- **Chip:** 32px pill with a hairline border and 13px 500 text, wrapping a hidden native input. Selected chips fill with ink and white text. Use immediate selected-state feedback; any press scale follows the motion rules below. Focus ring draws on the chip.
- **Segmented control:** hairline-bordered 8px container with 2px padding; options are 6px-radius 13px labels.

### Inputs / Fields
- **Style:** canvas fill, 1px hairline, 6px radius, 38px minimum height, 14px text on desktop, at least 16px on phones. Labels are 13px 500 ink above the input with a 5px gap; hints and errors are 12.5px below.
- **Hover / Focus:** hover strengthens the border; focus uses a visible 2px outline with at least 3:1 contrast against adjacent colors; a faint blue tint alone is insufficient.
- **Error:** border turns error red and an error line appears below.
- **Variants:** numeric inputs use the numeral face at 16px; code inputs use monospace uppercase; the title input is 20px 600 at 46px high.

### Navigation
- **Top bar:** 60px, canvas, hairline bottom. Wordmark in uppercase Barlow Condensed 22px, then a muted breadcrumb with the event name in 600 ink, a save indicator (8px dot: green saved, amber pending, red error), and the button pair on the right.
- **Rail:** Tyvek column. Day groups are labeled with the day name in 600 and the date in muted 400. Race items carry a 10px day swatch (3px radius) and a muted numeral count. The active item is a white tab with the rail selection shadow; others fill Tyvek Deep on hover. A "Not connected yet" block sits at the bottom in pending color.

### Category schedule table
- **Container:** hairline border, 10px radius, horizontal scroll when narrow.
- **Header:** sticky, 12.5px 600 muted labels, hairline bottom.
- **Group rows:** Tyvek band with a 13px 600 ink label. Groups arrange rows only.
- **Rows:** 10px cell padding, soft hairline dividers, name in 600 14.5px with a code tag below. Numbers right-aligned in the numeral face with a muted "left" line. Hover fills Tyvek; selection tints 7% Link Blue with the ink row marker.

### Field board clip (signature)
A start group is a Tyvek card (10px radius, soft hairline) with a 44 by 6px day-hue clip bar at the top-left edge. The head reads start time in a 26px numeral, group name in 600 14.5px, and a ghost Edit button. Below it, a stack of tag chips: canvas rows 40px high with a hairline border and 8px radius, holding code, name, and a numeral count against cap, with a 40px move control on a Tyvek strip at the right edge. A selected chip gets an ink border and selection ring. Unassigned categories sit in a canvas clip with a dashed border and a strong-border clip bar. A clip with a problem gets an error-tinted border and an error line.

### Tally bar (signature)
A 12px track on Tyvek Deep with a 6px radius and a faint inset ring. Each category in the group is a segment colored from the day hue (full, 62% tint, 40% tint, 80% shade), positioned by transform. Show the actual count immediately, with no growth from zero on first render; optional transitions for user-triggered reassignment follow the motion rules below. Below the track: used count in a 20px numeral, "of" cap and "left" in numerals, a muted basis line naming the limit source, and a legend of 10px keys when more than one category shares the pool.

### Notes, alerts, and issues
- **Note:** 6px radius, Tyvek or paired status ground, 13.5px text with a leading 16px icon.
- **Alert:** 8px radius, paired status ground, 14px text, used for blocking errors.
- **Issue row:** Tyvek button row, 6px radius, 13px text with a status-colored icon and a 12px 600 muted location line; hover fills Tyvek Deep.
- **Pending integration:** pending-colored 12.5px text with a dashed-circle icon, stacked on pending-bg when grouped.

### Rider checkout components

- **Stepper:** numbered steps (Races, Your details, Waiver, Review and pay). The current step is an ink-filled numeral; finished steps show a green check on the ok ground. The numbers carry real order, so they are allowed here.
- **Race option:** a full-width checkbox row on canvas with a hairline border and 8px corners: an outlined box (ink fill and white check when picked), the code chip and category name, the eligibility summary, length and places, and the price as a bib numeral on the right. Picked rows get an ink border and a 1px ink ring. Rows the rider cannot enter sit on Tyvek with muted text. Below the row: one status chip (You qualify, Organizer review, Not eligible, Full, Closed) and one reason line.
- **Start block:** each start time as a bib numeral with the staging time beneath it, then the race options that start together, with a clip icon line when more than one category shares the start.
- **Entry tray:** sticky right rail on desktop; on phones a bottom bar (count, total numeral, View) that expands into a sheet. Quote lines are Tyvek rows with the code chip, name, race, price, and a green discount line naming the bundle or "Additional race". The total is a 26px numeral over a hairline.
- **Hold timer:** pending-tone pill with a clip icon and a countdown numeral.
- **Check-in ticket:** Tyvek panel with a 1.5px ink outline and a 44px numeral code (34px on phones).
- **Demo label:** a 24px pill in demo-banner colors reading "Demo", in the rider header on every demo screen. Payment-related screens add a pending-tone line, "Simulated payment: no money is charged."
- **Error summary:** a 1.5px error-red outline on the error ground at the top of a step, a heading that counts the problems, and links that move focus to each field. It takes focus when it appears.
- **Demo receipt:** dashed border and a rotated "DEMO" watermark in a 6% ink tint behind the lines.
- **Signature field:** a full-width input set in italic at 18px.
- **Readiness list:** icon plus label per item: green check for done, amber warning for organizer review, red for missing.

## Rider and organizer flows

The following are Planned presentation rules, not claims that every state or capability exists. Reuse the component vocabulary above and the business rules in [product.md](product.md).

### Event pages

Lead with one strong, rights-cleared race photograph, event name, dates with year, location, organizer, and one prominent Register action. Keep key details and registration access available if the image fails to load. Use a fixed image aspect ratio to prevent layout shifts; crop around the race, not overlaid text. Informative images need useful alt text; decorative images have empty alt text. Text over photography requires a stable opaque backing or a tested scrim.

Give rider pages 24–32px section gaps on phones and 32–48px on larger screens, with 16–24px side padding and reading text capped near 68ch. Event display titles may grow from 28px on phones to 40px on desktop at weight 500, without truncation. Keep the organizer workspace's compact type and spacing. A sticky registration action may replace the hero action once it scrolls away; avoid two competing primary actions in the same viewport. Show Closed or Not open yet with dates and a next step when registration is unavailable. Photography is a future direction; the current catalog is text-led.

### Race selection and packages

Keep category name, structured eligibility summary and review status, race date, start time and time zone, availability, and current entry price in one readable option. Staging time is separate from start time. On phones, wrap metadata underneath the name without moving the price into an unrelated panel. Keep ineligible, full, and closed options discoverable with a reason; never communicate these states through opacity or color alone. Availability describes remaining capacity, not license clearance or a guaranteed reservation.

For an event package, show each included race, its date, chosen category, individual price, package total, and savings together on an opaque surface. List missing choices explicitly, for example “Choose a Sunday criterium category,” with an action that moves focus to that race. Do not imply that selecting the package selects categories automatically or reserves places. Keep errors about eligibility, capacity, and missing selections next to the affected race and in the entry summary. Update and politely announce the quoted total without moving focus.

**Current versus Planned:** the local build supports same-event package pricing and a Berkeley omnium podium nomination subject to organizer review. The existing code/UI calls that package a “bundle.” Dedicated omnium/stage-race setup, TT registration, and cross-event, cross-organization season passes remain Planned. A nomination is not a result, podium award, or license approval. Do not expose a working purchase action for Planned offerings.

Demo examples only: Berkeley road race $80 + criterium $60 = $140 individually, or $130 package, saving $10. The proposed three-race series is Friday TT $50, Saturday road race $80, Sunday criterium $60: $190 individually, $160 package, saving $30. Label that series Planned; it is not proof of TT or series checkout support. Distinguish an event package from a season pass spanning events and organizations. Savings compare the same included entries; show fees separately and never imply an unquoted fee is zero.

### Checkout and confirmation

Keep the running total visible beside desktop forms and in the mobile tray, on an opaque pricing surface. Review shows entries, discounts, fees, total, and the payment action together; state whether the total is final or still being calculated. Do not animate money through intermediate values or silently change a paid entry's accepted price.

Preserve entered details when moving backward, opening the tray, or correcting a failed validation or payment attempt within the flow. Do not reset unrelated fields, clear a signature without explanation, or require re-entry after a recoverable error. This does not authorize storing sensitive details in browser storage. Each field has a persistent label, an associated error explaining how to fix it, and an invalid state. After unsuccessful submission, focus the error summary with links to fields; show payment/network errors beside the payment action with a retry path. Pending submission prevents duplicate actions and states what is happening. Success follows the actual recorded result, never an animation finishing.

Confirmation separates **entry**, **payment**, **waiver**, and **license/readiness** into labeled rows with text, icon, and the next action where needed. “Payment recorded” cannot turn an unsigned waiver or unknown/stale license into “Ready to race.” Examples: “Simulated payment complete,” “Sample waiver signed,” and “License needs organizer review.” Include selected races, total, confirmation code, and check-in instructions without hiding unresolved tasks under a celebration banner. Never display “USAC approved” or imply federation verification is connected.

Keep the Demo label in every demo header and “Simulated payment: no money is charged” near review, payment actions, and confirmation. Describe simulated license results as simulated and disconnected checks as not connected. The watermark supplements readable notices; it is not the only demo disclosure. Live Stripe Checkout is Planned under [ADR 0002](docs/decisions/0002-stripe-payments.md), not enabled by this guide.

### Organizer operations

Keep schedules, rosters, capacity, pricing, and check-in results on stable opaque surfaces with persistent column labels, aligned numerals, and explicit units. Keep display groups, categories, start groups, classifications, capacity pools, and packages visibly distinct. A shared start limit is not a display-header limit. Retain filters, scroll position, and row context after an edit; show saving, saved, and failure as text as well as color, preserving unsaved edits on failure.

Provide visible edit, duplicate, move, and recovery actions without hover dependence. Dragging has keyboard and button alternatives. On narrow screens use an accessible contained table scroller or a labeled record detail view, keeping rider identity and the active action visible. Glass can frame navigation or an inspector, but editing content remains opaque. Check-in lookup, blocker resolution, bib issuance, and repeat scans use immediate feedback with no entrance sequences or celebratory delays. A paid but blocked rider must retain the blocker reason and next action.

## Interaction, mobile, and accessibility

### Purposeful motion (Planned refinements)

Motion explains an origin, a selection, or a changed relationship. It never delays input or business state. These rules supersede the earlier blanket press scales and tally entrance animation.

| Trigger | Allowed response | Reduced motion |
|---|---|---|
| Pointer press | Immediate border/fill feedback; optional scale no smaller than 0.98, at most 100ms. Commit on release; allow cancellation. | Instant border/fill, no scale. |
| Tray, popover, or inspector opens | 160–220ms opacity/short translation from its trigger or screen edge; close in 120–180ms. Reverse from the current position when interrupted. | Appear/close immediately; preserve focus behavior. |
| User reassigns a category | At most 200ms to show the destination; keep numeric values accurate throughout. | Immediate destination plus a text announcement. |
| Price, capacity, readiness, scan result | Immediate text/icon update; optional polite announcement for a user-triggered change. No rolling numbers, row cascades, or repeated pulse. | Same immediate update. |

Use transform and opacity for movement, without animating blur, page layout, or the background photograph. No parallax, auto-playing hero motion, bounce on keyboard navigation, or `transition: all`. An interrupting close, new selection, or navigation must take effect immediately. Respect reduced motion from first render: remove slides, springs, scaling, and decorative transitions, while keeping static focus, status, and error cues. Do not announce a hold countdown every second; announce meaningful expiry and recovery instructions.

### Testable acceptance checks for future UI changes

These are review criteria, **not results of this documentation change**. Apply the [coding guide](docs/coding-guide.md#accessibility-and-mobile-usability) and [accessibility checklist](ACCESSIBILITY.md) as well.

| Check | Pass condition |
|---|---|
| Composited contrast | Both themes, busy photography and scrolling content: normal text at least 4.5:1, large text at least 3:1, essential control boundaries, icons, and focus indicators at least 3:1 against adjacent colors. Status always has words and an icon. Raise glass opacity when needed. |
| Transparency alternatives | Reduced transparency and explicit setting show opaque surfaces without lost content; increased contrast and forced colors preserve controls and focus. With backdrop filtering unavailable, navigation remains readable and usable. Test independently and together with reduced motion. |
| Mobile layout | At 360px and 390px widths, portrait/landscape and software keyboard open, no clipped labels, prices, errors, or actions. Controls have at least 44×44 CSS px effective touch targets without overlapping neighbors; compact desktop visuals may retain their size within a larger target. Inputs use at least 16px text. |
| Zoom and reflow | At 200% text zoom and 320 CSS px reflow width, content and actions remain available without page-wide horizontal scrolling. A genuinely two-dimensional table may scroll within a labeled, keyboard-accessible region. |
| Sticky UI | Safe-area insets and adequate bottom space keep the last field, inline error, primary action, and focused element clear of floating bars and the on-screen keyboard. No sticky glass layer obscures focused content. |
| Keyboard | Complete race choice, package correction, checkout, editor, and check-in with Tab/Shift+Tab, Enter/Space, and appropriate arrow keys. Logical focus order, visible focus, no hover-only actions or keyboard traps. A modal traps focus, closes with Escape, and restores focus to its trigger; a non-modal panel does not trap focus. |
| Screen reader | Semantic headings, tables with associated headers, labeled controls, and programmatically associated errors. Selection, total, save, and readiness changes are announced once without stealing focus; separate payment/waiver/license states are understandable without color. |
| Recovery | After an invalid field, server failure, or simulated payment failure, previous details remain; summary links reach the relevant fields and retry is available. Test back navigation and closing/reopening the tray. |
| Package clarity | With one required race missing, show its name/date, correction action, and why the package is incomplete. Verify savings against the quoted entries; Planned series/season-pass features have no misleading purchase action. |
| Race-day speed | Repeated lookup, edit, and check-in are usable before any animation completes. No count animation or overlay blur over results; blocked riders show actionable reasons in both themes. Test on a real phone outdoors before calling sunlight usability Verified. |

### Decisions still needing input

- Event photography source, usage rights, and event-specific crops; use an opaque text-led header until assets are approved.
- Placement of the Planned Reduce transparency setting alongside display preferences. The opaque fallback itself is required regardless of placement.
- Final glass tint and depth after contrast checks on real devices in both themes; the recipe above is provisional, not a validated palette.

Design guidance used Impeccable, Apple design guidance, and Emil's interaction guidance. The required `awesome-design` brand-reference skill was unavailable in the installed skill paths; the existing CycleReg identity supplies the visual baseline.

## Do's and Don'ts

### Do:
- **Do** set every time, count, cap, entry total, and price in Barlow Condensed 600 with tabular figures.
- **Do** carry race-day identity through the inherited day color only, so swatch, rule, clip, and tally always match.
- **Do** pair one ink primary button with outlined secondary or ghost buttons in each area.
- **Do** separate surfaces with 1px hairlines and the canvas to Tyvek step.
- **Do** use dashed borders only for unassigned or empty states.
- **Do** gate hover styles behind hover-capable fine pointers and turn off transitions and press scaling under reduced motion.
- **Do** draw icons as inline 16px stroke SVGs at 1.5px stroke with round caps.

### Don't:
- **Don't** use a day hue for buttons, links, or decoration outside its own day's elements.
- **Don't** add drop shadows to cards, clips, or tables at rest, or apply glass behind forms, prices, or dense data.
- **Don't** set headings above 17px in bold; use 500.
- **Don't** use Link Blue as a fill or button color.
- **Don't** extend the clip metaphor beyond the clip bar, tag chips, and tally (no pins, paper textures, or skeuomorphic boards).
- **Don't** introduce colors outside the token set; status tones come in text and ground pairs.
