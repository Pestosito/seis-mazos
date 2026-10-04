// Genera las tres salidas a partir de src/:
//   app/                 → app instalable (PWA) lista para publicar en Netlify u otro hosting
//   dist/index.html      → fragmento para publicar como Artifact de Claude (solo modo individual)
//   dist/blackjack.html  → documento único para abrir directamente en el navegador
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

const url = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(url(p), 'utf8');

// Versión: huella de las fuentes; se muestra en Reglas → Mantenimiento y nombra la caché.
const version = createHash('sha256')
  .update(['template.html', 'styles.css', 'audio.js', 'engine.js', 'app.js', 'sw.js', 'vendor/mqtt.min.js'].map((f) => read('./src/' + f)).join('\n'))
  .digest('hex')
  .slice(0, 8);

function page({ head = '', vendor = '' } = {}) {
  return read('./src/template.html')
    .replace('__APP_VERSION__', version)
    .replace('<!--__HEAD__-->', () => head)
    .replace('<!--__VENDOR__-->', () => vendor)
    .replace('/*__CSS__*/', () => read('./src/styles.css'))
    .replace('/*__AUDIO__*/', () => read('./src/audio.js'))
    .replace('/*__ENGINE__*/', () => read('./src/engine.js'))
    .replace('/*__APP__*/', () => read('./src/app.js'));
}
// Documento completo: título, metadatos, manifiesto y estilos van en <head> (Chrome y Safari
// solo leen ahí el manifiesto y el ícono); el resto de la página va en <body>.
const doc = (page) => {
  const cut = page.indexOf('<div class="app"');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${page.slice(0, cut).trim()}
</head>
<body>
${page.slice(cut).trim()}
</body>
</html>
`;
};

mkdirSync(url('./dist/'), { recursive: true });
const fragment = page();
writeFileSync(url('./dist/index.html'), fragment);
writeFileSync(url('./dist/blackjack.html'), doc(page({ vendor: `<script>\n${read('./src/vendor/mqtt.min.js')}\n</script>` })));

// App instalable
const pwaHead = `<meta name="description" content="Practica blackjack: estrategia básica, conteo Hi-Lo y desviaciones, solo o con otra persona.">
<meta name="theme-color" content="#0c4636">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Seis Mazos">
<script>window.SEIS_MAZOS_PWA = true;</script>`;
const appHtml = doc(page({ head: pwaHead, vendor: '<script src="mqtt.min.js"></script>' }));
rmSync(url('./app/'), { recursive: true, force: true });
mkdirSync(url('./app/icons/'), { recursive: true });
writeFileSync(url('./app/index.html'), appHtml);
writeFileSync(url('./app/sw.js'), read('./src/sw.js').replace('__VERSION__', version));
copyFileSync(url('./src/manifest.webmanifest'), url('./app/manifest.webmanifest'));
copyFileSync(url('./src/vendor/mqtt.min.js'), url('./app/mqtt.min.js'));
copyFileSync(url('./src/vendor/MQTTJS-LICENSE.md'), url('./app/MQTTJS-LICENSE.md'));
for (const f of ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'])
  copyFileSync(url('./src/icons/' + f), url('./app/icons/' + f));

console.log(`dist/index.html ${(fragment.length / 1024).toFixed(1)} KB · app/ versión ${version}`);
