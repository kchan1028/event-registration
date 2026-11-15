# Email providers: adding marketing email later

Status: Research, November 15, 2026. Transactional email is decided ([ADR 0006](../decisions/0006-transactional-email-amazon-ses.md): Amazon SES). This case study answers a follow-up question from the owner: which providers would support marketing email (newsletters and promotions to riders who opted in) later, including "whitelisting", meaning good inbox placement for marketing mail.

All pages were accessed on 2026-11-15. Prices change often; check them again before choosing. Anything marked "unverified" did not come from the provider's own page.

## What "whitelisting" means in practice

At a few thousand emails a month, inbox placement comes from authentication and list hygiene, not from a dedicated or allowlisted IP address:

- **Domain authentication.** SPF, DKIM, and DMARC on the sending domain. Gmail's bulk sender rules (5,000+ messages a day) require all three (DMARC at `p=none` or stricter), RFC 8058 one-click unsubscribe plus a visible unsubscribe link, and a spam complaint rate below 0.30% (aim for under 0.10%) ([Google sender guidelines](https://support.google.com/a/answer/81126)).
- **Separate streams.** Send marketing from its own subdomain (for example `news.<domain>`) and its own configuration, so complaints about a newsletter never hurt order confirmations.
- **Dedicated IPs do not fit this volume.** They need steady traffic to build a reputation; a shared pool is better below hundreds of thousands of emails a month.
- **BIMI** (brand logo in the inbox) is set in the sender's own DNS, works with any provider, and needs DMARC at enforcement. Logo certificate requirements were not checked.

## Comparison

| Provider | Marketing allowed | Separate transactional and marketing | Unsubscribe and preferences | Dedicated IP | About 10k / 50k emails a month | Watch out for |
|---|---|---|---|---|---|---|
| Amazon SES | Yes, under the AWS Acceptable Use Policy; AWS can suspend senders for spam or complaints ([service terms §15](https://aws.amazon.com/service-terms/)) | Configuration sets and separate verified subdomains | Contact list with up to 20 topics, hosted preference page, automatic RFC 8058 headers when sent with list management ([subscription management](https://docs.aws.amazon.com/ses/latest/dg/sending-email-subscription-management.html)) | Standard $24.95 per IP a month; managed $15 a month plus usage | About $1 / $5 at $0.10 per 1,000 ([pricing](https://aws.amazon.com/ses/pricing/)) | One contact list per AWS account; no campaign editor; the app sends one recipient at a time |
| Postmark | Yes, through Broadcast streams; no purchased lists ([best practices](https://postmarkapp.com/guides/best-practices-for-broadcast-sending)) | Transactional and Broadcast streams on separate infrastructure ([streams](https://postmarkapp.com/support/article/1207-how-to-create-and-send-through-message-streams)) | Adds unsubscribe link and RFC 8058 headers on Broadcast streams by default | From $50 a month at 300k+ emails | About $15 / $66 to $87 depending on plan ([pricing](https://postmarkapp.com/pricing)) | API only; US data residency unverified |
| SendGrid (Twilio) | Yes, Marketing Campaigns is a separate product | Subusers on Email API Pro and above | Signup forms in Marketing Campaigns; unsubscribe groups not shown on the page read | Included from Email API Pro ($89.95) | Email API Essentials from $19.95; Marketing Basic from $15 ([email API](https://www.twilio.com/en-us/products/email-api/pricing), [marketing](https://www.twilio.com/en-us/products/marketing-campaigns/pricing)) | Free tier is a 60-day trial |
| Mailgun | Yes, mailing lists | Separate domains; IP pools on Scale | Mailing lists; one-click unsubscribe unverified | Page is inconsistent (from 50k or 100k); extra IPs $59 a month | About $15 / $35 ([pricing](https://www.mailgun.com/pricing/)) | Reputation tools are a separate paid product |
| Resend | Yes, Broadcasts with Audiences and Topics ([broadcasts](https://resend.com/docs/dashboard/broadcasts/introduction)) | Separate transactional and marketing plans | Unsubscribe placeholder and per-topic opt-out; RFC 8058 headers not stated | $30 a month add-on on Scale | Transactional free to 3k, $20 for 50k; marketing $40 for 5k contacts, $80 for 10k ([pricing](https://resend.com/pricing)) | Marketing priced by contacts |
| Brevo | Yes, marketing is its core product | Separate products | Standard preference tools (unverified) | About $251 a year (unverified) | About $17 to $35 for 10k (unverified; the official page did not render) | EU company; US data residency unverified |
| Mailchimp Transactional and Marketing | Marketing through Mailchimp campaigns only; bulk sends through Transactional are not allowed (unverified, from search results) | Two products | Full preference tools in Marketing | Transactional add-on $29.95 a month | Transactional $20 per 25k block and needs a paid Marketing plan ([transactional](https://mailchimp.com/pricing/transactional-email/), [marketing](https://mailchimp.com/pricing/marketing/)) | Two bills; likely the most expensive at this volume |

## Recommendation

1. **Keep SES and add marketing on SES** when it is needed: a marketing subdomain with its own DKIM, MAIL FROM, and DMARC; a marketing configuration set; one contact list with a topic per event series; sends through SES list management so the RFC 8058 headers and preference page come for free. Transactional sends stay outside list management so they cannot be unsubscribed. Consent lives in the CycleReg database and is synced to SES.
2. **Add a second provider only if organizers will write campaigns themselves** in an editor. Then Brevo or Mailchimp Marketing for the editor and preference center, with SES still sending transactional mail. If the need is a separate reputation stream sent from code, Postmark Broadcast is the simplest at about $15 a month.

## Compliance to design in before any marketing send

- CAN-SPAM: honest From and subject lines, the sender's physical postal address, and opt-outs honored within 10 business days. AWS states it is not the sender for CAN-SPAM purposes; decide whether CycleReg or each organizer is.
- Keep opt-in records: time, source, and the consent text shown. Unchecked boxes only; never import purchased lists or organizer lists without opt-in.
- No marketing to riders under 18 without a guardian's consent; COPPA applies under 13.
- product.md already requires marketing to need separate consent and an unsubscribe, and an operational message must not turn into a marketing campaign.
