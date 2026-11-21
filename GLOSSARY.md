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
Speaking a Command while holding the button on your Phone. Only speech captured this way is ever treated as a Command; everything else is table talk.
_Avoid_: push-to-talk, tap to speak, wake word

**Guest**:
A player in a game who has no account, joined with only a name and optionally a deck list pasted for that game.

## Game flow

**Command**:
One thing a player tells the app, captured by one Hold-to-talk. It may contain several actions ("I drop a Plains, cast Hinterland and attack Andrea").
_Avoid_: utterance, input, request

**Staged**:
The state of everything said during the current phase before it is Committed. Staged items are visible to everyone and can be edited, removed or reordered.
_Avoid_: pending, queued, draft

**Commit**:
Moving to the next phase, which makes everything Staged in the current phase part of the game.
_Avoid_: confirm, resolve, apply

**Ready**:
The state of a defending player who has answered an attack, by blocking or by taking the damage. Combat damage is previewed once every defender is Ready.
_Avoid_: resolved, done

**Sealed turn**:
A turn that has ended and can no longer be Undone. Its history stays readable, but its board can only be Edited.

**Undo**:
Taking back Commands within the current turn, restoring the game to an earlier moment of that turn.
_Avoid_: rewind, revert

**Edit**:
Correcting the app's copy of the board to match the physical table ("Heliod has two counters"). Always available, including after a turn is Sealed.
_Avoid_: override, fix, correction

## What the app tells players

**Warning**:
A flag raised before something is Committed because it looks illegal ("Hinterland has summoning sickness"), with a choice to do it anyway.
_Avoid_: error, block

**Question**:
Something the app needs a specific player to answer before it can finish its bookkeeping ("Which zombie?", "Did Theo pay 2?").
_Avoid_: prompt, clarification

**Task**:
A physical action a specific player still needs to do at the table because of a trigger ("exile the top 20 cards of your library"). Tasks never block play.
_Avoid_: reminder, todo, prompt

**Banner**:
A notice that an ongoing effect is in play and may matter this turn ("Each opponent pays 2 or…").
_Avoid_: notification, alert

## Cards

**Deck**:
A player's registered list of cards, imported from Archidekt. It may be incomplete; cards not on it can still come up in a game.
_Avoid_: decklist, list

**Translation**:
The app's understanding of what a card's triggered and static abilities do, derived once per card from its Oracle text and shared by every game.
_Avoid_: template, parse, tagging

**Unmodeled**:
A card, or part of a card, whose effect the app cannot express. It becomes a Task asking players to check the card, never a guess.
_Avoid_: unsupported, unknown

**Rules assistant**:
The part of the app that answers rules questions about the current board, citing the rules. It never changes the game and never suggests plays.
_Avoid_: judge, help bot
