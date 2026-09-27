# Yacht Dice — PC Tray Layout

Desktop and iPad Yacht Dice layout.

## Layout
- Left: scorecard
- Center: 3D dice tray
- Below the tray: five HOLD slots and the ROLL button
- Right: character stage
- iPad landscape uses a compact three-column layout; portrait stacks the dice, scorecard, and character

## Dice
- Dice travel along varied paths and spin on three axes before landing.
- Held dice move to the slots and are excluded from rerolls.

## Scoring
- The scorecard updates from the five current dice.
- Thirteen categories are available; a category may be taken for zero points.
- Upper section: 35 bonus points at 63 or more.
- Additional Yacht: 100 bonus points.

## Online
Online 1v1 rooms work when Firebase is configured.

## Latest fixes
- Score card is now split into UPPER SECTION and LOWER SECTION.
- Removed the landing-position snap that caused dice to twitch after a roll.
- Dice are now pinned to their final tray coordinates before the throw animation class is removed.


## Firebase setup inserted
This build already includes your Firebase Web App values.

### Still required in Firebase Console
1. Authentication → Sign-in method → **Anonymous** → Enable
2. Realtime Database → **Create database**
3. Start in **test mode** for quick testing, or use rules like:

{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}

### Current databaseURL
This package uses:
https://yacht-5dab4-default-rtdb.firebaseio.com

If your Realtime Database page shows a different URL, replace only the
`databaseURL` value in `firebase-config.js` with the exact one shown there.


## Online join fix
- Fixed a Firebase Realtime Database transaction issue where joining could falsely
  report "Room not found" even while the host was waiting.
- Joining now validates the room first, atomically reserves Player 2, then switches
  the room to playing.


## Online score UI
- Online mode now shows only your full scorecard.
- The opponent is shown as a compact score summary only.
- Online score panel no longer scrolls; the scorecard is compacted to fit the desktop game view.
- Solo mode keeps the normal full scorecard.


## YACHT DICE dark retheme
- Game brand updated to `YACHT DICE`
- Applied the new blood-red logo image
- Rethemed the UI to a darker metal / crimson accent style
- Improved logo placement in the menu and top header
- Refined character stage so the character feels naturally framed within the UI
- Preserved online room, score, HOLD, and dice functionality

## Character reactions
The default stance remains on screen while dice roll. Good combinations trigger a happy pose and body movement; Yacht triggers a dramatic shocked pose. Other outcomes return to the neutral stance. The game interface is in English, with Japanese reaction lines.

## Recorded voice lines
Six supplied Japanese MP3 clips play for Yacht and the five positive categories. Browser speech synthesis is disabled. The line starts after the dice settle; neutral results remain silent. The supplied dice rolling sound effect plays as the dice move.

## Dice sound
The supplied 1.39-second dice roll and landing effect plays when at least one die is rolled. Reaction voice clips start after the dice settle.

## Solo best score
The solo best score is saved in this browser's local storage after all thirteen
categories are scored. It includes the upper-section and Yacht bonuses. The menu
shows the saved best score and the result screen marks a new record. This record
is specific to the browser and site address; clearing browser data removes it.

## Root GitHub Pages address
This ZIP has `index.html` and all assets at its root. For an address of the form
`https://USERNAME.github.io/`, publish these files at the root of a GitHub
repository named `USERNAME.github.io` under the GitHub account `USERNAME`.
A normal project repository instead produces `https://USERNAME.github.io/REPOSITORY/`.
The ZIP cannot choose or reserve a GitHub account name or change an existing
website address. Solo records are stored per browser and site address.
