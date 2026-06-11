interface ServerReadyMessage {
  type: "ready";
  port: number;
}

const APP_TITLE = "$MAGA Disclosure Runner";
const STARTUP_TIMEOUT_MS = 10_000;
const SERVER_MODE_ARG = "--desktop-server";
const EPHEMERAL_PORT_MIN = 49_152;
const EPHEMERAL_PORT_MAX = 65_535;
const PORT_ATTEMPTS = 20;

function runEmbeddedServer(): void {
  let server: ReturnType<typeof Bun.serve> | undefined;

  for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt += 1) {
    const port =
      EPHEMERAL_PORT_MIN +
      Math.floor(Math.random() * (EPHEMERAL_PORT_MAX - EPHEMERAL_PORT_MIN + 1));

    try {
      server = Bun.serve({
        hostname: "127.0.0.1",
        port,
        routes: {
          "/": index,
        },
        fetch() {
          return new Response("Not found", { status: 404 });
        },
      });
      break;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "EADDRINUSE"
      ) {
        throw error;
      }
    }
  }

  if (!server) throw new Error("Could not find an available loopback port.");
  console.log(JSON.stringify({ type: "ready", port: server.port }));
}

function startServerProcess() {
  const sourceEntrypoint = process.argv[1]?.endsWith(".ts")
    ? process.argv[1]
    : undefined;
  const command = sourceEntrypoint
    ? [process.execPath, sourceEntrypoint, SERVER_MODE_ARG]
    : [process.execPath, SERVER_MODE_ARG];

  return Bun.spawn(command, {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  });
}

type ServerProcess = ReturnType<typeof startServerProcess>;

async function readServerMessage(
  stream: ReadableStream<Uint8Array>,
): Promise<ServerReadyMessage> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error("Desktop server exited before reporting its port.");

      buffer += decoder.decode(value, { stream: true });
      const newline = buffer.indexOf("\n");
      if (newline < 0) continue;

      const message = JSON.parse(buffer.slice(0, newline)) as ServerReadyMessage;
      if (message.type !== "ready" || !Number.isInteger(message.port)) {
        throw new Error("Desktop server returned an invalid startup message.");
      }
      return message;
    }
  } finally {
    reader.releaseLock();
  }
}

async function waitForServer(serverProcess: ServerProcess): Promise<number> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("Desktop server did not start in time."));
    }, STARTUP_TIMEOUT_MS);
  });
  const exited = serverProcess.exited.then((code) => {
    throw new Error(`Desktop server exited during startup with code ${code}.`);
  });

  try {
    const message = await Promise.race([
      readServerMessage(serverProcess.stdout),
      exited,
      timedOut,
    ]);
    return message.port;
  } finally {
    clearTimeout(timeout);
  }
}

function openExternal(rawUrl: string): void {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS links can be opened externally.");
  }

  const command =
    process.platform === "darwin"
      ? ["open", url.href]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url.href]
        : ["xdg-open", url.href];

  Bun.spawn(command, {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  }).unref();
}

async function runSmokeTest(url: string): Promise<void> {
  const response = await fetch(url);
  const html = await response.text();
  if (!response.ok || !html.includes("<title>$MAGA Disclosure Runner</title>")) {
    throw new Error(`Desktop server smoke test failed with HTTP ${response.status}.`);
  }
  console.log(`Desktop server ready at ${url}`);
}

async function runDesktop(): Promise<void> {
  const serverProcess = startServerProcess();

  try {
    const port = await waitForServer(serverProcess);
    const url = `http://127.0.0.1:${port}/`;

    if (process.argv.includes("--smoke")) {
      await runSmokeTest(url);
      return;
    }

    const { SizeHint, Webview } = await import("webview-bun");
    const webview = new Webview(false, {
      width: 1280,
      height: 800,
      hint: SizeHint.NONE,
    });
    webview.title = APP_TITLE;

    if (process.argv.includes("--native-smoke")) {
      webview.setHTML(`<html><title>${APP_TITLE}</title></html>`);
      webview.destroy();
      console.log("Desktop WebView created successfully.");
      return;
    }

    webview.bind("openExternal", (externalUrl: string) => {
      openExternal(externalUrl);
      return true;
    });
    webview.init(`
      (() => {
        const shouldOpenExternally = (anchor) =>
          anchor instanceof HTMLAnchorElement &&
          anchor.target === "_blank" &&
          anchor.href.startsWith("https://");

        document.addEventListener("click", (event) => {
          const anchor = event.target instanceof Element
            ? event.target.closest("a")
            : null;
          if (!shouldOpenExternally(anchor)) return;
          event.preventDefault();
          globalThis.openExternal(anchor.href);
        }, true);

        const nativeOpen = globalThis.open;
        globalThis.open = (url, target, features) => {
          if (target === "_blank" && typeof url === "string" && url.startsWith("https://")) {
            globalThis.openExternal(url);
            return null;
          }
          return nativeOpen.call(globalThis, url, target, features);
        };
      })();
    `);
    webview.navigate(url);
    webview.run();
  } finally {
    serverProcess.kill();
    await serverProcess.exited;
  }
}

import index from "../index.html";

if (process.argv.includes(SERVER_MODE_ARG)) {
  runEmbeddedServer();
} else {
  await runDesktop();
}
