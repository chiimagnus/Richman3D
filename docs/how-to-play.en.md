# How to play Richman 3D

[中文](how-to-play.md)

Choose **Start Game** in the main menu, enter the two names and match length, then choose **Start match**. The current game supports one local human against a normal computer. Blank names use translated defaults; custom names are trimmed, contain at most 16 visible characters, and do not change with the language. **More options** contains pawn colors.

**How to play** is available in the menu and during a match, with the same current rules as this guide.

## Independent practice tutorial

**Practice tutorial** is a real, separate fixed-seed match with five steps: find your cash, roll, inspect the landing, buy or skip, and watch the computer’s turn. Hints stay in the action area. The guaranteed purchasing decision uses the real rules, not a pretend click or scripted balance.

Use **Skip tutorial** at any step, including with Tab and Enter. Changing language or opening help preserves your step. Finishing returns to match setup; the normal match starts with a fresh seed and no practice property or money. Only completing all five steps stores the separate tutorial-completion marker. Practice never replaces the saved normal match or records a win. Use **Replay tutorial** to practice again. There is no permanent match history yet.

## Goal and match length

Both players begin at Start with ¥1,500. Quick matches last 20 full rounds by default; standard matches last 40. A round is one complete pass through the fixed seat order. The final player must finish the purchasing decision before the round counts.

Cash below zero currently means immediate bankruptcy. The last solvent player wins early. At the round limit, rank by **net assets = cash + owned property list prices**, then by cash. If both values are equal, players share the win: seat order is not a tiebreaker.

Buildings, mortgages, debt rescue, auctions, trades and held items are not implemented yet.

## One turn

1. Choose **Roll Dice**, or press Space.
2. Two dice determine the automatic movement by their total.
3. Resolve the landing space using the committed rules.
4. On an available property, choose **Buy** or **Skip**.
5. The computer then completes its turn.

Doubles do not grant another turn. You do not manually walk along the board, and there is no jail rule.

## Landing spaces

- **Available property:** buy at the displayed price if you have enough cash, or skip. Skipping does not start an auction in the current version.
- **Your own property:** no additional charge.
- **Opponent’s property:** automatically pay its displayed rent to the owner.
- **Start:** receive ¥200 whenever you pass it moving forward.
- **Chance:** immediately draw a random cash gain or expense.
- **Tax:** pay the displayed fee.

Purchased property has an ownership marker in the scene. The action area shows the current property’s price, rent and purchasing consequences.

## View and input

Desktop starts in your first-person view without automatically locking the mouse. **Board overview** shows the full board and both pawns; **Your first-person view** returns to your own position. Overview disables mouse-lock control and does not affect money or dice. Touch starts in overview. The current fixed overview has no drag, zoom or property picking.

Choose **Look around** to explicitly lock the mouse and move it to look around. Esc exits mouse lock first. There is no WASD free movement. All economic decisions have screen buttons and keyboard paths, so precise 3D pointing is unnecessary.

## Settings, pause and leaving

**Settings** controls sound, mouse sensitivity and language. Text, feedback and board labels switch between Chinese and English; custom names and game state remain unchanged. Settings persist in this browser when storage is available. Storage refusal does not prevent playing or changing preferences.

Choose **Done** or press Esc to close Settings and restore focus to its trigger. Settings and help pause the match. Mouse lock is not reacquired automatically. If sound is refused, play remains available; switch sound off and back on during the match to retry. Muting stops current notes immediately. The menu does not create a scene or audio context until a match starts, and the application reuses one audio context across matches.

**Pause** offers Resume, Play Again and Main Menu. Going to the background also pauses; Resume shows the already committed result without rerolling or paying twice.

## Local saving and continuation

A normal match saves its initial state and every accepted action before presentation. **Main Menu** waits for saving; **Continue saved match** restores the last successfully saved positions, cash, ownership, decision and random state after leaving or refreshing. It does not repeat payments or Start rewards. A pending computer turn begins only after your explicit Continue action. Ended matches offer **View saved results**, not another turn.

Only the current match and its previous valid snapshot are stored. Starting or restarting replaces the current match. Saving failure offers **Retry saving** or **Continue without saving**, with a persistent unsaved indicator. Retrying does not execute the action again. If another page changed the save, this page pauses; explicitly load the latest match or discard this page’s unsaved progress instead of silently overwriting it. Damaged or unsupported saves are preserved, not automatically erased.

Storage is local to this browser profile and site, not a cloud backup. Browser cleanup, private mode or device failure may lose it. File import/export and manual backup recovery are not available yet.

## Keyboard

| Action | Key |
| --- | --- |
| Roll | Space |
| Buy the current property | B |
| Skip the current property | N |
| Toggle sound | M |
| Exit mouse look or the current panel first | Esc |
| Open Pause when not locked and no panel is open | Esc |

Shortcuts only apply to available actions and do not act through inputs, native controls or help. Tab and Enter can operate buttons, including skipping practice.

## Reading the interface

- **Upper left:** both names, cash and the round.
- **Upper right:** settings, help, pause and view controls.
- **Bottom:** the acting player’s space, latest dice and the current action. Practice hints also stay here.
- **Temporary feedback:** dice and the landing cause, without duplicate purchase confirmations.

At landing, show the committed balance and its cause before allowing the computer to proceed. Controls stay unavailable until the action’s presentation settles. **Skip animation** shows the committed result without applying it again.

## Results and replay

The first result screen explains the winner or tied winners, the ending reason, your rank and net-asset rankings. **Financial details and replay** expands cash, property book value, Start rewards, rent received/paid, fees, chance gains/expenses and purchase costs. Domain transactions own those totals: animation, language changes and rerendering do not accumulate them again.

**Play Again** keeps names, colors and match length with a new seed, without refreshing the page. **Replay original seed** is a secondary option in the details; different choices may change the result. **Main Menu** stops the session and releases the scene and its notes. Results are not presented as permanently saved wins.
