import "./dogprompt.css";

// The dog on the lawn looks hungry. Pressing E beside it asks whether to
// buy it some food; yes shows a "Buy me a feed" button that opens my Buy Me
// a Coffee page in a new tab (the site refuses to be framed, so no in-app
// window). The button is drawn here to match Buy Me a Coffee's own widget:
// their script writes the button with document.writeln, which only works
// while a page is first loading, not in a dialog opened later.

const PAGE = "https://buymeacoffee.com/sskim";

export function mountDogPrompt(opts: { onFeed(): void }): { open(): void; isOpen(): boolean } {
  const root = document.createElement("div");
  root.id = "dog-prompt";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "dog-prompt-title");

  const card = document.createElement("div");
  card.className = "settings-card dog-card";
  const title = document.createElement("h2");
  title.id = "dog-prompt-title";
  title.textContent = "🐶 The dog looks hungry.";
  const ask = document.createElement("p");
  ask.className = "dog-ask";
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const no = document.createElement("button");
  no.type = "button";
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "dog-yes";
  actions.append(no, yes);

  const feed = document.createElement("a");
  feed.className = "bmc-button";
  feed.href = PAGE;
  feed.target = "_blank";
  feed.rel = "noopener";
  feed.innerHTML = '<span aria-hidden="true">🐶</span> Buy me a feed';

  card.append(title, ask, feed, actions);
  root.append(card);
  document.body.append(root);

  const show = (asking: boolean): void => {
    ask.textContent = asking ? "Buy it some food?" : "It wags its tail. Tap below to buy it a feed.";
    feed.hidden = asking;
    yes.hidden = !asking;
    no.textContent = asking ? "No" : "Close";
    yes.textContent = "Yes";
  };
  const hide = (): void => {
    root.hidden = true;
  };

  no.addEventListener("click", hide);
  yes.addEventListener("click", () => {
    show(false);
    feed.focus();
  });
  feed.addEventListener("click", () => {
    // The page opens in a new tab; the dialog can go, and the dog is delighted.
    opts.onFeed();
    window.setTimeout(hide, 0);
  });
  root.addEventListener("click", (e) => {
    if (e.target === root) hide();
  });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") hide();
  });

  return {
    open() {
      show(true);
      root.hidden = false;
      yes.focus();
    },
    isOpen: () => !root.hidden,
  };
}
