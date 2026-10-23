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
}): { show(on: boolean): void; draw(x: number, z: number, heading: number): void } {
  const W = 190;
  const H = 168;
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
  const { bounds: b } = view;
  const pad = 8;
  const scale = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxZ - b.minZ));
  const px = (x: number): number => (pad + (x - b.minX) * scale) * 2;
  const pz = (z: number): number => (pad + (z - b.minZ) * scale) * 2;
  let on = false;

  return {
    show(want) {
      on = want && desktop.matches;
      canvas.hidden = !on;
    },
    draw(x, z, heading) {
      if (!on) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(255, 251, 224, 0.88)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#d9d3c4";
      for (const a of view.areas) ctx.fillRect(px(a.minX), pz(a.minZ), (a.maxX - a.minX) * scale * 2, (a.maxZ - a.minZ) * scale * 2);
      ctx.fillStyle = "#8a9aa8";
      for (const bd of view.buildings) ctx.fillRect(px(bd.minX), pz(bd.minZ), (bd.maxX - bd.minX) * scale * 2, (bd.maxZ - bd.minZ) * scale * 2);
      ctx.font = "600 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      for (const bd of view.buildings) ctx.fillText(bd.name, px((bd.minX + bd.maxX) / 2), pz((bd.minZ + bd.maxZ) / 2) + 6);
      ctx.font = "600 16px system-ui, sans-serif";
      for (const p of view.places) {
        ctx.fillStyle = "#6b3f1d";
        ctx.beginPath();
        ctx.arc(px(p.x), pz(p.z), 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3b2a12";
        ctx.fillText(p.name, px(p.x), pz(p.z) - 10);
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
