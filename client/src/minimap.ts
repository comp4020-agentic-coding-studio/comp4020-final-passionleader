// A small map of the campus outside (plan 53), desktop only, under the HUD:
// where you can walk, the buildings, the doors you can go through with their
// names, and you. North is up, as the camera looks. Drawn on a canvas each
// frame while you're outside; hidden indoors and on phones (their corners
// hold the touch controls).

export interface MapArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function mountMinimap(view: {
  /** The map's world bounds (x west-east, z north-south). */
  bounds: MapArea;
  /** Where you can walk. */
  areas: MapArea[];
  /** Buildings, drawn as blocks. */
  buildings: (MapArea & { name: string })[];
  /** Doors and places, labelled. */
  places: { x: number; z: number; name: string }[];
}): { show(on: boolean): void; draw(x: number, z: number, heading: number): void; mark(spots: { x: number; z: number }[]): void } {
  // As tall as fits; as wide as the campus is, so no empty strip at the side.
  const { bounds: b } = view;
  const pad = 8;
  const H = 130;
  const scale = (H - pad * 2) / (b.maxZ - b.minZ);
  const W = Math.round((b.maxX - b.minX) * scale + pad * 2);
  const canvas = document.createElement("canvas");
  canvas.id = "minimap";
  canvas.width = W * 2;
  canvas.height = H * 2;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  canvas.setAttribute("aria-hidden", "true");
  canvas.hidden = true;
  document.body.append(canvas);
  const ctx = canvas.getContext("2d")!;
  // Wide and not a touch screen first (touch screens put controls in the corners).
  const desktop = window.matchMedia("(min-width: 701px) and (not (pointer: coarse))");
  const px = (x: number): number => (pad + (x - b.minX) * scale) * 2;
  const pz = (z: number): number => (pad + (z - b.minZ) * scale) * 2;
  let on = false;
  // Where an event is on now (a small amber star), set by main from the events timetable.
  let marks: { x: number; z: number }[] = [];

  // Each place's label goes where it overlaps nothing labelled before it: above
  // its dot, else below, right or left, kept inside the map (the 11/4 sweep:
  // ANU Sport and Housing, Hub and Classrooms were printed over each other).
  // A building whose door is a labelled place isn't named twice.
  const named = new Set(view.places.map((p) => p.name));
  const blocks = view.buildings.filter((bd) => !named.has(bd.name));
  ctx.font = "600 16px system-ui, sans-serif";
  const taken: { x: number; y: number; w: number; h: number }[] = blocks.map((bd) => {
    const w = ctx.measureText(bd.name).width;
    return { x: px((bd.minX + bd.maxX) / 2) - w / 2, y: pz((bd.minZ + bd.maxZ) / 2) - 12, w, h: 18 };
  });
  const hits = (r: { x: number; y: number; w: number; h: number }): boolean =>
    taken.some((t) => r.x < t.x + t.w + 4 && t.x < r.x + r.w + 4 && r.y < t.y + t.h && t.y < r.y + r.h);
  const labels = view.places.map((p) => {
    const w = ctx.measureText(p.name).width;
    const h = 16;
    const x0 = px(p.x);
    const y0 = pz(p.z);
    const tries = [
      { x: x0 - w / 2, y: y0 - 8 - h },
      { x: x0 - w / 2, y: y0 + 8 },
      { x: x0 + 9, y: y0 - h / 2 },
      { x: x0 - 9 - w, y: y0 - h / 2 },
    ].map((r) => ({ x: Math.min(Math.max(r.x, 6), canvas.width - 6 - w), y: Math.min(Math.max(r.y, 4), canvas.height - 4 - h), w, h }));
    const at = tries.find((r) => !hits(r)) ?? tries[0];
    taken.push(at);
    return { name: p.name, x: at.x, y: at.y + h - 3 };
  });

  return {
    show(want) {
      on = want && desktop.matches;
      canvas.hidden = !on;
    },
    mark(spots) {
      marks = spots;
    },
    draw(x, z, heading) {
      if (!on) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(252, 248, 236, 0.9)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#d9d3c4";
      for (const a of view.areas) ctx.fillRect(px(a.minX), pz(a.minZ), (a.maxX - a.minX) * scale * 2, (a.maxZ - a.minZ) * scale * 2);
      ctx.fillStyle = "#8a9aa8";
      for (const bd of view.buildings) ctx.fillRect(px(bd.minX), pz(bd.minZ), (bd.maxX - bd.minX) * scale * 2, (bd.maxZ - bd.minZ) * scale * 2);
      ctx.font = "600 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      for (const bd of blocks) ctx.fillText(bd.name, px((bd.minX + bd.maxX) / 2), pz((bd.minZ + bd.maxZ) / 2) + 6);
      ctx.font = "600 16px system-ui, sans-serif";
      ctx.fillStyle = "#6b3f1d";
      for (const p of view.places) {
        ctx.beginPath();
        ctx.arc(px(p.x), pz(p.z), 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.textAlign = "left";
      ctx.fillStyle = "#3b2a12";
      for (const l of labels) ctx.fillText(l.name, l.x, l.y);
      // An event on now: an amber star with a dark rim, so it reads on grey and on paths.
      for (const m of marks) {
        const sx = px(m.x);
        const sz = pz(m.z) - 14;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 9 : 4;
          const a = (Math.PI / 5) * i - Math.PI / 2;
          ctx.lineTo(sx + Math.cos(a) * r, sz + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = "#f2a900";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#3b2a12";
        ctx.stroke();
      }
      // You: a dot with a nose in the direction you face.
      const cx = px(x);
      const cz = pz(z);
      ctx.fillStyle = "#c0392b";
      ctx.beginPath();
      ctx.arc(cx, cz, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c0392b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, cz);
      ctx.lineTo(cx + Math.sin(heading) * 18, cz + Math.cos(heading) * 18);
      ctx.stroke();
      ctx.strokeStyle = "rgba(59, 42, 18, 0.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    },
  };
}
