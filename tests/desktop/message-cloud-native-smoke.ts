/**
 * Manual Electron compositor probe for the Message Codex cloud.
 * Bundle this entrypoint into apps/desktop/dist, then run it with Electron.
 * It uses synthetic text and prints only window/pixel counts, never content.
 */
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { app, BrowserWindow } from "electron";
import { MessageCloudController } from "../../apps/desktop/src/message-cloud";

const frame = {
  schema: "helix.message_cloud_frame.v1" as const,
  helixConversationId: "chat:native-smoke",
  turns: [{ id: "turn:smoke", prompt: "Synthetic display check",
    delivery: "reported" as const,
    report: { status: "completed" as const, text: "Synthetic report" } }],
};

const output = path.resolve(__dirname, "../../../.tmp/message-cloud-native-smoke.json");
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, "", "utf8");
const phase = (name: string) => appendFileSync(output,
  `${JSON.stringify({ schema: "message_cloud_native_smoke.v1", phase: name })}\n`, "utf8");
phase("started");
app.on("window-all-closed", () => {});

const sample = async (material: "none" | "acrylic") => {
  phase(`sample_${material}_begin`);
  let nativeWindow: BrowserWindow | null = null;
  const controller = new MessageCloudController({
    initialBounds: () => ({ x: 120, y: 120, width: 430, height: 505 }),
    onVisibilityChange: () => {},
    createWindow: () => {
      phase(`sample_${material}_create_window`);
      nativeWindow = new BrowserWindow({
        show: false, frame: false, transparent: true,
        backgroundMaterial: process.platform === "win32" ? material : "none",
        backgroundColor: "#00000000", movable: true, resizable: false,
        minimizable: false, maximizable: false, fullscreenable: false,
        skipTaskbar: true, hasShadow: false,
        webPreferences: {
          preload: path.join(__dirname, "message-cloud-preload.cjs"),
          contextIsolation: true, nodeIntegration: false, sandbox: true,
          webSecurity: true, allowRunningInsecureContent: false,
          webviewTag: false, plugins: false, safeDialogs: true,
          spellcheck: false, navigateOnDragDrop: false,
        },
      });
      return nativeWindow;
    },
  });
  try {
    const shown = await controller.show(frame);
    phase(`sample_${material}_shown_${shown}`);
    await new Promise(resolve => setTimeout(resolve, 400));
    const window = nativeWindow;
    if (!window || !shown) return { material, shown: false,
      nativeWindowCreated: Boolean(window),
      destroyed: window?.isDestroyed() ?? null };
    const alwaysOnTop = window.isAlwaysOnTop();
    const regions = await window.webContents.executeJavaScript(
      "({header:getComputedStyle(document.querySelector('header')).appRegion," +
      "close:getComputedStyle(document.querySelector('#close')).appRegion})");
    let captureMode = "inactive";
    let image;
    try { image = await window.webContents.capturePage(); }
    catch {
      captureMode = "focused_after_inactive_capture_failed";
      window.show();
      await new Promise(resolve => setTimeout(resolve, 200));
      image = await window.webContents.capturePage();
    }
    phase(`sample_${material}_captured`);
    const bitmap = image.toBitmap();
    let nontransparent = 0;
    let nonblack = 0;
    for (let offset = 0; offset + 3 < bitmap.length; offset += 4) {
      if (bitmap[offset + 3] > 10) nontransparent += 1;
      if (bitmap[offset] + bitmap[offset + 1] + bitmap[offset + 2] > 30)
        nonblack += 1;
    }
    return { material, shown, visible: window.isVisible(),
      alwaysOnTop, regions, captureMode,
      bounds: window.getBounds(),
      imageSize: image.getSize(), nontransparent, nonblack };
  } finally {
    controller.stop();
  }
};

void app.whenReady().then(async () => {
  phase("app_ready");
  try {
    const results = [];
    for (const material of ["acrylic", "none"] as const)
      results.push(await sample(material));
    if (results.some(result => !("nontransparent" in result) ||
        !result.shown || !result.visible || !result.alwaysOnTop ||
        !result.nontransparent || !result.nonblack))
      throw new Error("message_cloud_native_window_not_rendered_or_topmost");
    const receipt = { schema: "message_cloud_native_smoke.v1", results };
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    app.quit();
  } catch (error) {
    await writeFile(output, `${JSON.stringify({ schema: "message_cloud_native_smoke.v1",
      phase: "failed", error: String(error) })}\n`, "utf8");
    process.stderr.write(`message_cloud_native_smoke_failed: ${String(error)}\n`);
    app.exit(1);
  }
});
