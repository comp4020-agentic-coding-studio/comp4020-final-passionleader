import "./mute.css";

// "Tell me when they're on": the people you follow (up to 20, by name; add them from "Who's here")
// and the one choice a followed person has: whether people they don't follow back may be told when
// they come onto the campus (default: only mutual follows). Members only; the server checks all of it.

export interface FollowsState {
  follows: string[];
  max: number;
  mutualOnly: boolean;
}
export interface FollowsDeps {
  load(): Promise<FollowsState>;
  /** Follows or unfollows; resolves with an error text, or null. */
  follow(name: string, on: boolean): Promise<string | null>;
  setMutualOnly(on: boolean): Promise<string | null>;
}

export function mountFollows(deps: FollowsDeps): { open(): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "follows-dialog";
  root.className = "mute-dialog-like";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "follows-title");
  const card = document.createElement("div");
  card.className = "settings-card mute-card";
  const title = document.createElement("h2");
  title.id = "follows-title";
  title.textContent = "🔔 Tell me when they're on";
  const hint = document.createElement("p");
  hint.className = "mute-hint";
  const list = document.createElement("ul");
  list.className = "mute-list";
  list.setAttribute("aria-label", "People you follow");
  const mutualLabel = document.createElement("label");
  mutualLabel.className = "settings-check";
  const mutual = document.createElement("input");
  mutual.type = "checkbox";
  mutualLabel.append(mutual, " Let people I don't follow back be told when I'm on the campus");
  const status = document.createElement("p");
  status.className = "mute-hint";
  status.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  actions.append(close);
  card.append(title, hint, list, mutualLabel, status, actions);
  root.append(card);
  document.body.append(root);

  function draw(s: FollowsState): void {
    hint.textContent = `You get one notice when someone you follow comes onto the campus, with the place's name only. Follow up to ${s.max} people from "Who's here" (members only).`;
    mutual.checked = !s.mutualOnly;
    list.replaceChildren();
    if (!s.follows.length) {
      const li = document.createElement("li");
      li.className = "mute-empty";
      li.textContent = "You aren't following anyone yet.";
      list.append(li);
    }
    for (const name of s.follows) {
      const li = document.createElement("li");
      const who = document.createElement("span");
      who.textContent = name;
      const un = document.createElement("button");
      un.type = "button";
      un.textContent = "Unfollow";
      un.setAttribute("aria-label", `Unfollow ${name}`);
      un.addEventListener("click", async () => {
        const err = await deps.follow(name, false);
        if (err) status.textContent = err;
        else await refresh();
      });
      li.append(who, un);
      list.append(li);
    }
  }
  async function refresh(): Promise<void> {
    try {
      draw(await deps.load());
      status.textContent = "";
    } catch {
      status.textContent = "Couldn't load your list. Try again.";
    }
  }
  mutual.addEventListener("change", async () => {
    const err = await deps.setMutualOnly(!mutual.checked);
    status.textContent = err ?? "Saved.";
    if (err) await refresh();
  });

  const hide = (): void => {
    root.hidden = true;
  };
  close.addEventListener("click", hide);
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });
  return {
    open() {
      root.hidden = false;
      status.textContent = "Loading…";
      void refresh().then(() => close.focus());
    },
    isOpen: () => !root.hidden,
  };
}
