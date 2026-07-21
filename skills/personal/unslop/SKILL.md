---
name: unslop
description: >
  Remove AI tells from prose and restore human voice, preserving meaning and
  intended tone. Use when the user says "unslop", asks to make text sound less
  AI-generated or more human, or before delivering user-facing prose (docs,
  READMEs, posts, emails, PR descriptions).
user_invocable: true
---

# unslop — cut AI tells, restore voice

A **tell** is any pattern that outs text as machine-written. Unslopping means
removing every tell while keeping the meaning and the author's intended tone.
Sterile-but-clean prose is itself a tell, so the job has two halves: cut tells,
then add voice.

## Process

1. **Scan.** Check the text against every category in the tell catalog below.
   Done when each category has been checked against the whole text.
2. **Rewrite.** Apply the fix for each hit. Meaning survives; tone matches what
   the author intended, not a house style.
3. **Add voice.** Apply the voice moves below where the text is flat.
4. **Self-audit.** Reread the result cold and ask: "what would out this as AI?"
   Fix what surfaces. Done when a cold read surfaces zero tells and the text
   says everything the original said.

## Voice

- **Have opinions.** React to facts instead of neutrally listing pros and cons.
- **Vary rhythm.** Short sentences. Then longer ones that take their time.
- **Acknowledge complexity.** "Impressive but also kind of unsettling" beats
  "impressive."
- **Use "I" when it fits.** First person isn't unprofessional.
- **Let some mess in.** Perfect structure feels algorithmic.
- **Be specific.** Not "this is concerning" but "there's something unsettling
  about agents churning away at 3am."

## Tell catalog

Each entry is a tell → its fix.

### Content

- **Significance inflation** — "pivotal moment", "testament to", "evolving
  landscape", "indelible mark" → cut the puffery, state what happened.
- **Superficial -ing trailers** — "highlighting...", "ensuring...",
  "showcasing...", "fostering..." → delete, or expand with a real source.
- **Promotional language** — "nestled", "vibrant", "breathtaking",
  "renowned", "must-visit" → neutral description.
- **Vague attributions** — "experts believe", "reports suggest" → name the
  source or delete.
- **Formulaic arcs** — "Despite challenges... continues to thrive" → specific
  facts.

### Language

- **AI vocabulary** — delve, crucial, enhance, garner, interplay, intricate,
  pivotal, showcase, tapestry, testament, underscore, additionally → plain
  words.
- **Copula avoidance** — "serves as", "stands as", "boasts", "features" →
  "is" or "has".
- **Negative parallelism** — "It's not just X, it's Y" → state the point
  directly.
- **Rule of three** — ideas forced into triads → the natural number.
- **Synonym cycling** — protagonist / main character / central figure in one
  paragraph → pick one word and repeat it.
- **False ranges** — "from X to Y" where X and Y aren't on a scale → list the
  items directly.
- **Abstract metaphor nouns** — substrate, wedge, vector, nexus, paradigm,
  scaffolding, "API surface" → the concrete word: "substrate" is "base",
  "wedge in" is "add".

### Style

- **Em dashes** — avoid entirely; don't trade them for parentheses or en
  dashes. End the sentence or use a comma.
- **Colon connectors** — colons before a list are fine; as mid-sentence glue
  they add nothing. Rewrite so the point stands alone.
- **Inline-header lists** — "**Performance:** Performance improved..." →
  prose. (A bold lead-in followed by genuinely new detail is fine.)
- **Boldface overuse** — don't bold every proper noun or acronym.
- **Title case headings** → sentence case.
- **Decorative emojis** — remove from headings and bullets.
- **Curly quotes** → straight quotes.

### Filler and hedging

- **Filler phrases** — "in order to" → "to"; "due to the fact that" →
  "because"; "it is important to note that" → delete.
- **Stacked hedges** — "could potentially possibly be argued" → "may".
- **Fancy synonyms** — "utilize" → "use", "leverage" → "use", "facilitate" →
  "help", "numerous" → "many".
- **Adverbs propping weak verbs** — "runs quickly" → "is fast" or the number;
  "significantly improves" → the measured delta.
- **Generic conclusions** — "the future looks bright" → specific plans or
  facts, or nothing.

### Communication artifacts

- **Chatbot phrases** — "I hope this helps!", "Let me know if...",
  "Certainly!" → remove.
- **Sycophancy** — "Great question! You're absolutely right!" → respond
  directly.
- **Cutoff disclaimers** — "while specific details are limited..." → find the
  source or remove.

### Plain speech

- **Name the mechanism, not the feeling.** "SQL you can read" names a
  feeling; "`.toSQL()` returns the exact string sent to the database" names a
  mechanism. If a sentence can't be restated as a concrete instruction, fact,
  or number, cut it.
- **One idea per sentence.** If the reader has to backtrack, split it or drop
  clauses.
- **Active voice.** "Queries are validated" → "the compiler validates
  queries". Passive only when the actor is unknown or truly irrelevant.
