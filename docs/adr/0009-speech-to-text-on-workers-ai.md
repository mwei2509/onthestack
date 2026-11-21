# Speech-to-text on Workers AI, with card names matched against Decks

Hold-to-talk clips are transcribed on Cloudflare Workers AI, starting with `whisper-large-v3-turbo`, which is effectively free at our volume and retains no data. Its `initial_prompt` is seeded with the cards on the battlefield and the speaker's key cards to nudge spelling. If card-name accuracy falls short, we switch to Deepgram Nova-3 on Workers AI, which supports real keyterm biasing, without leaving Cloudflare. Transcription sits behind a replaceable interface.

Whatever the provider, card names in the transcript are fuzzy-matched in our code against the Decks in the game ("you la mog" to Ulamog). Recognising card names is the biggest risk in the product, and this second layer doesn't depend on any one provider's biasing.

## Consequences

Choosing and regression-testing the provider needs real audio, so we keep an opt-in test set: friends knowingly recording commands, plus game-night background noise, stored outside the public repo. This is the one exception to "never store raw audio", which still holds for all gameplay.

## Considered options

- **Browser speech recognition:** free, but no vocabulary biasing on Android Chrome, and audio leaves for Google.
- **Deepgram direct:** strongest biasing and a large free credit, but a second provider; Nova-3 on Workers AI gives the same model inside Cloudflare.
