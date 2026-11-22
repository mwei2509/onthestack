# Card Translations drafted by an LLM, checked against XMage

Status: Accepted (decided with Melissa, 2026-11-21, in the design session on the XMage research). Amends ADR 0005.

An LLM still drafts each card's Translation from its Oracle text (ADR 0005). Each draft is then checked automatically against a one-off, development-time dump of XMage's card definitions (MIT): XMage is run once and each card's abilities are read by reflection, giving a structural fingerprint (which triggers, effects and targets it has). Drafts that disagree with the fingerprint go to a person for review; drafts that agree are accepted. ADR 0005 rejected XMage as the *source* of Translations because its cards are Java code; as a *checker* that objection doesn't apply. 86% of the top 200 Commander cards in XMage are built purely from its reusable classes.

## Consequences

- XMage's MIT licence notice goes in a third-party notices file; nothing from XMage ships in the app.
- Cost to check before adding a paid key: drafting about 3,000 cards is roughly 6M tokens one-off, which may fit free tiers if spread over several days (ADR 0010).
