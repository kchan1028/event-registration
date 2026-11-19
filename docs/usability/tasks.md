# Usability test tasks

Each role has core tasks that count toward the exit gate and optional tasks to run if time allows. Read the **scenario** aloud and hand the participant a printed copy. The other fields are for the facilitator and note-taker only; do not show them to the participant.

Task wording avoids the names of buttons and screens on purpose, so the test shows whether people can find them. Expected totals come from the [fixtures](../fixtures/README.md#worked-demo-orders).

## Rider and parent tasks

**Starting state.** Fresh session database (see [setup](README.md#set-up-the-computer-before-each-session)). Load the generated case-study collection for this session first (see setup), then select **Browse rider events** on the home page and leave the browser on **Choose an event**. Browsing does not create events. For at least two of the five rider sessions, use a phone-sized window.

**Warm-up questions.** How do you usually register for races? What do you find annoying about it? Have you ever entered the wrong race or category?

### R1. Two races on one day (core)

**Scenario:** "You're Alex Demo. You want to race both the Men Cat 4/5 race and the Open Cat 4/5 Evening race at Demo Harbor Criterium: pricing and eligibility lab. Register and pay. Use the demo rider details instead of your own."

**Success:** Confirmation shows both entries and a total of **$59.65** (entries $65.00, second-race discount −$10.00, demo platform fee $3.00, demo processing fee $1.65).

**Watch for:** finding the demo rider picker; noticing the discount before review; reading "simulated payment" correctly; the 10-minute hold.

**Follow-up:** "Why is the total less than the two race prices added together?" (Expected: a second-race discount; fees noted.)

### R2. Both days with the weekend bundle (core)

**Scenario:** "You're Blake Demo. You want to race the masters road race on Saturday and the masters criterium on Sunday at Demo Redwood Omnium Weekend, at the best price. Register and pay."

**Success:** Confirmation shows both masters entries under the weekend bundle and a total of **$80.25**.

**Watch for:** whether the bundle is noticed or the rider pays full price for two races; whether a half-selected bundle is understood; reading both days on one page.

**Follow-up:** "What do you get for the weekend price, and what would happen if you could only race Saturday?"

### R3. Parent registering a junior (core)

**Scenario:** "You're Jordan Demo. Your child, Casey Demo, is 13 and wants to race Juniors 10-14 at Demo Harbor Criterium: pricing and eligibility lab. Register Casey and sign for them."

**Success:** Guardian details entered, the waiver signed by Jordan as guardian, confirmation shows Juniors 10-14 and a total of **$18.45**.

**Watch for:** whether the parent understands whose details go where; the typed-name signature matching the guardian; the "minor without guardian" message if they skip it. The demo rider picker fills in the guardian for Casey, which hides the "whose details go where" question. In at least one parent session, ask the participant to choose "None" in the picker and type made-up details for both child and guardian.

**Follow-up:** "Who signed the waiver, and does anything else still need to happen before Casey races?"

### R4. A license that still needs review (core)

**Scenario:** "You're Sam Demo. Enter Women Cat 3/4/5 at Demo Harbor Criterium: pricing and eligibility lab and pay. When you're done, tell me whether you're all set to race."

**Success:** Confirmation shows Women Cat 3/4/5 and a total of **$39.05**, **and** the participant says they are not yet cleared because the license needs review (at the desk or by the organizer).

**Score F** if the participant believes they are cleared to race. This is a [critical blocker](README.md#score-the-sessions) case.

**Watch for:** whether "paid" and "ready to race" are read as different things; what they think they must bring or do on race day.

**Follow-up:** "What would you do before race morning, if anything?"

### R5. A full race and a declined payment (optional)

**Scenario:** "You're Blake Demo. Try to enter Masters 35+ Cat 3/4 at Demo Harbor Criterium: pricing and eligibility lab. If that doesn't work, enter Women Cat 3/4/5 instead. When you get to payment, I'll ask you to pretend the card was declined."

At the payment step, ask the participant to choose **Simulate a declined payment**, then to finish.

**Success:** Understands the masters race is full and picks another; after the decline, retries and reaches confirmation without starting over.

**Watch for:** whether "Full" and the waitlist message are clear; whether they fear being charged twice; whether the held places and timer are understood.

**Rider debrief.** Was anything about the price or fees a surprise? What would you want in the confirmation email? How would you know what to do on race morning?

## Organizer tasks

**Starting state.** Fresh session database. Then, before the participant arrives:

1. On the home page select **Load Berkeley Omnium**.
2. Back on the home page, select **Browse rider events**, choose **Demo Harbor Criterium: pricing and eligibility lab**, pick the demo rider **Sam Demo**, enter **Women Cat 3/4/5**, sign the waiver, and choose **Complete simulated payment**. This creates a paid entry whose license still needs review.
3. Open the Berkeley Omnium's rider preview, enter racing age 16, Cat 4, Women in **Check which races you can enter**, and write down the qualifying Sunday criterium categories on the observation sheet. This is the expected answer for O3.
4. Return to the home page and leave it open.

**Warm-up questions.** How do you set up categories and field limits today? Where do mistakes usually happen? Who else touches the setup?

### O1. Raise a field limit (core)

**Scenario:** "The officials approved a bigger field for the Juniors 15-16 and 17-18 start on Sunday's criterium. Raise its limit from 50 to 60."

**Success:** The start group **Juniors 15-16 and 17-18** in the Berkeley Streets Criterium has a field limit of 60. No category cap, capacity pool, or display group was created or changed instead.

**Watch for:** confusing a start group's field limit with a category cap; looking in the wrong race or day; trusting autosave; finding the start groups at all, since they sit below the category schedule on the race page.

**Follow-up:** "If a rider entered both Junior 15-16 and Junior 17-18, how many places would that use?" (Expected: they cannot; the categories start together. A rider counts once toward a shared start group.)

### O2. Start two categories together (core)

**Scenario:** "On Saturday's road race, the officials want Masters 60+ 1/2/3/4/5 and Masters 65+ 1/2/3/4/5 to start together, with one combined field limit of 80. They are still scored separately. Set that up."

**Success:** One start group in the Berkeley Hills Road Race contains both categories with a field limit of 80. Each category keeps its own timer classification code and price. No display group or capacity pool is used as a substitute.

**Watch for:** expecting a display header to create the shared start or limit; deleting or merging categories; worrying that combining changes prices or classifications.

**Follow-up:** "Will the timer still get separate results for 60+ and 65+? How can you tell?"

### O3. Check what a rider can enter (core)

**Scenario:** "A 16-year-old Cat 4 girl asks which races she can enter in Sunday's criterium. Use the setup to find out, without publishing anything."

**Success:** The participant opens the rider preview, enters the profile, and names the same qualifying categories the facilitator recorded during setup.

**Watch for:** finding the rider preview; reading "qualifies", "needs organizer review", and "not eligible" correctly; assuming eligibility from category names.

**Follow-up:** "Why can't she enter the women's 3 race?" (Checks that the reason shown is understood.)

### O4. Publish the schedule (core)

**Scenario:** "You're happy with the setup. Make it available for riders to register."

**Success:** Publishes version 1 from **Review and publish**, after reading the warnings, and can explain what at least one warning means (for example, categories starting together, or no refund policy set).

**Watch for:** whether warnings feel like errors; whether acknowledging a warning is understood as a decision; whether "published versions can't change" is clear.

**Follow-up:** "If you change a field limit tomorrow, what happens to riders who already registered?"

### O5. Record a license review (core)

**Scenario:** "Sam Demo registered for Demo Harbor Criterium: pricing and eligibility lab and just showed her license card at the desk. Record that her license has been checked."

**Success:** In the **CycleReg generated case studies** organization's Demo Harbor Criterium: pricing and eligibility lab, opens **Registrations**, finds Sam, chooses **Review license**, and selects **Mark reviewed**.

**Watch for:** finding the right organization and event; using the license review filter; believing that paying had already cleared her.

**Follow-up:** "Is Sam now ready to race? What else would a check-in volunteer see?"

### O6. Send the start list to the timer (core)

**Scenario:** "The timer needs the Demo Harbor Criterium: pricing and eligibility lab start list. Send them a file, and keep a record of exactly what you sent."

**Success:** Downloads the race CSV from **Start lists and timer export** and saves a snapshot.

**Watch for:** whether "snapshot" is understood; whether the sample-format notice is read; what they would do when a rider changes after sending.

**Organizer debrief.** Which part would you trust a new volunteer to do alone? What would you need to hand this event to next year's organizer? What is missing that you would check before opening registration?

## Check-in volunteer tasks

**Starting state.** Fresh session database. Then, before the participant arrives:

1. On the home page select **fictional example weekend** to load the example event, then publish it from **Review and publish** (acknowledge the warnings if any are listed).
2. Open **Race-day check-in** from the left-hand menu, select **Add fictional demo riders**, then open **Bib ranges**, keep **One bib all weekend**, set 100 to 299, and save.
3. Open **Registrations** for the same event, find **Harper Demo**, and write down or print the check-in code shown under the order. This is the code for V2.
4. Return to **Race-day check-in**, choose **Saturday**, find **Alex Demo**, and check Alex in with the next bib. V5 needs Alex to hold a bib already.
5. Select **Next rider** so the search box is empty.

The check-in demo loader creates fictional paid walk-ups for the desk exercises. Preassign bibs separately when rehearsing advance registration.

The demo riders include ready riders (Alex, Blake, Casey, Emery, Harper), riders whose license still needs review (Dana, Gray), and one unpaid rider (Frankie).

**Warm-up questions.** What happens at your registration tent on race morning? What are the most common problems? How do you know a rider is allowed to race?

### V1. Check in a ready rider (core, timed)

**Scenario:** "Emery Demo walks up to the table for Saturday's race. Check Emery in and tell me which bib number to hand over."

**Success:** Emery is checked in and the participant reads out the bib number shown. Record the time from the end of the scenario to the bib number being read out.

**Watch for:** how they search; whether the ready result is noticed at a glance; whether they hesitate before checking in.

### V2. Use a check-in code (core)

Hand the participant Harper Demo's check-in code from setup, written or printed.

**Scenario:** "This rider shows you their check-in code. Check them in."

**Success:** Finds Harper Demo from the code and checks Harper in with a bib.

**Watch for:** typing the code with or without the dash; whether pressing Enter opening the rider is discovered or missed.

### V3. A rider who is not ready (core)

**Scenario:** "Dana Demo arrives for Saturday's race. Check Dana in."

**Success:** The participant does **not** issue a bib, and says Dana must go to the registration desk because the license needs review.

**Score F** if the participant issues a bib or tells Dana she can race. This is a [critical blocker](README.md#score-the-sessions) case.

**Watch for:** whether "Not ready" is noticed before acting; whether the reason and next step are read; whether they look for a way to override.

**Follow-up:** "What would you tell Dana, exactly?"

### V4. The same rider comes back (core)

**Scenario:** "Emery Demo comes back and says, 'I think I lost my bib number. Did I already check in?' Help Emery."

**Success:** Finds Emery, sees they are already checked in, and reads out the same bib number without issuing a second one.

**Watch for:** fear of creating a duplicate; whether "Checking in again keeps this bib" is noticed.

### V5. A torn bib (optional)

**Scenario:** "Alex Demo's bib tore while pinning it on. Give Alex a new bib, number 250."

**Success:** Changes the bib to 250 with a reason, and the old bib appears in the history.

**Watch for:** whether a reason feels like extra work or makes sense; whether they worry about the timer's list.

### V6. Read the result in daylight (optional, outdoors or by a bright window)

**Scenario:** "Look at the screen from where you'd stand at the table. For each of these riders, tell me in a few seconds whether they can race: Harper Demo, Gray Demo."

**Success:** Correctly reads Harper as ready and Gray as not ready, in the theme set for the session. Note the theme, the light, and the screen brightness.

**Volunteer debrief.** What would you do if the laptop stopped working? Is there anything on the screen you would not want a rider standing next to you to see? What would make a morning line move faster?

## Berkeley weekend initial round

Status: Planned formative module. Use this module **instead of** R1–R5/O1–O6/V1–V6 for the initial Berkeley round; do not mix denominators. The original tasks remain available for the later Phase 1 gate. The [expert review](pilot-run-2026-11-14.md#berkeley-weekend-case-study-code-based-expert-review) provides evidence and hypotheses, not expected participant reactions. Allow 45–60 minutes for riders and 60 minutes for organizer/volunteer sessions, with breaks or a second session if needed.

### Facilitator setup and fictional data

Create a fresh session database under the existing [local-only setup](README.md#set-up-the-computer-before-each-session). Use **Load Berkeley Omnium** on the home page, not the combined Berkeley seed. This loader creates the combined draft with synthetic capacity usage. For rider/volunteer sessions, preview and publish it after recording warnings; for organizer tasks, leave it as a draft. Do not assume it is already published. Record the commit, local date, theme, viewport, published version, starting availability, and any preparation changes. Do not seed other example events into this session.

| Fictional person | Profile / use |
|---|---|
| Emery Demo | Racing age 52, Cat 4, annual license, men, not collegiate. Weekend: RR-M50-34 + CR-M50-34; extra category CR-E4. |
| Casey Demo / Jordan Demo | Casey racing age 13, Cat 5, annual license, men, not collegiate; Jordan is parent/guardian. Weekend: RR-JB1314 + CR-J1314. |
| Taylor Demo | Racing age 16, Cat 4, annual license, men, not collegiate; CR-E4 minor-in-adult-category review probe. Do not describe this path as safe before the guardian gap is fixed. |
| Morgan Demo | Adult age 52, Cat 4, annual license, men; manual-entry paid registration, no demo picker/license result, for outstanding-license check-in. |

Use the person's lowercase first name plus `.demo@example.com` for email, “Demo Contact” with `2025550101` for an emergency contact, and “DEMO-STUDY” if a license label is needed. Use no real contact details or license numbers. Choose “None” in the demo rider picker and enter these fictional details manually so guardian and license-review questions are exposed. Racing age is supplied for the task, not calculated from a real birth date. All license results are unverified unless explicitly simulated.

Default pre-race expectations: $130 for the weekend and $150 with the extra criterium category, including zero configured demo fees. On either race day, the configured $15 surcharge can change these totals. The facilitator records the quote date and calculates expected totals before the session; do not change the computer clock or silently disable price rules. Use a separate clean starting state for each rider task so previous holds do not consume test capacity.

Prepare the full-category variant separately: in the combined draft set the Sunday Masters 35+/50+ 3/4 shared start limit to its existing synthetic usage (normally 57 = 38 + 19), verify zero remaining, then publish. Do not lower below existing usage or label a display header as the limit. For a live last-place variant instead, set the limit to usage + 1 and prepare two independent fictional orders; any concurrency observation is a technical rehearsal, not two participant completions.

For check-in, create Morgan's paid simulated road entry through ordinary checkout with a sample signature, without selecting a pre-cleared fixture rider. Configure a weekend bib range 100–299 and leave the license unreviewed. Separately prepare a ready control by recording an explicitly simulated manual license review in a separate session/order. **Missing waiver variant:** ordinary checkout cannot create this state; read a scenario card saying “Entry confirmed, payment simulated complete, waiver missing, license needs review.” Ask what the volunteer should do, but record this as a comprehension probe, not observed UI task completion. No database editing or real waiver acceptance.

### B1. Set up a weekend (organizer, core)

**Read aloud:** “Prepare this demonstration weekend: road race Saturday and criterium Sunday. Offer $80 and $60 entries or $130 for both. The Sunday Masters 35+ and 50+ Cat 3/4 categories share a start with a field limit of 100 and separate classifications. Check eligibility, dates and times, then make the schedule ready for riders. Tell me what still needs an official decision.”

**Success:** Correct same-event package includes both race IDs; prices, shared start, limits and classifications remain distinct; preview and publish completed, warnings considered, unresolved road starts/limits and rule provenance identified. No developer help or accidental capacity pool/display-header limit.

**Observe/ask:** Which setting controls the combined field? What happens to previously paid entries after a price change? Which warnings would prevent real registration? Time setup and count incorrect edits, reversals, and assistance.

### B2. Enter both days (rider, core)

**Read aloud:** “You are Emery Demo and want to race the Masters 50+ Cat 3/4 events on both days, at the best price. Register using these fictional details. Tell me what you bought, what you saved, and whether you may race yet.”

**Success:** Correct two entries and $130 pre-race total, $10 package saving, sample waiver and simulated payment; identifies license review as outstanding. Does not think the package awards a podium. Ask them first to choose Saturday only and explain what remains before continuing with both days; do not tell them which control to use.

**Observe/ask:** Is package intent noticed? Do the $74.29/$55.71 allocated prices obscure savings? Does “You qualify” imply official verification? Record the unaided explanation of included races, total, savings, and next step before prompting.

### B3. Add another criterium and recover (rider, core)

**Read aloud:** “In a fresh attempt at Emery's weekend order, add the Elite 4 criterium. Decide whether the schedule works for you and explain the price. Also consider the Masters 35+ category. Keep only choices you can actually race. At payment, try the demo decline once, then finish.”

**Success:** Weekend + CR-E4 quote $150 pre-race; understands $20 extra entry, $10 package saving, $40 extra-entry reduction. Distinguishes the 10-minute advisory recovery gap from the blocked simultaneous Masters categories; removes the conflicting choice without losing the valid entries. Decline/retry preserves details and yields one confirmed simulated order.

**Observe/ask:** What would make you change your mind about a short recovery gap? What stayed reserved after decline and what happens when the hold expires? Record wrong selections, price misunderstandings, lost details, retry assistance, and end-to-end time. State reset between B2 and B3 is facilitator preparation, not participant recovery.

### B4. Register a child (parent/rider, core)

**Read aloud:** “You are Jordan Demo. Register Casey, age 13, for the junior road race and criterium. Use Casey's details for the rider and your fictional details for the parent. Explain who signs and what is still needed before racing.”

**Success:** RR-JB1314 + CR-J1314, correct guardian details and guardian name/role on sample signature, $130 pre-race quote. Explains simulated payment, sample waiver, and unresolved license separately. Participant can correct a missing guardian or signature error without re-entering other details.

**Observe/ask:** Whose email/name belongs where? Does a junior expect different fees? After the main task, ask how Taylor, age 16 in Elite 4, should be handled. Demonstrate the known missing guardian prompt only as an expert-led probe; do not count the unsafe behavior as successful task completion or an official rule.

### B5. Full category (rider, core)

**Read aloud:** “You want Emery's weekend package, but the Sunday Masters field has filled. Find out what you can do next without accidentally buying just Saturday.”

**Success:** Recognizes the shared-start limit, no guaranteed Sunday place, and no complete package reservation. Finds a genuinely eligible available alternative or understands waitlist/contact next steps if no alternative is acceptable. A waitlist request is not described as an entry or a charge. Do not require joining a waitlist unless enabled in that variant.

**Observe/ask:** Does the reason identify the limiting start? Does changing an option lose details? What would a waitlist offer guarantee, and when? Score a mistaken completed single-day purchase as an error, not success.

### B6. Paid but blocked (volunteer/organizer, core)

**Read aloud:** “Morgan Demo arrives for Saturday and shows a paid confirmation. Help Morgan collect a bib, or explain exactly what must happen first.”

**Success:** Finds the correct entry/day, sees license review outstanding, issues no bib, and directs Morgan to the registration desk. Does not mark a real license verified just to finish. The facilitator may then record an explicitly simulated review and ask the participant to recheck, issue a bib, and repeat the lookup; the same active bib must remain.

**Observe/ask:** Does payment overshadow the blocker? Is the next action visible without hovering or interpreting color? Time the blocked lookup separately from the ready control; measure the ready control from task readout to correct bib read aloud. Read the missing-waiver scenario card and ask what must happen; record comprehension only. A paper/electronic waiver resolution UI is a missing workflow, not a task the participant can complete today.

### Accessibility and visual probes

Across sessions cover light and dark themes, a 360px rider viewport, 200% zoom, keyboard-only operation, and a screen-reader pass with an appropriate tester. Observe hidden totals/errors, focus behind sticky controls, meaningful checkbox names, and focus recovery after errors. Do not infer real-phone or outdoor success from emulation. Liquid Glass is Planned: evaluate opaque current surfaces now; evaluate composited contrast, reduced transparency and reduced motion in a later implemented build. Never score an unavailable setting as a participant failure.
