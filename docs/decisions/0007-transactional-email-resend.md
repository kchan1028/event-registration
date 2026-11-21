# 0007. Resend for transactional email

Status: Accepted, November 19, 2026. Supersedes [ADR 0006](0006-transactional-email-amazon-ses.md).

CycleReg uses Resend for application-generated transactional email. Organizer invitations are the first message type. Clerk continues to send sign-in emails.

Local mode records invitations without sending. The beta can opt in to Resend with a server-side sending key, a sender address, and an explicit list of test recipients. Production mode refuses external sends. The server uses the [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email). It records API acceptance and the message ID, a confirmed refusal, or an uncertain result when the response is lost. An uncertain invitation send is retried with the same idempotency key for 24 hours and does not renew the invitation. One attempt has one in-flight provider call. A definite refusal is recorded only for the first send of that attempt, and a lost response leaves that fact in place. The invitation stores that attempt, so a later seed at the same time does not reuse a canceled send. Delivery, bounce and complaint webhooks and suppression handling are planned. Marketing stays out of scope.

See [local setup](../runbooks/local-setup.md#email-in-test-mode-optional) for the rehearsal procedure.
