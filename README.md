# $MAGA Disclosure Runner

An original pixel-art endless runner for Make Aliens Great Again. It uses Phaser,
TypeScript, Bun's HTML bundler, generated game assets based on the official pixel
alien mascot, and a DOM overlay for responsive menus and HUD.

## Commands

```bash
bun install
bun run dev
bun run check
bun run build
bun run desktop
bun run build:desktop
```

Development runs at `http://localhost:3000/`. The production build is written to
`dist/` with relative asset URLs, so the folder can be served from `/game/`, a
game subdomain, or another static path.

## Desktop Build

`bun run desktop` launches the game in the operating system's native WebView.
`bun run build:desktop` creates a self-contained Bun executable at:

```text
desktop-dist/maga-disclosure-runner
```

The executable embeds the game frontend and relaunches itself in a private
ephemeral loopback-server mode. Official HTTPS links open in the user's default
browser.

Platform requirements:

- macOS: uses Cocoa/WebKit with no additional runtime.
- Windows: requires the Microsoft Edge WebView2 runtime.
- Linux: requires GTK 4 and WebKitGTK 6 at runtime.

Use `bun run smoke:desktop` to compile the executable and verify its embedded
server without opening a desktop window.

## Controls

- `Space`, `Arrow Up`, click, or tap: jump
- Release jump early: shorter jump
- `F`: toggle fullscreen
- `Esc` or the HUD pause button: pause
- Touch devices receive a dedicated jump button

## Site Integration

The game emits a `maga-game:event` `CustomEvent` on `window`. Its `detail.type`
is one of:

- `ready`
- `run-start`
- `run-end`
- `cta-click`

Example:

```ts
window.addEventListener("maga-game:event", (event) => {
  const payload = (event as CustomEvent).detail;
  analytics.track(payload.type, payload);
});
```

The game does not connect wallets, execute transactions, or fetch live token
data. Result-screen links point to the official Buy, Disclosure, and Telegram
pages and open with `noopener noreferrer`.

## QA Routes

On localhost only:

- `/?phase=archive`
- `/?phase=launch`
- `/?shield=1`

These shortcuts support visual QA without affecting a deployed host.
