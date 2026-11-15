# Guardian and junior accounts: how other platforms do it

Status: Research, November 15, 2026. The recommendation below is Proposed and waits for the owner's decision. Nothing here is built.

The question: how should a parent or guardian be linked to a junior rider (under 18) so the guardian can register the junior, sign waivers, and later see and manage the junior's registrations, while no other household can? [product.md](../../product.md#sign-in-and-account-security) requires that "a guardian sees only juniors they are authorized to manage" and that "a rider reaching the applicable age does not silently retain or lose another person's access".

All pages were accessed on 2026-11-15. A "?" means the platform's public help did not say; treat those as unknown.

## What other platforms do

| Platform | Junior has own login? | Who signs the waiver | At 18 | Two guardians | Under 13 (COPPA) |
|---|---|---|---|---|---|
| BikeReg / AthleteReg | ? (help pages blocked automated access) | For USA Cycling events, sent to a parent or guardian to sign, or signed on paper on site (unverified, search snippet) | ? | ? | ? |
| USA Cycling | ? A parent buys the junior license (ages 6 to 18) ([juniors page](https://usacycling.org/get-started/bike-racing-for-kids-and-teens)) | Parent or guardian for under 18 (under 19 in Alabama), from a third-party copy of the waiver (unverified) | ? | Family membership covers 2 adults and 5 juniors (unverified) | Under 13 only with a parent's permission ([privacy policy](https://usacycling.org/privacy)) |
| RunSignup | No by default: the junior is a sub-account under the parent ([sub-accounts](https://help.runsignup.com/support/solutions/articles/17000062878-access-manage-a-sub-account)) | Event waiver; signer for a minor not stated | Sub-account can be transferred or claimed by the person, not tied to age | No shared custody; separate account sharing | Built "with COPPA in mind" ([RunSignup](https://info.runsignup.com/?p=268)) |
| ACTIVE.com | No: the minor is added under the parent's "My Family" ([family member](https://support.activenetwork.com/usersupport/articles/en_US/Article/Add-Family-Member-on-Active-com-Account)) | Parent signs during registration ([registering a minor](https://support.activenetwork.com/usersupport/articles/en_US/Article/Register-Someone-Else-Below-18)) | ? | ? | ? |
| Race Roster | ? | Organizer sets the minimum self-sign age; younger riders need a guardian's signature ([waivers](https://help.raceroster.com/en-us/knowledge-base/hc/en-us/articles/216529063-how-to-add-a-custom-waiver)) | ? | ? | ? |
| SportsEngine | No: athletes are sub-profiles in the parent's household; account holders are 18+ ([accounts](https://intercom.help/SportsEngine/en/articles/6304287-how-to-create-an-account)) | ? | The athlete creates their own account and asks for a merge (third-party guide, unverified) | Yes: the owner invites a guardian per athlete; pending until accepted ([add a guardian](https://intercom.help/sportsengine-mobile/en/articles/8262157-how-to-add-a-guardian)) | ? |
| NICA Pit Zone | No: a family dashboard on the parent's email ([FAQ](https://nationalmtb.org/pit-zone-faqs)) | Parent signs electronic waivers | ? | ? | ? |

The common pattern: **the junior is a profile under an adult's account, not a separate login.** Only SportsEngine documents a second guardian by invitation. No primary source documents a clean hand-over at 18.

## Proposed model for CycleReg

1. **A junior is a rider profile with no sign-in.** Only adults sign in, each with their own email. This matches RunSignup, ACTIVE, SportsEngine, and NICA, and avoids collecting data directly from children (a legal check is still needed before real minors' data).
2. **Access is an explicit guardianship record:** guardian account, junior profile, who granted it, when, and when it was revoked. A guardian sees only juniors with an active record and only their registrations. No "household" object is needed; another household has no record and sees nothing.
3. **A second guardian joins by email invitation**, pending until that person signs in with the invited email (the SportsEngine pattern, and the same mechanism as organizer invitations). Either guardian, or an organizer with a reason, can revoke. This can wait: one guardian per junior is a valid first step.
4. **Waivers** keep what the app already stores (signer name and role) and add the signer's account and the junior's age at signing. The self-sign age stays data, not code, because it differs by state.
5. **At the age of majority, nothing changes silently.** Guardian access continues until the rider claims their profile with their own email; the claim ends the guardianship records and is recorded. Past registrations and waivers keep the original signer.

## Open questions for the owner

- Accept the profile-plus-guardianship model above, or require every junior to have their own login?
- One guardian per junior first, or two from the start?
- Ask BikeReg and USA Cycling membership directly if matching their behaviour matters for the pilot.
