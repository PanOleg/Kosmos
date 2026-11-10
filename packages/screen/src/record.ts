/**
 * Сторінка запису озвучки власним голосом (DECISIONS.md, п. 55): лише в dev (http://localhost:5173/record.html).
 * Кожна фраза зберігається одразу після зупинки запису в scripts/voice/raw/<id>.webm (через dev-сервер),
 * потім `sh scripts/voice/process.sh` обрізає тишу, прибирає шум і вирівнює гучність → public/voice.
 */
const $ = (id: string) => document.getElementById(id)!;

/** Підказка інтонації: голос бортового комп'ютера / оператора рації. */
const MOOD: Record<string, string> = {
  start: 'рівно, впевнено — оператор на зв’язку',
  startDesert: 'рівно, впевнено — оператор на зв’язку',
  foreman: 'тривожно, швидше',
  core: 'тривожно, вагомо',
  lightsOut: 'напружено, тихіше',
  sandstorm: 'напружено, голосніше — крізь вітер',
  phase2: 'тривожно',
  phase3: 'тривожно, найнапруженіше',
  airlock: 'різко, як сигнал тривоги',
  airlockDesert: 'різко, як сигнал тривоги',
  cleared: 'з полегшенням',
  down: 'швидко, наказом',
  revived: 'бадьоро',
  bot: 'сухо, технічно',
  victory: 'урочисто',
  victoryDesert: 'урочисто',
  defeat: 'похмуро, повільно',
  pause: 'коротко, спокійно',
  countdown: 'рівно, з паузами',
  achievement: 'тепло, з усмішкою',
  record: 'тепло, з усмішкою',
  contract: 'тепло, з усмішкою',
};

let lines: [string, string][] = [];
let done = new Set<string>();
let cur = 0;
let rec: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let analyser: AnalyserNode | null = null;
const lastClip = new Map<string, Blob>();

async function init(): Promise<void> {
  lines = Object.entries((await (await fetch('/__voice/lines')).json()) as Record<string, string>);
  done = new Set((await (await fetch('/__voice/list')).json()) as string[]);
  const firstTodo = lines.findIndex(([id]) => !done.has(id));
  cur = firstTodo < 0 ? 0 : firstTodo;
  render();
}

function render(): void {
  const [id, text] = lines[cur]!;
  $('n').textContent = `Фраза ${cur + 1} з ${lines.length} · ${id}`;
  $('phrase').textContent = text;
  $('mood').textContent = MOOD[id]
    ? `Інтонація: ${MOOD[id]}`
    : 'Інтонація: рівно, як бортовий комп’ютер';
  $('list').innerHTML = lines
    .map(
      ([lid, t], i) =>
        `<div data-i="${i}" class="${i === cur ? 'cur' : ''}"><span class="ok">${done.has(lid) ? '✓' : ''}</span><span>${t}</span></div>`,
    )
    .join('');
  $('progress').innerHTML =
    done.size >= lines.length
      ? `<span class="done">Усі ${lines.length} фраз записано! Напишіть Claude — він обробить і підключить.</span>`
      : `Записано ${done.size} з ${lines.length}`;
}

async function ensureMic(): Promise<MediaStream> {
  if (stream) return stream;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false },
  });
  const ctx = new AudioContext();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const tick = () => {
    analyser!.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    ($('level') as HTMLElement).style.width = `${Math.min(100, peak * 140)}%`;
    ($('level') as HTMLElement).style.background = peak > 0.95 ? '#ff5a3a' : '#7dffb0';
    requestAnimationFrame(tick);
  };
  tick();
  return stream;
}

async function toggleRec(): Promise<void> {
  if (rec) {
    rec.stop();
    return;
  }
  const s = await ensureMic();
  const [id] = lines[cur]!;
  const chunks: Blob[] = [];
  rec = new MediaRecorder(s, { mimeType: 'audio/webm' });
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = async () => {
    rec = null;
    const blob = new Blob(chunks, { type: 'audio/webm' });
    lastClip.set(id, blob);
    $('state').className = 'state';
    $('state').textContent = 'Зберігаю…';
    const r = await fetch(`/__voice/save/${id}`, { method: 'POST', body: blob });
    if (r.ok) {
      done.add(id);
      $('state').textContent = 'Збережено. P — прослухати, Enter — далі, Пробіл — перезаписати';
    } else $('state').textContent = 'Не вдалося зберегти — чи запущено pnpm dev?';
    render();
  };
  rec.start();
  $('state').className = 'state rec';
  $('state').textContent = '● Іде запис… Пробіл — зупинити';
}

async function play(): Promise<void> {
  const [id] = lines[cur]!;
  let blob = lastClip.get(id);
  if (!blob && done.has(id)) {
    // Запис з минулого сеансу — беремо з диска через dev-сервер.
    const r = await fetch(`/__voice/raw/${id}`);
    if (r.ok) blob = await r.blob();
  }
  if (!blob) {
    $('state').textContent = 'Цю фразу ще не записано';
    return;
  }
  void new Audio(URL.createObjectURL(blob)).play();
}

function go(d: number): void {
  if (rec) return;
  cur = Math.max(0, Math.min(lines.length - 1, cur + d));
  $('state').className = 'state';
  $('state').textContent = done.has(lines[cur]![0])
    ? 'Уже записано. Пробіл — перезаписати'
    : 'Пробіл — почати запис';
  render();
}

$('b-rec').addEventListener('click', () => void toggleRec());
$('b-play').addEventListener('click', () => void play());
$('b-next').addEventListener('click', () => go(1));
$('b-prev').addEventListener('click', () => go(-1));
$('list').addEventListener('click', (e) => {
  const d = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
  if (d) go(Number(d.dataset.i) - cur);
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    void toggleRec();
  } else if (e.code === 'KeyP') void play();
  else if (e.code === 'Enter' || e.code === 'ArrowRight') go(1);
  else if (e.code === 'ArrowLeft') go(-1);
});
void init();
