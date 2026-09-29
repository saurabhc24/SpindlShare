"use client";

import { useEffect, useRef } from "react";

import styles from "./landing.module.css";

/** Chladni modes (n, m): each is a figure sand draws on a plate sung at one frequency. */
const MODES: [number, number][] = [
  [3, 5],
  [2, 7],
  [4, 9],
  [1, 6],
  [5, 8],
  [3, 10],
];
const MAX_GRAINS = 14000;
const MODE_MS = 3000;

/** Standing wave on a free square plate; sand gathers where it is zero. */
function wave(x: number, y: number, n: number, m: number) {
  return Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y) - Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y);
}

/**
 * Sand on a vibrating plate, the way cymatics is usually shown: grains shaken off the
 * moving areas collect on the still lines, and re-form when the frequency changes.
 */
export function Cymatics() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    // three is only fetched once the footer is near, so it never weighs on the first paint.
    const io = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const THREE = await import("three");
        if (disposed) return;

        const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        // Sand only reads as lines, so the count follows their length (plates × plate size), not
        // the area: by area a phone got so few grains per line that the figures fell apart.
        const box = el.getBoundingClientRect();
        const plates = Math.max(1, Math.round(box.width / Math.max(1, box.height) / 1.2));
        const GRAINS = Math.min(MAX_GRAINS, Math.round(plates * Math.sqrt((box.width / plates) * box.height) * 10));
        const phone = box.width < 700;
        const positions = new Float32Array(GRAINS * 3);
        for (let i = 0; i < GRAINS; i++) {
          positions[i * 3] = Math.random() * 2 - 1;
          positions[i * 3 + 1] = Math.random() * 2 - 1;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
          color: 0xf3ede3,
          // three already scales size by the pixel ratio, so a phone asks for plain 1.5px grains.
          size: phone ? 1.5 : 1.5 * Math.min(window.devicePixelRatio, 2),
          sizeAttenuation: false,
          transparent: true,
          opacity: phone ? 0.7 : 0.5,
        });
        scene.add(new THREE.Points(geometry, material));

        let aspect = 1;
        const resize = () => {
          const { width, height } = el.getBoundingClientRect();
          renderer.setSize(width, height, false);
          aspect = width / Math.max(1, height);
          camera.left = -aspect;
          camera.right = aspect;
          camera.updateProjectionMatrix();
          for (let i = 0; i < GRAINS; i++) positions[i * 3] = (Math.random() * 2 - 1) * aspect;
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(el);

        // The pointer shakes the sand near it loose, like a finger on the plate.
        const pointer = { x: 9, y: 9 };
        const onMove = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          pointer.x = ((e.clientX - r.left) / r.width) * 2 * aspect - aspect;
          pointer.y = 1 - ((e.clientY - r.top) / r.height) * 2;
        };
        const onLeave = () => {
          pointer.x = 9;
        };
        el.parentElement?.addEventListener("pointermove", onMove);
        el.parentElement?.addEventListener("pointerleave", onLeave);

        let mode = 0;
        let changedAt = -1;
        let visible = true;
        const vio = new IntersectionObserver(([e]) => {
          visible = e.isIntersecting;
        });
        vio.observe(el);

        const step = (now: number, amount: number) => {
          if (changedAt < 0) changedAt = now;
          if (now - changedAt > MODE_MS) {
            mode = (mode + 1) % MODES.length;
            changedAt = now;
          }
          const [n, m] = MODES[mode];
          // A new frequency kicks the whole plate hard, then eases back to a steady hum.
          const kick = Math.exp(-(now - changedAt) / 700);
          const hum = 0.0045 + 0.035 * kick;
          // Plates side by side across the band, each close to square.
          const cell = aspect / Math.max(1, Math.round(aspect / 1.2));
          for (let i = 0; i < GRAINS; i++) {
            const k = i * 3;
            let x = positions[k];
            let y = positions[k + 1];
            const t = (x + aspect) / (2 * cell);
            const u = (t - Math.floor(t)) * 2 - 1;
            const v = y;
            const f = wave(u, v, n, m);
            const e = 0.002;
            const gx = (wave(u + e, v, n, m) - f) / e;
            const gy = (wave(u, v + e, n, m) - f) / e;
            // Grains on moving plate jitter hard and drift toward stillness; still ones barely move.
            // Moving plate throws grains hard; the still lines never stop buzzing either.
            const shake = (Math.min(1, Math.abs(f)) * 0.03 + hum) * amount;
            x += -f * gx * 0.0022 * amount * (1 - 0.6 * kick) + (Math.random() - 0.5) * shake;
            y += -f * gy * 0.0022 * amount * (1 - 0.6 * kick) + (Math.random() - 0.5) * shake;
            const dx = x - pointer.x;
            const dy = y - pointer.y;
            if (dx * dx + dy * dy < 0.02) {
              x += (Math.random() - 0.5) * 0.06;
              y += (Math.random() - 0.5) * 0.06;
            }
            if (x < -aspect) x += 2 * aspect;
            if (x > aspect) x -= 2 * aspect;
            positions[k] = x;
            positions[k + 1] = Math.max(-1, Math.min(1, y));
          }
          geometry.attributes.position.needsUpdate = true;
        };

        let frame = 0;
        if (calm) {
          // No motion: settle one figure once and show it still.
          changedAt = 0;
          for (let i = 0; i < 400; i++) step(MODE_MS - 1, 1);
          renderer.render(scene, camera);
        } else {
          const loop = (now: number) => {
            frame = requestAnimationFrame(loop);
            if (!visible) return;
            step(now, 1);
            renderer.render(scene, camera);
          };
          frame = requestAnimationFrame(loop);
        }

        cleanup = () => {
          cancelAnimationFrame(frame);
          ro.disconnect();
          vio.disconnect();
          el.parentElement?.removeEventListener("pointermove", onMove);
          el.parentElement?.removeEventListener("pointerleave", onLeave);
          geometry.dispose();
          material.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      },
      { rootMargin: "300px" }
    );
    io.observe(el);

    return () => {
      disposed = true;
      io.disconnect();
      cleanup();
    };
  }, []);

  return <div ref={host} className={styles.cymatics} aria-hidden="true" />;
}
