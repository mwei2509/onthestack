# Four domains, and how interpretation handles a burst of statements

Status: Accepted (decided with Melissa, 2026-11-21).

The system splits into four domains with one-way dependencies:

- **Capture** (web app and server): Hold-to-talk, audio, transcription, producing PlayerStatements.
- **Interpretation** (`packages/interpreter`): the TurnTranscript, prompt building, the InterpretedTimeline schema, TimelineCorrections and PlayerQuestions, and the interpreter evals. Its pure parts are testable with recorded LLM responses.
- **Rules** (`packages/engine`): game state, GameActions, GameEvents, the Stack, Steps, state-based actions and the TableView. Pure; it never knows speech or an LLM exist.
- **Table** (`packages/server`, the game's Durable Object): seats, turns and sealing, the interpretation queue, and sending updates to every screen.

People talk in bursts and an interpretation takes about a second, so PlayerStatements arrive while a request is in flight. The Table handles that with five rules:

1. PlayerStatements are ordered by when the button was pressed, not when transcription finished.
2. At most one interpretation request is in flight. Statements arriving meanwhile mark the TurnTranscript as changed; when the response returns, one more request is sent with everything so far.
3. Each response records the TurnTranscript version it read; a response older than the one already applied is dropped.
4. A PlayerStatement appears on screen as soon as it is transcribed, marked as being interpreted.
5. After a button release the Table waits about 300 ms before sending, in case someone else is mid-sentence. The value is tuned at real game nights.
