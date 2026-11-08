import "./filepick.css";

// A file input dressed as the app's own button (the user, 11/9: the browser's "Browse…" looked out
// of place): the real input stays in the page, visually hidden but focusable, so the keyboard,
// screen readers and the form's code use it as before; the button opens it, and the line beside it
// names what's chosen. Returns the wrapper to put where the input went.
export function prettyFile(input: HTMLInputElement, text = "📎 Choose a file"): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "filepick";
  input.classList.add("filepick-input");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "filepick-btn";
  button.textContent = input.multiple && text === "📎 Choose a file" ? "📎 Choose files" : text;
  // The input itself is skipped by Tab (the button stands for it), so focus never lands on nothing.
  input.tabIndex = -1;
  button.addEventListener("click", () => input.click());
  const names = document.createElement("span");
  names.className = "filepick-names";
  names.setAttribute("aria-live", "polite");
  const show = (): void => {
    const files = [...(input.files ?? [])];
    names.textContent = files.length === 0 ? "No file chosen" : files.length === 1 ? files[0]!.name : `${files.length} files: ${files.map((f) => f.name).join(", ")}`;
  };
  input.addEventListener("change", show);
  // A form clearing `input.value` doesn't fire "change": look again whenever the button is shown.
  new MutationObserver(show).observe(wrap, { attributes: true, attributeFilter: ["hidden"] });
  button.addEventListener("focus", show);
  show();
  wrap.append(button, names, input);
  // Hiding the input (an edit, say) hides the whole picker.
  new MutationObserver(() => (wrap.hidden = input.hidden)).observe(input, { attributes: true, attributeFilter: ["hidden"] });
  wrap.hidden = input.hidden;
  return wrap;
}

/** Clears a pretty file input and its line of names. */
export function clearFile(input: HTMLInputElement): void {
  input.value = "";
  input.dispatchEvent(new Event("change"));
}
