import type { WebGLRenderer } from 'three';

/** F3 — fps, кадр, draw calls. Пізніше тут з'явиться затримка пультів. */
export class DebugOverlay {
  private readonly el = document.createElement('div');
  private visible = new URLSearchParams(location.search).has('debug');
  private frames = 0;
  private accum = 0;
  private worst = 0;

  constructor() {
    Object.assign(this.el.style, {
      position: 'fixed',
      left: '50%',
      transform: 'translateX(-50%)',
      bottom: '8px',
      font: '12px/1.4 ui-monospace, monospace',
      color: '#9fe',
      background: 'rgba(0,0,0,0.5)',
      padding: '4px 8px',
      pointerEvents: 'none',
      whiteSpace: 'pre',
      zIndex: '10',
    });
    document.body.appendChild(this.el);
    this.el.style.display = this.visible ? 'block' : 'none';
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.visible = !this.visible;
        this.el.style.display = this.visible ? 'block' : 'none';
      }
    });
  }

  frame(dt: number, renderer: WebGLRenderer, extra = ''): void {
    this.frames++;
    this.accum += dt;
    this.worst = Math.max(this.worst, dt);
    if (this.accum < 0.5 || !this.visible) {
      if (this.accum >= 0.5) this.reset();
      return;
    }
    const fps = this.frames / this.accum;
    const info = renderer.info.render;
    this.el.textContent = `fps ${fps.toFixed(0)}  worst ${(this.worst * 1000).toFixed(1)}ms\ndraw ${info.calls}  tris ${info.triangles}${extra ? '\n' + extra : ''}`;
    this.reset();
  }

  private reset(): void {
    this.frames = 0;
    this.accum = 0;
    this.worst = 0;
  }
}
