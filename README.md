# ONE MORE BEAT

**Survive the rhythm. Miss one beat and the run is over.**

ONE MORE BEAT is a one-finger, beat-synchronised survival game in the ONE MORE series. The world, hazards, feedback and procedural soundtrack intensify as the player's run gets longer.

## Core loop

- **Tap** to switch between the two pulse lanes.
- **Hold** to charge through full-track walls.
- **Wait** when the track is clear.
- Actions are judged against the beat window.
- Every successful beat increases the score and accelerates the tempo.
- At intervals the player can **hold to enter DOUBLE OR NOTHING**, earning ×2 beats while hazard density and tempo jump.
- Miss a required action and the run ends immediately. Tap **ONE MORE?** for an instant restart.

## Progression

- 10 beats — chain milestone
- 25 beats — bass layer enters
- 50 beats — percussion expands
- 100 beats — OVERDRIVE and synth layer
- 250 beats — REDLINE
- 500 beats — MACHINE HEART territory

The soundtrack is generated at runtime with the Web Audio API, so the project contains no licensed music or audio assets.

## Android APK

Every push to `main` runs the **Build Android APK** GitHub Action. It packages the game with Capacitor, verifies the APK, uploads it as a workflow artifact, and publishes/updates the `android-latest` GitHub Release.

After the workflow is green, download **one-more-beat-debug.apk** from the latest release and install it on Android.

## Web version

The game is also a self-contained progressive web app. Serve the repository with any static web server. It supports touch, mouse/pointer input, and the Space key.

## Technical notes

- HTML5 Canvas renderer
- Procedural Web Audio music and SFX
- localStorage high score
- Offline service worker cache
- Responsive portrait layout
- Capacitor Android packaging
- No backend and no paid services required
