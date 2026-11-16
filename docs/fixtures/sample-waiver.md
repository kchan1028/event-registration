# Sample waiver (demo only)

**SAMPLE TEXT FOR THE CLICKABLE DEMO. NOT A REAL WAIVER.**  
Version: DEMO-WAIVER v1 (2026-11-14)

This text is a placeholder for usability testing. It is not the USA Cycling waiver, it has not been reviewed by a lawyer, and a signature on it has no legal effect for any event. A sanctioned event must use the waiver its governing body requires, unmodified. See [product.md](../../product.md#future-usa-cycling-waiver-and-license-integration).

---

## Participant agreement (sample)

1. **Risk.** I understand bicycle racing can cause injury, and I choose to take part in this demo event.
2. **Fitness and equipment.** I am fit to race, my bicycle is in safe working order, and I will wear an approved helmet at all times on the course.
3. **Rules.** I will follow the officials' instructions and the event rules.
4. **Medical care.** If I am hurt and cannot respond, I agree that event staff may arrange emergency medical care.
5. **Photos.** I understand I may appear in event photos.

**Minors:** a parent or guardian must sign for a rider under 18.

---

## How the demo uses this text

- Shows the version above the text and records it with the signature.
- Enables signing only after the rider scrolls to the end or confirms reading.
- Signing takes a typed full name matching the rider (or guardian, for a minor) and a confirmation checkbox. Validation messages live in `src/shared/checkout.ts`.
- Labels the confirmation status as "Sample waiver signed (demo)", never as a valid event waiver.
