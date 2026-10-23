// The join screen: sign in, sign up with an ANU email, reset a forgotten
// password, or carry on as a guest. Self-contained: it clears and rebuilds
// <div id="join"> and switches between its four views in place. main.ts only
// passes the requests (they resolve to a Session, or an error message to show).

import "./signin.css";
import type { AnuWho, Session } from "./api.ts";

type View = "signin" | "signup" | "reset";

const NAME_RE = /^[A-Za-z0-9_]{1,8}$/;
const CODE_RE = /^\d{6}$/;
const STUDENT_RE = /^u\d{7}$/i;
const STAFF_RE = /^[^\s@]+@anu\.edu\.au$/i;
const MIN_PASSWORD = 8;

export function mountSignIn(opts: {
  /** Resolve to a Session, or an error message to show. */
  signIn(name: string, password: string): Promise<Session | string>;
  guest(): Promise<Session | string>;
  signupStart(who: AnuWho): Promise<string | null>;
  signupFinish(who: AnuWho, code: string, name: string, password: string): Promise<Session | string>;
  resetStart(who: AnuWho): Promise<string | null>;
  resetFinish(who: AnuWho, code: string, password: string): Promise<Session | string>;
  entered(s: Session): void;
  customise(): void;
}): { show(message?: string): void; hide(): void; isOpen(): boolean } {
  const root = document.getElementById("join");
  if (!root) throw new Error("#join is missing");
  root.replaceChildren();
  root.classList.add("si-root");

  let uid = 0;
  const nextId = (p: string): string => `si-${p}-${++uid}`;

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** A labelled input; the label sits above it, an optional hint under the label. */
  function field(label: string, attrs: Partial<HTMLInputElement> & { autocomplete: string }, hint?: string): { wrap: HTMLDivElement; input: HTMLInputElement } {
    const wrap = el("div", "si-field");
    const input = el("input", "si-input");
    input.id = nextId("in");
    Object.assign(input, attrs);
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocorrect", "off");
    input.spellcheck = false;
    const lab = el("label", undefined, label);
    lab.htmlFor = input.id;
    wrap.append(lab);
    if (hint) {
      const h = el("p", "si-hint", hint);
      h.id = nextId("hint");
      input.setAttribute("aria-describedby", h.id);
      wrap.append(h);
    }
    wrap.append(input);
    return { wrap, input };
  }

  const primary = (text: string): HTMLButtonElement => {
    const b = el("button", "si-primary", text);
    b.type = "submit";
    return b;
  };
  const secondary = (text: string): HTMLButtonElement => {
    const b = el("button", "si-secondary", text);
    b.type = "button";
    return b;
  };
  const link = (text: string): HTMLButtonElement => {
    const b = el("button", "si-link", text);
    b.type = "button";
    return b;
  };

  // The heading, always shown above whichever view is up.
  const card = el("div", "si-card");
  const title = el("h1", undefined, "ANU Crossing (Unofficial)");
  title.id = "join-title";
  const pitch = el("p", "join-pitch", "This isn't a game. It's a place to meet and talk!");
  const sub = el("p", "join-sub", "A small 3D space to run into people: students, staff, anyone. Not an official ANU service.");
  const views = el("div", "si-views");
  const flavour = el("ul", "si-flavour");
  for (const line of ["WASD to walk, Space to jump.", "Q for the menu: wave, dance, stick a note.", "E to read a note or go through a door. Enter to chat."]) {
    flavour.append(el("li", undefined, line));
  }
  card.append(title, pitch, sub, views, flavour);
  root.append(card);

  /** Runs a request with its buttons off and its error line cleared; a string result is an error. */
  async function run(form: HTMLFormElement, error: HTMLElement, request: () => Promise<Session | string | null>, onOk: (r: Session | null) => void): Promise<void> {
    const buttons = [...form.querySelectorAll<HTMLButtonElement>("button")];
    for (const b of buttons) b.disabled = true;
    form.setAttribute("aria-busy", "true");
    error.textContent = "";
    try {
      const r = await request();
      if (typeof r === "string") error.textContent = r;
      else onOk(r);
    } catch {
      error.textContent = "Something went wrong. Try again.";
    } finally {
      for (const b of buttons) b.disabled = false;
      form.removeAttribute("aria-busy");
    }
  }

  const enter = (s: Session): void => {
    opts.entered(s);
  };

  /** The customise button and the guest button share the sign-in view; this makes the former. */
  function customiseButton(): HTMLButtonElement {
    const b = el("button", "si-customise", "👕 Customise look");
    b.type = "button";
    b.addEventListener("click", () => opts.customise());
    return b;
  }

  // ---- View 1: sign in ----
  function buildSignIn(): { form: HTMLFormElement; focus: () => void; clear: (msg?: string) => void } {
    const form = el("form", "si-form");
    form.noValidate = true;
    const name = field("Name", { autocomplete: "username", maxLength: 12, required: true, placeholder: "u1234567 or your name" });
    const pw = field("Password", { autocomplete: "current-password", type: "password" });
    const error = el("p", "si-error");
    error.setAttribute("role", "alert");
    const submit = primary("Sign in");
    const signup = link("Sign up with your ANU email");
    const forgot = link("Forgot password?");
    const links = el("div", "si-links");
    links.append(signup, forgot);
    const rule = el("p", "si-or", "or");
    const guest = secondary("Continue as a guest");
    const guestHint = el("p", "si-hint", "Guests can walk, chat and stick notes. Posting and commenting need signing up.");
    guestHint.id = nextId("hint");
    guest.setAttribute("aria-describedby", guestHint.id);
    form.append(name.wrap, pw.wrap, error, submit, links, rule, guest, guestHint, customiseButton());

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = name.input.value.trim();
      if (!n) return void (error.textContent = "Enter your name.");
      if (!pw.input.value) return void (error.textContent = "Enter your password, or continue as a guest.");
      void run(form, error, () => opts.signIn(n, pw.input.value), (s) => s && enter(s));
    });
    guest.addEventListener("click", () => void run(form, error, () => opts.guest(), (s) => s && enter(s)));
    signup.addEventListener("click", () => go("signup"));
    forgot.addEventListener("click", () => go("reset"));
    return {
      form,
      focus: () => name.input.focus(),
      clear: (msg) => {
        pw.input.value = "";
        error.textContent = msg ?? "";
      },
    };
  }

  // ---- Views 2 and 3: sign up / reset share the who-then-code shape ----
  function buildCodeFlow(kind: "signup" | "reset"): { form: HTMLFormElement; focus: () => void; clear: (msg?: string) => void } {
    const signup = kind === "signup";
    const form = el("form", "si-form");
    form.noValidate = true;
    form.append(el("h2", "si-h2", signup ? "Sign up with your ANU email" : "Forgot your password?"));
    form.append(
      el(
        "p",
        "si-hint",
        signup ? "We email a 6-digit code to your ANU address to check it's you. Your email is never shown to anyone." : "We email a 6-digit code to your ANU address so you can set a new password.",
      ),
    );

    // Step 1: who.
    const step1 = el("div", "si-step");
    const student = field("Student number", { autocomplete: "username", maxLength: 8, placeholder: "u1234567", inputMode: "text" });
    const staffRow = el("label", "si-check");
    const staffBox = el("input");
    staffBox.type = "checkbox";
    staffRow.append(staffBox, document.createTextNode(" I'm ANU staff"));
    const staff = field("ANU staff email", { autocomplete: "email", type: "email", maxLength: 80, placeholder: "name@anu.edu.au", inputMode: "email" });
    staff.wrap.hidden = true;
    const error1 = el("p", "si-error");
    error1.setAttribute("role", "alert");
    const send = primary("Send code");
    step1.append(student.wrap, staffRow, staff.wrap, error1, send);

    // Step 2: code, name (sign-up only), password twice.
    const step2 = el("div", "si-step");
    step2.hidden = true;
    const sent = el("p", "si-note");
    sent.setAttribute("role", "status");
    const code = field("6-digit code", { autocomplete: "one-time-code", maxLength: 6, placeholder: "123456", inputMode: "numeric" });
    const name = field("Name", { autocomplete: "off", maxLength: 8, placeholder: "e.g. kim_22" }, "1–8 letters, digits or underscores; shown above your head.");
    const pw1 = field(signup ? "Password" : "New password", { autocomplete: "new-password", type: "password", maxLength: 100 }, `${MIN_PASSWORD}+ characters. Not your ANU password.`);
    const pw2 = field("Password again", { autocomplete: "new-password", type: "password", maxLength: 100 });
    const error2 = el("p", "si-error");
    error2.setAttribute("role", "alert");
    const finish = primary(signup ? "Create account" : "Set password");
    const resend = link("Send a new code");
    step2.append(sent, code.wrap, ...(signup ? [name.wrap] : []), pw1.wrap, pw2.wrap, error2, finish, resend);

    const back = link("← Back to sign in");
    form.append(step1, step2, back);

    // One error line is shown at a time (the step that is up); each is its own role="alert".
    const errorNow = (): HTMLElement => (step2.hidden ? error1 : error2);

    const who = (): AnuWho | string => {
      if (staffBox.checked) {
        const email = staff.input.value.trim().toLowerCase();
        return STAFF_RE.test(email) ? { staff: true, email } : "Enter your @anu.edu.au email address.";
      }
      const studentNo = student.input.value.trim().toLowerCase();
      return STUDENT_RE.test(studentNo) ? { studentNo } : "Enter your student number, like u1234567.";
    };

    staffBox.addEventListener("change", () => {
      student.wrap.hidden = staffBox.checked;
      staff.wrap.hidden = !staffBox.checked;
      error1.textContent = "";
      (staffBox.checked ? staff.input : student.input).focus();
    });

    const sendCode = (): void => {
      const w = who();
      if (typeof w === "string") return void (errorNow().textContent = w);
      void run(
        form,
        errorNow(),
        async () => (signup ? await opts.signupStart(w) : await opts.resetStart(w)),
        () => {
          step1.hidden = true;
          step2.hidden = false;
          sent.textContent = "Check your inbox (and junk) for a code from no-reply@passionleader.click.";
          code.input.focus();
        },
      );
    };
    resend.addEventListener("click", () => {
      const w = who();
      if (typeof w === "string") return void (error2.textContent = w);
      void run(
        form,
        error2,
        async () => (signup ? await opts.signupStart(w) : await opts.resetStart(w)),
        () => {
          sent.textContent = "A new code is on its way. Check your inbox (and junk) for a code from no-reply@passionleader.click.";
          code.input.value = "";
          code.input.focus();
        },
      );
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      // Enter on the first step sends the code; on the second it finishes.
      if (!step1.hidden) return sendCode();
      const w = who();
      if (typeof w === "string") return void (error2.textContent = w);
      const c = code.input.value.trim();
      if (!CODE_RE.test(c)) return void (error2.textContent = "Enter the 6-digit code from the email.");
      const n = name.input.value.trim();
      if (signup && !NAME_RE.test(n)) return void (error2.textContent = "Name: 1–8 letters, digits or underscores.");
      if (pw1.input.value.length < MIN_PASSWORD) return void (error2.textContent = `Password: at least ${MIN_PASSWORD} characters.`);
      if (pw1.input.value !== pw2.input.value) return void (error2.textContent = "The two passwords don't match.");
      void run(
        form,
        error2,
        () => (signup ? opts.signupFinish(w, c, n, pw1.input.value) : opts.resetFinish(w, c, pw1.input.value)),
        (s) => s && enter(s),
      );
    });
    back.addEventListener("click", () => go("signin"));

    const reset = (): void => {
      step1.hidden = false;
      step2.hidden = true;
      for (const i of [student.input, staff.input, code.input, name.input, pw1.input, pw2.input]) i.value = "";
      staffBox.checked = false;
      student.wrap.hidden = false;
      staff.wrap.hidden = true;
      error1.textContent = "";
      error2.textContent = "";
    };
    return { form, focus: () => student.input.focus(), clear: (msg) => (reset(), void (msg && (error1.textContent = msg))) };
  }

  const built = { signin: buildSignIn(), signup: buildCodeFlow("signup"), reset: buildCodeFlow("reset") };
  let open = !root.hidden;

  function go(v: View, message?: string): void {
    for (const k of Object.keys(built) as View[]) built[k].form.hidden = k !== v;
    built[v].clear(message);
    views.replaceChildren(built[v].form);
    built[v].focus();
  }

  go("signin");

  return {
    show(message?: string): void {
      open = true;
      root.hidden = false;
      go("signin", message);
    },
    hide(): void {
      open = false;
      root.hidden = true;
    },
    isOpen: () => open && !root.hidden,
  };
}
