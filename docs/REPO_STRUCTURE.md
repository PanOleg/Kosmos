# Структура репозиторію

Монорепозиторій на pnpm workspaces з трьома пакетами: чиста симуляція, екран, пульт. Симуляція не імпортує нічого з браузера, тому пізніше запуститься на сервері без змін.

## Дерево

```
horizon/
├─ package.json              # pnpm workspaces, спільні скрипти
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ packages/
│  ├─ sim/                   # чиста ігрова симуляція, без DOM і Three.js
│  │  ├─ src/
│  │  │  ├─ index.ts         # createGame(config, seed) → step(inputs) → state
│  │  │  ├─ config/          # balance.ts, waves.ts, classes.ts, enemies.ts, map.ts
│  │  │  ├─ entities/        # player.ts, enemy.ts, projectile.ts, pickup.ts
│  │  │  ├─ systems/         # movement, autoaim, combat, waves, pickups, revive, ai/
│  │  │  ├─ ai/              # behaviors: cover, flank, swarm, kamikaze, boss phases
│  │  │  ├─ collision/       # кола й прямокутники, сітка для широкої фази
│  │  │  ├─ rng.ts           # детермінований генератор з сідом
│  │  │  ├─ protocol.ts      # типи вводу, стану, повідомлень екран↔пульт
│  │  │  └─ serialize.ts     # компактна серіалізація стану
│  │  └─ test/               # vitest: детермінізм, хвилі, автоприціл, баланс-симуляції
│  ├─ screen/                # гра на ноутбуці або телевізорі
│  │  ├─ index.html
│  │  └─ src/
│  │     ├─ main.ts          # ігровий цикл: фіксований крок sim, рендер з інтерполяцією
│  │     ├─ render/          # Three.js: scene, camera, arena, entities, effects, pools
│  │     ├─ audio/           # Web Audio: синтезовані звуки, менеджер
│  │     ├─ input/           # keyboard.ts, bots.ts, net.ts → єдиний PlayerInput
│  │     ├─ net/             # host.ts (PeerJS), room code, QR, reconnect
│  │     ├─ ui/              # lobby, session settings, HUD, pause, results
│  │     └─ debug/           # overlay: fps, latency, hitboxes, wave skip
│  └─ controller/            # сторінка пульта для телефона
│     ├─ index.html
│     └─ src/
│        ├─ main.ts
│        ├─ joystick.ts      # віртуальний стік, великі зони дотику
│        ├─ net.ts           # PeerJS client, фіксована частота відправки
│        ├─ classSelect.ts
│        └─ feedback.ts      # колір, здоров'я, вібрація, wake lock
└─ docs/
   └─ concepts/              # посилання на концепт-арти
```

## Залежності

| Пакет | Залежності | Навіщо |
| --- | --- | --- |
| sim | жодних рантайм-залежностей | Чистота й переносимість на сервер |
| screen | three, peerjs, qrcode | Рендер, зв'язок, QR у лобі |
| controller | peerjs | Зв'язок |
| корінь | typescript, vite, vitest, eslint, prettier | Інструменти |

Фізика: власні колізії кіл і прямокутників у `sim/collision`. Для цієї гри Rapier надлишковий: немає стеків тіл і складної динаміки, а детермінізм власного коду простіший.

## Ключові інваріанти

- `sim` компілюється з `lib: ["ES2022"]` без `DOM`; будь-який імпорт браузерного API ламає збірку.
- Усередині `sim` немає `Math.random` і `Date.now`; лише `rng` із сідом і крок симуляції.
- Один крок симуляції = 1/60 с; `screen` викликає `step` стільки разів, скільки накопичилося часу.
- `PlayerInput` однаковий для клавіатури, бота й телефона: `{ move: {x, y}, ability: boolean }`.
- Усі числа балансу живуть у `sim/src/config`, у коді систем літералів немає.

## Перші коміти

1. Скелет монорепозиторію, лінтер, порожні пакети, `pnpm dev` піднімає екран.
2. `sim`: rng, крок, гравець із рухом, арена з колізіями. Тест детермінізму: два прогони з одним сідом дають однаковий стан.
3. `screen`: сцена, камера, арена з примітивів, персонаж, клавіатура. Можна бігати.
4. `sim`: Скаут з простим переслідуванням, автоприціл, снаряди, шкода, смерть.
5. `screen`: ефекти стрільби й влучання, звук, тремтіння камери. Перша перевірка відчуття.
6. `sim`: укриття на арені, Стрілець з поведінкою укриття. Ривок гравця.
7. Одна хвиля з конфігу, деталі, екран результатів. Вертикальний зріз готовий, плейтест.
8. `controller` + `net`: лобі, QR, другий гравець з телефона.
9. Далі по одній системі: класи, покращення, решта ворогів, воскресіння, хвилі, міні-бос, бос.
