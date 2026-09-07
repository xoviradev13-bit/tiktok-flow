/**
 * High-performance, multi-cannon canvas confetti celebration.
 * Creates colorful confetti celebration particles for milestone achievements and onboarding completion.
 */

export function triggerConfetti(durationMs: number = 3500): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "999999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  let width = (canvas.width = window.innerWidth * dpr);
  let height = (canvas.height = window.innerHeight * dpr);

  const handleResize = () => {
    width = canvas.width = window.innerWidth * dpr;
    height = canvas.height = window.innerHeight * dpr;
  };
  window.addEventListener("resize", handleResize);

  const colors = [
    "#6366F1", "#8B5CF6", "#EC4899", "#3B82F6",
    "#10B981", "#F59E0B", "#EF4444", "#14B8A6", "#84CC16", "#F43F5E", "#A855F7"
  ];

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    angularVelocity: number;
    color: string;
    radius: number;
    w: number;
    h: number;
    shape: "circle" | "rect" | "strip";
    opacity: number;
  }

  const particles: Particle[] = [];
  const particleCount = Math.min(240, Math.floor((window.innerWidth * dpr) / 5));

  // Multi-cannon burst: Left cannon, Right cannon, Center fountain
  for (let i = 0; i < particleCount; i++) {
    const cannon = i % 3;
    let originX: number;
    let originY: number;
    let angle: number;
    let speed: number;

    if (cannon === 0) {
      // Left cannon shooting up-right
      originX = width * 0.1;
      originY = height * 0.85;
      angle = -Math.PI / 3 + (Math.random() - 0.5) * 0.7;
      speed = (14 + Math.random() * 22) * dpr;
    } else if (cannon === 1) {
      // Right cannon shooting up-left
      originX = width * 0.9;
      originY = height * 0.85;
      angle = (-2 * Math.PI) / 3 + (Math.random() - 0.5) * 0.7;
      speed = (14 + Math.random() * 22) * dpr;
    } else {
      // Center fountain shooting high
      originX = width * 0.5 + (Math.random() - 0.5) * (width * 0.3);
      originY = height * 0.9;
      angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
      speed = (16 + Math.random() * 24) * dpr;
    }

    const shapeChoice = Math.random();
    const shape = shapeChoice < 0.4 ? "rect" : shapeChoice < 0.7 ? "strip" : "circle";

    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - 0.5) * 0.25,
      color: colors[Math.floor(Math.random() * colors.length)],
      radius: (3 + Math.random() * 4) * dpr,
      w: (shape === "strip" ? 14 : 8 + Math.random() * 6) * dpr,
      h: (shape === "strip" ? 4 : 5 + Math.random() * 4) * dpr,
      shape,
      opacity: 1,
    });
  }

  const startTime = performance.now();
  let animationId: number;

  const render = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);

    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.42 * dpr; // gravity
      p.vx *= 0.985; // air resistance
      p.angle += p.angularVelocity;

      if (progress > 0.6) {
        p.opacity = Math.max(0, 1 - (progress - 0.6) / 0.4);
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;

      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }

      ctx.restore();
    }

    if (elapsed < durationMs) {
      animationId = requestAnimationFrame(render);
    } else {
      window.removeEventListener("resize", handleResize);
      canvas.remove();
    }
  };

  animationId = requestAnimationFrame(render);
}
