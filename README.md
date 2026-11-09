# Cinderpine Express: One More Ride 🎢🍂

A single-file, self-contained 3D pixel-art autumn fairground adventure & roller coaster simulator built with **Three.js r128** and procedural **WebAudio**.

> *“Can we enjoy a place as it is now, even when we miss what it used to be?”*

## Chapter One Overview
On the final evening of Cinderpine Park's autumn season, three longtime companions—**Maya**, **Noah**, and **Alex**—reunite to ride **Old Pinewood** together just like they did ten years ago.
- **Playable Character Selection**: Choose Maya, Noah, or Alex at the opening screen. Each has a custom pixel-art portrait, personal keepsake, starting point, and perspective. The other two appear in the park as interactive companions.
- **3D Park Exploration**: Walk through the autumn midway, plaza fountain, Cinder Hearth Café, and switchback queue (`WASD` / Arrow keys on desktop, or the virtual touch joystick on mobile) with obstacle collision and proximity interaction prompts (`E` / `Enter` / Tap).
- **Interactive Coaster Ride & Meaningful Choice**: Board the 5-car train on **Old Pinewood**, look around from the front seat (`1–4` camera views + drag-to-look), make a relationship choice on the diagonal chain lift, and experience a perspective-aware post-ride conversation and next-destination vote that transitions into night fireworks and free-roam mode.
- **Local Save**: Automatically saves your selected character, keepsake, choices, and chapter progress to `localStorage`.

## Controls
### Desktop
- **Move**: `W A S D` or `Arrow Keys`
- **Interact / Advance Dialogue**: `E`, `Enter`, or click the floating prompt
- **Close Dialogue**: `Esc` or click `Close`
- **Cameras**: `1` (Park Isometric), `2` (Follow), `3` (Chase), `4` (Front-Seat First-Person), `Q` / `E` (Quarter-Turn Orbit), Mouse Drag (Orbit / Look Around), Scroll Wheel (Zoom)
- **Coaster Simulation**: `Space` (Pull Cherry Dispatch Lever), `[` / `]` (Switch Coaster Ticket), `X` (Ride Speed `x1`/`x2`/`x4`), `M` (Mute Sound)

### Mobile / Touch
- **Move**: Drag the bottom-left **Touch Joystick**
- **Interact / Talk**: Tap the floating interaction pill or bottom-right **Action / Interact** button
- **Camera & Booth**: Pinch to zoom, drag to orbit/look around, tap **🎟️ Ride Tickets & Dispatch Booth** bottom sheet

## How to Launch
- **Zero-Install Standalone**: Open `cinderpine-express.html` or `index.html` directly in any modern browser.
- **Rebuild from Source** (if editing `src/*.js`): Run `.\bundle.ps1` in PowerShell to re-inline all modules into `index.html` and `cinderpine-express.html`.
