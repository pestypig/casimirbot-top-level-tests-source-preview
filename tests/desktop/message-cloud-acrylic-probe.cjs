/**
 * Isolated Windows compositor probe. Run with the repo's pinned Electron:
 *   apps/desktop/node_modules/.bin/electron.cmd tests/desktop/message-cloud-acrylic-probe.cjs
 *
 * Creates only temporary-profile test windows and writes desktop-composited
 * screen captures to a new temp directory. It never opens the CasimirBot app.
 * Compare the sharpness of checkerboard edges behind each window. A darkened
 * but sharp checkerboard is transparency, not cross-application blur.
 */
const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'casimir-cloud-acrylic-probe-'));
app.setPath('userData', path.join(output, 'profile'));

const html = body => `data:text/html;charset=utf-8,${encodeURIComponent(
  `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:100%;height:100%;overflow:hidden}
  ${body}
  </style><body></body>`)}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  if (process.platform !== 'win32') throw new Error('Windows-only compositor probe');
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  if (area.width < 850 || area.height < 680) throw new Error('Display too small for probe');
  const x = area.x + Math.round((area.width - 800) / 2);
  const y = area.y + Math.round((area.height - 600) / 2);
  const underlay = new BrowserWindow({
    x, y, width: 800, height: 600, frame: false,
    alwaysOnTop: true, skipTaskbar: true,
  });
  await underlay.loadURL(html(`body{background:repeating-conic-gradient(#fff 0 25%,#000 0 50%) 0 0/24px 24px}`));
  underlay.show();

  const variants = [
    { name: '01-transparent-current', transparent: true, material: 'acrylic',
      fill: 'rgba(8,14,32,.86)' },
    { name: '02-transparent-clear', transparent: true, material: 'acrylic',
      fill: 'rgba(8,14,32,.16)' },
    { name: '02a-transparent-mid', transparent: true, material: 'acrylic',
      fill: 'rgba(8,14,32,.36)' },
    { name: '02b-transparent-clear-no-material', transparent: true, material: 'none',
      fill: 'rgba(8,14,32,.16)' },
    { name: '03-opaque-acrylic', transparent: false, material: 'acrylic',
      fill: 'rgba(8,14,32,.16)' },
    { name: '04-opaque-no-material', transparent: false, material: 'none',
      fill: 'rgba(8,14,32,.16)' },
  ];
  for (const variant of variants) {
    const overlay = new BrowserWindow({
      x: x + 190, y: y + 100, width: 420, height: 400,
      frame: false, transparent: variant.transparent,
      backgroundColor: variant.transparent ? '#00000000' : '#000000',
      backgroundMaterial: variant.material,
      alwaysOnTop: true, skipTaskbar: true,
    });
    await overlay.loadURL(html(`body{background:${variant.fill};color:white;font:18px system-ui}
      body:before{content:'${variant.name}';display:block;padding:16px;background:rgba(0,0,0,.55)}`));
    overlay.setAlwaysOnTop(true, 'pop-up-menu');
    overlay.show();
    await delay(900);
    const sources = await desktopCapturer.getSources({
      types: ['screen'], thumbnailSize: display.size,
    });
    const source = sources.find(item => item.display_id === String(display.id)) ?? sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error('Composited screen capture unavailable');
    const file = path.join(output, `${variant.name}.png`);
    fs.writeFileSync(file, source.thumbnail.toPNG());
    process.stdout.write(`${variant.name}: ${file}\n`);
    overlay.destroy();
    await delay(180);
  }
  underlay.destroy();
  app.quit();
}).catch(error => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  app.exit(1);
});
