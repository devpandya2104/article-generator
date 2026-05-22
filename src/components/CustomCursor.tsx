import { useEffect, useRef } from 'react';

export default function CustomCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.matchMedia('(pointer: fine)').matches) return;

    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width  = window.innerWidth  * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width  = window.innerWidth  + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const styleEl = document.createElement('style');
    styleEl.textContent = '*, *::before, *::after { cursor: none !important; }';
    document.head.appendChild(styleEl);

    type HoverState = 'default' | 'button' | 'text';
    const state = {
      x: -300, y: -300,
      trail: [] as { x: number; y: number }[],
      hover: 'default' as HoverState,
      orbitAngle: 0,
      bursts: [] as { x: number; y: number; t: number }[],
      visible: false,
    };

    const onMove = (e: MouseEvent) => {
      state.x = e.clientX;
      state.y = e.clientY;
      state.visible = true;
      state.trail.push({ x: state.x, y: state.y });
      if (state.trail.length > 32) state.trail.shift();
    };
    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select'))                state.hover = 'text';
      else if (t.closest('a,button,[role="button"],label'))  state.hover = 'button';
      else                                                    state.hover = 'default';
    };
    const onDown  = (e: MouseEvent) => state.bursts.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    const onLeave = () => { state.visible = false; };
    const onEnter = () => { state.visible = true; };

    document.addEventListener('mousemove',  onMove);
    document.addEventListener('mouseover',  onOver);
    document.addEventListener('mousedown',  onDown);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    let raf: number;

    const draw = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      if (!state.visible) { raf = requestAnimationFrame(draw); return; }

      const { x, y, trail, hover, bursts } = state;

      if (trail.length > 1) {
        for (let i = 1; i < trail.length; i++) {
          const t = i / trail.length;
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.strokeStyle = `rgba(139,92,246,${t * t * 0.5})`;
          ctx.lineWidth   = t * 2.5;
          ctx.lineCap     = 'round';
          ctx.stroke();
        }
      }

      if (hover === 'button') {
        state.orbitAngle += 0.055;
        const R = 21;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(139,92,246,0.4)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        for (const [offset, r, a] of [[0, 3.5, 1], [Math.PI, 2.5, 0.55]] as [number, number, number][]) {
          const ox = x + Math.cos(state.orbitAngle + offset) * R;
          const oy = y + Math.sin(state.orbitAngle + offset) * R;
          ctx.save();
          ctx.shadowColor = 'rgba(167,139,250,0.9)';
          ctx.shadowBlur  = 6;
          ctx.beginPath();
          ctx.arc(ox, oy, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(167,139,250,${a})`;
          ctx.fill();
          ctx.restore();
        }
      } else if (hover === 'text') {
        const H = 15, CAP = 6;
        ctx.strokeStyle = 'rgba(167,139,250,0.9)';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y - H);       ctx.lineTo(x, y + H);       ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - CAP, y - H); ctx.lineTo(x + CAP, y - H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - CAP, y + H); ctx.lineTo(x + CAP, y + H); ctx.stroke();
      } else {
        ctx.save();
        ctx.shadowColor = 'rgba(139,92,246,0.85)';
        ctx.shadowBlur  = 16;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }

      const now = Date.now();
      state.bursts = bursts.filter(b => {
        const p = Math.min((now - b.t) / 480, 1);
        if (p >= 1) return false;
        const ease = 1 - Math.pow(1 - p, 3);
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(b.x + Math.cos(angle) * (6 + ease * 4),   b.y + Math.sin(angle) * (6 + ease * 4));
          ctx.lineTo(b.x + Math.cos(angle) * (10 + ease * 20), b.y + Math.sin(angle) * (10 + ease * 20));
          ctx.strokeStyle = `rgba(167,139,250,${(1 - p) * 0.9})`;
          ctx.lineWidth   = 1.5 * (1 - p * 0.6);
          ctx.lineCap     = 'round';
          ctx.stroke();
        }
        return true;
      });

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      styleEl.remove();
      window.removeEventListener('resize', resize);
      document.removeEventListener('mousemove',  onMove);
      document.removeEventListener('mouseover',  onOver);
      document.removeEventListener('mousedown',  onDown);
      document.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mouseenter', onEnter);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[9999]" />;
}
