# External requirements

Use this file to send and track the questions the project cannot answer on its own: USA Cycling (USAC), payment providers, and the results path to road-results.com. Each needs a named owner before Phase 0 can exit.

Nothing here has been sent. The messages below are drafts for the owner to adapt and send from their own account. Do not claim any integration or approval exists until the answer is recorded here with a date.

## Status

| Question area | Owner | Sent | Answer received | Outcome |
|---|---|---|---|---|
| USAC integration and accepted license and waiver processes | Not assigned | No | No | |
| Payment-provider operating model | Not assigned | No | No | |
| Results path to road-results.com | Not assigned | No | No | See the [timer export review](../timer-export-review.md) |

## USA Cycling

Goal: learn whether a registration platform can be accepted for sanctioned events, and what process applies until any integration exists. Background: [future USAC integration](../../product.md#future-usa-cycling-waiver-and-license-integration) in product.md.

### Questions

1. What does USAC require of a registration platform used for sanctioned road races and criteriums?
2. Is there a partner or API program that lets a registration platform validate a rider's license (number, name, type, status, expiry, racing category) for a race date? How does a platform apply, and what does it cost?
3. Can a platform retrieve whether a rider, and a guardian for a minor, has a valid USAC waiver for the event or season? If not, which waiver process does USAC accept from a third-party platform?
4. Until any integration exists, is organizer manual review of licenses at registration and check-in acceptable? Is a USAC-supplied license list file an option?
5. How are one-day licenses sold and recorded when a rider registers through a third-party platform?
6. What rider and entry data must the organizer report to USAC after the event, in what format, and by when?
7. Are there data-handling requirements (retention, minors' data, sharing) a platform must meet?
8. Who at USAC should the club work with for these questions?

### Draft message

> Subject: Registration platform questions for a sanctioned road race and criterium weekend
>
> Hello,
>
> Our club runs a sanctioned two-day road race and criterium weekend. We are evaluating whether to keep our current registration provider or use a different platform, and we want to understand USA Cycling's requirements before deciding.
>
> Could you tell us, or point us to the right person for:
>
> [questions 1 to 7 above]
>
> We are not running any event on a new platform and will not do so without USA Cycling's acceptance of the license and waiver process.
>
> Thank you,
> [name, club, role]

### Answers

Record each answer with the date, who replied, and whether it is written or verbal.

| Question | Answer | Date | Source |
|---|---|---|---|
| | | | |

## Payment-provider operating models

Goal: choose an operating model to test in Phase 2, not a provider. Background: the [payment decision](../decisions/README.md) in the decision backlog. Cards are never stored by this project; payment uses a provider's hosted flow.

### Models to assess

| Model | Who is the merchant | Who handles disputes and refunds | Club onboarding | Questions for providers |
|---|---|---|---|---|
| Club as merchant, platform connected | The club | The club, through the provider | Each club creates its own provider account | Onboarding effort for a volunteer treasurer; payout timing; platform fee collection |
| Platform as merchant, payouts to clubs | The platform operator | The platform operator | Club gives payout details only | Legal and tax obligations for the operator; dispute liability; payout schedules |
| Club keeps its current processor | The club | The club | None | Whether the processor supports hosted checkout, notifications, and refunds through an API |

### Questions for the treasurer

1. Which model would the club accept, and who must approve it?
2. What payout timing does the club need before race weekend?
3. Who handles disputes today, and who would under each model?
4. What tax or reporting obligations change under each model?

### Questions for each provider

1. Do you support connected accounts for small volunteer clubs? What does onboarding require?
2. What are the processing and platform fees? (Record the date and source of every figure.)
3. How are refunds, partial refunds, and disputes handled for connected accounts?
4. What is the payout schedule?
5. Do you provide a hosted checkout and signed payment notifications?
6. Is there a test mode with test cards?

### Findings

| Provider or model | Finding | Date | Source |
|---|---|---|---|
| | | | |

## Results path to road-results.com

The questions and a sample start list are in the [timer export review packet](../timer-export-review.md); send it to the timer and record answers there. Also ask one recent promoter of a comparable event who uploads results and from what file. Background: [results site updates](../../product.md#results-site-updates-research) in product.md.

| Event | Who uploads | File used | Columns that matter | Date asked | Source |
|---|---|---|---|---|---|
| | | | | | |
