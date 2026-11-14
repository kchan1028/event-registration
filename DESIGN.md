---
name: CycleReg organizer workspace
description: Category schedule builder for volunteer-run road race and criterium weekends.
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

# Design System: CycleReg organizer workspace

## Overview

**Creative North Star: "The Race-Tent Field Board"**

The workspace is the registration table at a bike race, drawn as software. The ground is Tyvek white like a race bib, the text is bib-black ink, and each race day gets one hue that follows its races everywhere: the rail swatch, the rule under the race header, the clip on each start group, and the segments of its tally bar. Times, counts, caps, and prices are set in a condensed numeral face so they read like bib numbers. Everything else is quiet: hairline borders, modest weights, and one ink button per area.

Density is that of a working tool. Three columns at desktop (rail, schedule, inspector), tables with 10px cell padding, 14px dense text, and status shown in small tinted tags rather than large banners. The one place the world becomes literal is the field board, where start groups are cards with a short day-hue clip across the top edge holding a stack of category tags, with a shared tally bar underneath. The clip metaphor stops there: tags, the clip bar, and the tally.

Detailing follows the Airtable reference: ink primary paired with an outlined secondary, 1px hairlines instead of shadows, and medium (500) weight headings rather than bold.

**Key Characteristics:**
- Tyvek-white and canvas-white surfaces separated by hairlines, not shadows.
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

### Named Rules
**The Day Hue Rule.** A day hue appears only on things that belong to that day: rail swatch, race header rule, clip bar, tally segments, rider preview day rule and group labels. It is never used as a general accent or for buttons.

**The Paired Status Rule.** Status color is always a dark text tone on its matching pale ground. Never place status text on canvas alone or a status fill behind white text, except the error count badge.

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
- **Body** (400, 15px, 1.5): default text and ledes, with ledes capped at 68ch and section notes at 70ch. Dense surfaces (tables, rail, inputs, buttons) use 14px.
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

The system is flat. Depth comes from the canvas and Tyvek tonal step and from hairline borders. Shadows appear in four narrow places only: the active rail item, the selected row and tag chip markers (which are inset or 1px rings, not lift), and the mobile inspector drawer.

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
- **States:** press scales to 0.97 over 160ms with the ease-out curve; disabled drops to 45% opacity. Hover styles apply only on hover-capable fine pointers.
- **Icon button:** 32px square, 6px radius, muted icon, Tyvek Deep on hover, press scales to 0.94.

### Tags and status
- **Tag:** 22px pill, Tyvek Deep ground, 12px 500 text. Warn and error variants use the paired status colors.
- **Status pill:** same geometry at 600 weight; eligible uses OK, needs review uses Warning, ineligible uses Tyvek Deep with muted text.
- **Issue count:** text such as "2 errors, 3 warnings" with a status dot, in the paired status tone; "No issues" in green when clear. Never a bare number.

### Chips and segmented controls
- **Chip:** 32px pill with a hairline border and 13px 500 text, wrapping a hidden native input. Selected chips fill with ink and white text. Press scales to 0.96. Focus ring draws on the chip.
- **Segmented control:** hairline-bordered 8px container with 2px padding; options are 6px-radius 13px labels.

### Inputs / Fields
- **Style:** canvas fill, 1px hairline, 6px radius, 38px minimum height, 14px text. Labels are 13px 500 ink above the input with a 5px gap; hints and errors are 12.5px below.
- **Hover / Focus:** hover strengthens the border; focus turns the border Link Blue with a 2px 25% blue outline.
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
A 12px track on Tyvek Deep with a 6px radius and a faint inset ring. Each category in the group is a segment colored from the day hue (full, 62% tint, 40% tint, 80% shade), positioned by transform and animated over 260ms with the ease-out curve, growing from zero on first render. Below the track: used count in a 20px numeral, "of" cap and "left" in numerals, a muted basis line naming the limit source, and a legend of 10px keys when more than one category shares the pool.

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
- **Readiness list:** icon plus label per item: green check for done, amber warning for organizer review, red for missing.

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
- **Don't** add drop shadows to cards, clips, or tables at rest.
- **Don't** set headings above 17px in bold; use 500.
- **Don't** use Link Blue as a fill or button color.
- **Don't** extend the clip metaphor beyond the clip bar, tag chips, and tally (no pins, paper textures, or skeuomorphic boards).
- **Don't** introduce colors outside the token set; status tones come in text and ground pairs.
