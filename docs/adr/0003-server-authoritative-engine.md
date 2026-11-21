# The server runs the authoritative engine

Each game has one engine instance on the server that owns its state. Phones and the Shared screen send Commands and display the state they receive. The engine is a pure package (`packages/engine`) shared by the server and the web app; devices may run it for previews or history, but the server's result always wins.

Commands already go to the server to be parsed (LLM keys can't live in the browser), so running the engine there adds little latency. Running the engine on every device against a shared log would let devices on different app versions disagree about the same game, which is worse than being wrong. Simultaneous Commands are Staged in the order the server receives them and can be reordered before Commit.
