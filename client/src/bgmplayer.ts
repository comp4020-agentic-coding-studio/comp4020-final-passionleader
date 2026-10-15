// The small music box at the top right: the playing track's name, a
// play/pause button and a next button. Desktop only (bgmplayer.css hides it on
// phones). The buttons give focus back to the game so WASD and E keep working.

import "./bgmplayer.css";
import { isPaused, nextTrack, nowPlaying, onTrackChange, togglePause } from "./audio.ts";

export function mountBgmPlayer(): void {
  const root = document.createElement("div");
  root.id = "bgm-player";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Music player");

  const icon = document.createElement("span");
  icon.className = "bgm-icon";
  icon.textContent = "🎵";
  icon.setAttribute("aria-hidden", "true");

  const title = document.createElement("span");
  title.className = "bgm-title";
  title.setAttribute("aria-live", "polite");

  const play = document.createElement("button");
  play.type = "button";
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "⏭";
  next.setAttribute("aria-label", "Next track");

  root.append(icon, title, play, next);
  document.body.append(root);

  const render = (): void => {
    const name = nowPlaying();
    title.textContent = name ?? "No music yet";
    title.title = name ?? "";
    play.textContent = isPaused() ? "▶" : "⏸";
    play.setAttribute("aria-label", isPaused() ? "Play music" : "Pause music");
  };

  play.addEventListener("click", () => {
    togglePause();
    play.blur();
  });
  next.addEventListener("click", () => {
    nextTrack();
    next.blur();
  });

  onTrackChange(render);
  render();
}
