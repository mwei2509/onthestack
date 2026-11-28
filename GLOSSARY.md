# On The Stack

A table companion for in-person casual Commander games. Players speak what they do at the physical table, and the app keeps a correctable copy of the game: life, commander damage, combat, triggers and the stack.

## Table and devices

**Phone**:
A player's own device in a game. It shows only that player's life, counters, commander damage, Questions and Tasks, and it is the player's microphone.
_Avoid_: client, controller, remote

**Shared screen**:
An optional device in the middle of the table that shows the whole game state, the staging queue and current Banners for everyone.
_Avoid_: center board, main app, host

**Hold-to-talk**:
Speaking while holding the button on your Phone. Only speech captured this way becomes a PlayerStatement; everything else is table talk.
_Avoid_: push-to-talk, tap to speak, wake word

**Account**:
Optional. A player's sign-in to the app, with a passkey: a display name, a private email, the games they've played and the Decks they own. Signed in, their seat follows them to any device.
_Avoid_: user, profile, login

**Guest**:
A player in a game who isn't signed in, joined with only a name and a Deck from the shared library (or one imported while joining).

**Lobby**:
A game before it starts, where each device joins with a name and a Deck from the library, adding a Seat. Seats are put in the order people sit, and Start asks who goes first.
_Avoid_: waiting room, setup

**Seat**:
A player's place in a game: their name, their Deck, and at most one connected device. The order of Seats is the clockwise order around the table.
_Avoid_: slot, player slot

**Game code**:
The readable code that names a game and its link, such as KITE-MOSS-42. Anyone with it can join.
_Avoid_: room ID, game ID, invite code

**Join code**:
A six-digit code, such as 482 913, typed into Join game to reach a game without its link. It sits beside the Game code and is retired when the game ends or goes idle, then reused.
_Avoid_: PIN, room number

## What players say

**PlayerStatement**:
What one player said in one Hold-to-talk, transcribed. It may describe several things ("I drop a Plains, cast Hinterland Sanctifier and attack Melissa"), or none ("nevermind").
_Avoid_: command, utterance, input

**TurnTranscript**:
Every PlayerStatement of the current turn, in the order the buttons were pressed.
_Avoid_: conversation, chat log

**InterpretedTimeline**:
The app's current reading of the TurnTranscript: an ordered account of what happened this turn, each part placed in its Step, plus any PlayerQuestions about what it couldn't settle. It is redone after every new PlayerStatement, so later statements and take-backs can change it.
_Avoid_: interpretation, parse

**TimelineCorrection**:
A fix a player makes by hand to the InterpretedTimeline, by tapping an item to change or remove it, or by skipping a trigger the app found ("Not right" on a Readback note). Every later reading must respect it, unless that player takes it back by saying so.
_Avoid_: pin, override

## How the game moves

**Step**:
One of the rules' fixed moments within a turn (upkeep, declare attackers, first-strike damage, end step, …). The app always knows which Step the game is in and shows it; players move it on with Next step, and Next step on cleanup ends the turn.
_Avoid_: stage, part

**GameAction**:
One literal thing done to the board: cast, play a land, move a card between zones, tap, change control, counters, life, damage, attack, block. Everything players say and everything cards do is expressed as GameActions.
_Avoid_: action, command, move

**GameEvent**:
Something that happened in the game, by the rules, as a result of a GameAction, the rules or a resolving spell or ability ("Serra Angel died", "Theo gained 1 life"). Triggered abilities listen for GameEvents, and each GameEvent remembers what caused it.
_Avoid_: event, outcome, bookkeeping event

**TableEvent**:
The app's own record of something at the table that isn't part of the game: a PlayerTask given or done, a PlayerQuestion asked or answered, a RulesWarning raised or done anyway, a correction said. It shares the history and its causes with GameEvents, but never changes the board and no trigger sees it.
_Avoid_: log entry, notification

**Stack**:
The spells and triggered or activated abilities waiting to resolve, last in, first out. Casting something puts it on the Stack; it takes effect when it resolves.
_Avoid_: queue, pile

**Stack item**:
One entry on the Stack: which spell or ability it is, who controls it, what triggered it, and the GameActions it will perform, with "you", "that creature" and targets already filled in.
_Avoid_: stack entry, pending effect

**Response**:
A spell or ability said while something it answers is still on the Stack, or anchored to an earlier moment ("in response to that", "after first strike"). It resolves first.
_Avoid_: reaction, interrupt

**Fizzle**:
What happens to a spell or ability whose targets are all gone when it would resolve: it does nothing and is marked as fizzled.
_Avoid_: skipped, cancelled

**Ready**:
The state of a defending player who has answered an attack, by blocking or by taking the damage. Combat damage is previewed once every defender is Ready.
_Avoid_: resolved, done

**Staged**:
The state of everything in the current turn's InterpretedTimeline before the turn is Sealed. Visible to everyone, and changed by saying so or with a TimelineCorrection.
_Avoid_: pending, queued, draft

**Sealed turn**:
A turn that has ended: the next player has started theirs. Its PlayerStatements, InterpretedTimeline and GameEvents stay readable, but its board can only be changed with a BoardCorrection.
_Avoid_: committed turn, closed turn

**Ended game**:
A game someone at the table has ended (ADR 0092). Its current turn is Sealed as of the current Step and the game is read-only for good: no statements, taps, Step moves or BoardCorrections (ADR 0100, 0101).
_Avoid_: finished game, closed game, archived game

**Take-back**:
Undoing something within the current turn, by saying so ("oops, I meant…") or with a TimelineCorrection.
_Avoid_: undo, rewind, revert

**BoardCorrection**:
Correcting the app's copy of the board to match the physical table ("Heliod has two counters"). Always available, including after a turn is Sealed, until the game is an Ended game.
_Avoid_: edit, override, fix

## What the app shows

**TableView**:
What every screen shows: the board, the current Step, the Stack, the InterpretedTimeline, and any RulesWarnings, PlayerQuestions, PlayerTasks and combat preview.
_Avoid_: view, screen state

**RulesWarning**:
A flag on something that looks illegal ("Hinterland Sanctifier has summoning sickness"), shown on the timeline entry that raised it, with a choice to do it anyway that any player can make (ADR 0122, 0123). It never blocks play.
_Avoid_: warning, error, block

**PlayerQuestion**:
Something the app needs a specific player to answer before it can finish its bookkeeping ("Which creature?", "Did Theo pay 2?", "Did you say Serra Angel or Savannah Lions?"). The engine asks when it can't fill a blank; the interpreter asks instead of guessing at what was said. Each has a typed kind, and that player's next Hold-to-talk answers it.
_Avoid_: question, prompt, clarification

**PlayerTask**:
A physical action a specific player still needs to do at the table, usually because a card touches their library or hand ("reveal the top card of your library"). It shows on that player's phone until they mark it done (ADR 0125). PlayerTasks never block play.
_Avoid_: task, reminder, todo

**Banner**:
A notice that an ongoing effect is in play and may matter this turn ("Each opponent pays 2 or…").
_Avoid_: notification, alert

**Readback note**:
A short note saying what the app just applied on its own: combat damage, a resolved spell or ability, or a trigger, with what followed from it ("Blood Artist (Priya): Ana loses 1 life, Priya gains 1"). One per cause, built by the engine from GameEvents. It never waits for confirmation, and "Not right" takes that change back.
_Avoid_: toast, notification, confirmation

**Seat detail**:
What the app thinks one player's state is and why: every change to their life and commander damage with its cause and turn, and a picture of their battlefield where corrections are made.
_Avoid_: player screen, profile

## Cards

**Deck**:
A list of cards, imported from an Archidekt link or a pasted list, that exists on its own, independent of any player or account, so it can be shared and reused. A Deck imported by someone signed in belongs to them and is public (in the shared library) or private (only theirs); Decks with no owner are open to everyone. Each player picks one when joining a game, and the game keeps the Deck version it was at Start. It may be incomplete; cards not on it can still come up in a game.
_Avoid_: decklist, list

**Deck version**:
A Deck's cards as they were at one moment. Re-importing a Deck, fixing a line so it joins the cards, or changing its commander makes a new version; renaming it or skipping a line doesn't. A game refers to the version each seat brought, so later edits never change it (ADR 0119).
_Avoid_: snapshot, revision

**Unmatched line**:
A line of an imported Deck list that couldn't be read, or names a card or printing the card store can't find. It stays on the Deck, to be fixed or skipped on the Deck's page, and is never guessed at.
_Avoid_: error, invalid card, missing card

**Card store**:
The app's own copy of every card players have imported, with each printing's image, fetched from Scryfall when a Deck containing it is imported, so a game never waits on Scryfall.
_Avoid_: card database, cache, Scryfall

**Printing**:
One edition of a card, with its own art, set and collector number. A Deck can name the printings its owner plays, and the app shows that printing's image; rules and Translations belong to the card, not the printing.
_Avoid_: version, edition, print

**Translation**:
The app's understanding of what a card's triggered and static abilities do, derived once per card from its Oracle text and shared by every game.
_Avoid_: template, parse, tagging

**Ability definition**:
One ability of a card, as part of its Translation: for a triggered ability, the GameEvent it waits for (and any condition), and the GameActions it performs; for a static ability, what it changes while the card is in play.
_Avoid_: template, rule, script

**Oracle reminder**:
The part of an Ability definition the engine doesn't apply itself, kept as the Oracle sentence it stands for. It shows when the ability resolves, or, for an always-on static, when a GameEvent it applies to happens; the interpreter fills in what players say happened (ADR 0131, 0139). Unlike a PlayerTask, nobody has to mark it done.
_Avoid_: reminder text, note

**Unmodeled**:
A card, or part of a card, whose effect the app cannot express. It becomes a PlayerTask asking players to check the card, never a guess.
_Avoid_: unsupported, unknown

**Rules assistant**:
The part of the app that answers rules questions about the current board, citing the rules. It never changes the game and never suggests plays.
_Avoid_: judge, help bot
