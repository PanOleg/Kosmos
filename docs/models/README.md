# 3D-моделі: як отримати й підставити

Гра працює на примітивах, але кожну модель можна замінити готовою glTF-моделлю (рішення 24 у `docs/DECISIONS.md`).
Поклали файл, і гра бере його. Немає файлу — лишаються примітиви.

## Як підставити модель

1. Покладіть `<id>.glb` у `packages/screen/public/models/`. Id — з таблиці нижче (`assault`, `scout`, …).
2. Додайте запис у `packages/screen/public/models/manifest.json`:
   ```json
   { "assault": { "height": 1.9, "yaw": 0 } }
   ```
   `height` — висота моделі в грі, метри (модель масштабується під неї). `yaw` — поворот у градусах, якщо модель дивиться не на +Z.
3. Перевірте в галереї: `http://localhost:5173/gallery.html?m=assault`. Порівняйте з концептом поруч, ракурс той самий.

## Технічні вимоги

| Параметр | Вимога |
| --- | --- |
| Формат | `.glb` (glTF 2.0, бінарний), текстури вбудовані |
| Осі | Y вгору, обличчя до +Z |
| Початок координат | між ступнями на рівні підлоги (для дронів — центр корпусу) |
| Одиниці | метри; точний масштаб не важливий, гра підганяє під `height` |
| Матеріали | PBR metallic-roughness, 1–2 матеріали; емісивні частини (візор, очі, котушки) окремою емісивною картою |
| Текстури | 1024² для рядових, 2048² для босів; без 4K |
| Полігони | див. бюджет у таблиці; дюжини ворогів одночасно мають тримати 60 fps на інтегрованій графіці |
| Анімації | необов'язкові. Якщо є — кліпи з назвами нижче; без них гра анімує модель процедурно (покачування, нахил) |

Назви анімаційних кліпів, які гра розпізнає:

- гравці: `idle`, `run`, `shoot`, `dash`, `down`;
- наземні вороги: `idle`, `run`, `attack`, `death`;
- дрони: `hover`, `attack`.

Гуманоїдів (класи, Стрілець, Ремонтник) зручно ригувати автоматично в Mixamo: експорт FBX → імпорт у Blender → експорт GLB.
Моделі з генераторів «зображення → 3D» зазвичай важкі: перед експортом зменшіть полігони (Blender Decimate або `gltf-transform simplify`).

## Генерація з концептів

Вирізки персонажів лежать у `docs/models/crops/<id>.jpg`. На них частково видно сусідніх персонажів і тло,
тож у генераторі ввімкніть видалення фону або обріжте зайве. Нижче — опис для поля prompt (англійською, бо так їх розуміють сервіси).
Загальний стиль для всіх: *stylized sci-fi game character, chunky readable silhouette for top-down camera, hard-surface armor, PBR, game-ready, low-poly friendly*.

### Класи гравців

| Id | Персонаж | Бюджет | Висота | Prompt |
| --- | --- | --- | --- | --- |
| `assault` | Штурмовик | 10–15k | 1.9 м | heavy armored space marine, red armor plates over black undersuit, large angular shoulder pads with chevron, helmet with narrow glowing red visor slit, holding a long pulse rifle with red glowing lines in both hands |
| `engineer` | Інженер | 10–15k | 1.9 м | stocky engineer soldier, orange armor plates over dark gunmetal suit, very large backpack shield generator with gear emblem, translucent orange hexagonal honeycomb shield panel behind the back, short heavy shotgun held in both hands |
| `medic` | Медик | 8–12k | 1.85 м | slim field medic, white armor with green accents, green helmet with dark visor, pistol raised in right hand, small floating green healing drone with a cross symbol near the shoulder |
| `tech` | Технік | 10–15k | 1.9 м | technician soldier, blue armor plates over black suit, blue visor, antenna on the back, long electric arc gun with three glowing blue coils held in both hands |

### Вороги

| Id | Ворог | Бюджет | Висота | Prompt |
| --- | --- | --- | --- | --- |
| `scout` | Скаут | 4–6k | 1.7 м | thin bipedal combat robot, backward-bending digitigrade legs, spiked pointed head, two long scythe blades instead of arms, off-white armor with dark joints, single red glowing eye |
| `gunner` | Стрілець | 5–8k | 1.8 м | humanoid combat robot, light grey armor, round head with one red glowing eye, blaster rifle held in both hands, crouching pose |
| `wasp` | Оса | 2–3k | 0.9 м | small hovering wasp drone, pointed fuselage, two pairs of thin wing blades, gun underneath, red eye |
| `shell` | Панцир | 15–20k | 3.2 м | huge slow heavy mech, rocket pods on both shoulders, glowing red exposed core in the chest and on the back, massive legs, dark red and grey armor |
| `kamikaze` | Камікадзе | 1.5–2k | 0.9 м | armored teardrop-shaped kamikaze drone, pointed armored nose, red glowing front, short stub wings |
| `spider` | Павук | 5–8k | 1.0 м | multi-legged spider robot, six thin segmented legs, light armored body, red eyes |
| `repairer` | Ремонтник | 6–8k | 1.6 м | hunched repair robot, welding arms with sparks, holding a translucent blue energy shield plate, rusty red-brown armor |
| `sniper` | Снайпер-дрон | 2–3k | 0.8 м | thin hovering sniper drone with a very long barrel, red targeting laser, dark armor |
| `turret` | Турель | 4–6k | 1.6 м | stationary tripod turret, boxy rotating head, thick cannon barrel, red sensor light |
| `swarm` | Рій (одна одиниця) | 200–400 | 0.3 м | tiny spiky biting drone, four sharp spikes, red eye (one unit of a swarm of twelve) |
| `foreman` | Прораб | 15–20k | 3.0 м | large construction robot boss, two yellow hydraulic crane arms with claws above the shoulders, black and yellow hazard stripes, red and grey body |
| `core` | Ядро станції | 25–30k | 6.0 м | massive circular boss made of station parts, armored rings around a huge glowing red eye core |
