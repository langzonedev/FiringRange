# Firing Range

A relaxed browser target gallery set under the lights at Dry Creek, built for Lang Systems Arcade.

**Play the handoff build:** [Firing Range on GitHub Pages](https://langzonedev.github.io/FiringRange/)

## Controls

- Mouse: point and click in the range.
- Touch: tap or drag on the range to aim, then use **Launch**.
- Keyboard: focus the range, use the arrow keys to aim and press Space to launch. Keys 1–6 select a launcher while the range is focused.
- Choose a launcher from the tray. Sound starts off. **Reset range** restores the targets and clears the current score. The best score is stored in the browser.

The six fictional launchers send coloured pulses with distinct patterns. Hit the centre of a steel plate for a 100-point bullseye. Flying discs, glass panes and pulse pods have their own scores and reactions. Glass, discs and pods return after a short pause. Hit all four target types to clear the gallery. Consecutive scoring launches build a streak, and a miss breaks it. There is no timer.

## Local preview

Run `python3 -m http.server 8000` from the repository root and open [localhost:8000](http://localhost:8000). The game uses Canvas 2D and Web Audio and needs no build step, assets or package installs.

## Human handoff

Try a bullseye, a moving disc, a glass pane, and a splash hit. Check the launcher tray and reset at phone and desktop sizes. Enable sound and check its level. Arcade listing is pending human playtesting.
