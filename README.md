# Seis Mazos

Entrenador de blackjack: estrategia básica, conteo Hi-Lo y desviaciones. Se juega solo o en línea con otras personas, cada una en su teléfono.

**Jugar:** abre **https://pestosito.github.io/seis-mazos/** en el navegador del teléfono (Safari en iPhone, Chrome en Android), no dentro de la app de GitHub.

- **iPhone (Safari):** botón Compartir (el cuadrado con la flecha ↑) → *Añadir a pantalla de inicio*.
- **Android (Chrome):** botón *Instalar* o menú ⋮ → *Instalar app*.

Funciona sin conexión, salvo el juego en línea.

- **Mesa**: zapato de 4, 6 u 8 mazos con carta de corte y jugadores robot que juegan estrategia básica. Cada decisión se corrige con la estrategia básica de las reglas elegidas y, si se activa, con las desviaciones Hi-Lo según el true count.
- **Jugar con alguien**: quien crea la mesa comparte un código de 4 letras; hasta 3 personas más se unen desde su teléfono. Modo **coop** (banca común) o **individual** (cada uno con su banca).
- **Estrategia**, **Conteo** y **Desviaciones**: ejercicios con repaso de errores.
- **Tablas** y **Reglas**: tablas generadas para las reglas elegidas (S17/H17, DAS, RSA, rendición, doblar, BJ 3:2/6:5, penetración).

## Desarrollo

- `src/` — código fuente (`engine.js` motor y estrategia, `explain.js` el porqué de cada jugada, `app.js` interfaz y juego en línea, `audio.js` sonidos y música, `styles.css`, `template.html`, `sw.js`, `manifest.webmanifest`, íconos, tipografías en `fonts/` y [MQTT.js](https://github.com/mqttjs/MQTT.js) en `vendor/`).
- `app/` — app instalable generada; la rama `gh-pages` publica su contenido.

```sh
npm run build   # regenera app/
npm test        # pruebas del motor
```


El juego en línea no conecta los teléfonos entre sí: los mensajes pasan por servidores públicos de mensajería (MQTT sobre WebSocket seguro: EMQX, HiveMQ, Eclipse y Mosquitto) con [MQTT.js](https://github.com/mqttjs/MQTT.js) (licencia MIT, en `src/vendor/`). Así funciona con datos móviles y cualquier wifi. Los mensajes solo llevan jugadas y cartas; no hay cuentas, nombres ni datos personales.

Las tipografías (Archivo, Cinzel y JetBrains Mono, licencia SIL Open Font License; textos en `src/fonts/`) van dentro de la app para que funcione sin internet.

Las pruebas comparan las tablas con un cálculo independiente de valor esperado (mazo infinito); las únicas diferencias son A,4 vs 4 y A,2 vs 5, jugadas casi empatadas en las que la tabla de 4–8 mazos dobla.
