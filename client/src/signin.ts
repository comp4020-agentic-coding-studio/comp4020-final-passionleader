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
  /** Checks the code before the next steps; an error message, or null. */
  signupCheck(who: AnuWho, code: string): Promise<string | null>;
  signupFinish(who: AnuWho, code: string, name: string, password: string): Promise<Session | string>;
  resetStart(who: AnuWho): Promise<string | null>;
  resetFinish(who: AnuWho, code: string, password: string): Promise<Session | string>;
  entered(s: Session): void;
}): { show(message?: string): void; showSignup(): void; hide(): void; isOpen(): boolean } {
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

  // ---- View 1: sign in ----
  function buildSignIn(): { form: HTMLFormElement; focus: () => void; clear: (msg?: string) => void } {
    const form = el("form", "si-form");
    form.noValidate = true;
    const name = field("Name or student number", { autocomplete: "username", maxLength: 80, required: true, placeholder: "u1234567, your name, or staff email" });
    const pw = field("Password", { autocomplete: "current-password", type: "password" });
    const error = el("p", "si-error");
    error.setAttribute("role", "alert");
    const submit = primary("Sign in");
    const signup = primary("Sign up with your ANU email");
    signup.type = "button";
    signup.classList.add("si-signup");
    const guest = link("Continue as a guest");
    const forgot = link("Forgot password?");
    const links = el("div", "si-links");
    links.append(guest, forgot);
    const guestHint = el("p", "si-hint", "Guests can walk, chat and look around; posting, notes and comments need signing up.");
    guestHint.id = nextId("hint");
    guest.setAttribute("aria-describedby", guestHint.id);
    form.append(name.wrap, pw.wrap, error, submit, signup, links, guestHint);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = name.input.value.trim();
      if (!n) return void (error.textContent = "Enter your name or student number.");
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

  // ---- View 2: sign up, four steps (who, code, name, password), one field each ----
  function buildSignupWizard(): { form: HTMLFormElement; focus: () => void; clear: (msg?: string) => void } {
    const form = el("form", "si-form si-wizard");
    form.noValidate = true;
    const bar = el("div", "si-progress");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "1");
    bar.setAttribute("aria-valuemax", "4");
    const segs = [0, 1, 2, 3].map(() => el("span", "si-seg"));
    bar.append(...segs);
    form.append(bar, el("h2", "si-h2", "Sign up with your ANU email"));

    const mkStep = (hint: string): { step: HTMLDivElement; error: HTMLParagraphElement; actions: HTMLDivElement } => {
      const step = el("div", "si-step");
      step.append(el("p", "si-hint", hint));
      const error = el("p", "si-error");
      error.setAttribute("role", "alert");
      const actions = el("div", "si-actions");
      return { step, error, actions };
    };
    const backBtn = (): HTMLButtonElement => link("← Back");

    // Step 1: who.
    const s1 = mkStep("We email a 6-digit code to your ANU address to check it's you. Your email is never shown to anyone.");
    const student = field("Student number", { autocomplete: "username", maxLength: 8, placeholder: "u1234567", inputMode: "text" });
    const staffRow = el("label", "si-check");
    const staffBox = el("input");
    staffBox.type = "checkbox";
    staffRow.append(staffBox, document.createTextNode(" I'm ANU staff"));
    const staff = field("ANU staff email", { autocomplete: "email", type: "email", maxLength: 80, placeholder: "name@anu.edu.au", inputMode: "email" });
    staff.wrap.hidden = true;
    const send = primary("Send code");
    const to1 = link("← Back to sign in");
    s1.actions.append(send, to1);
    s1.step.append(student.wrap, staffRow, staff.wrap, s1.error, s1.actions);

    // Step 2: the code.
    const s2 = mkStep("");
    const sent = s2.step.firstElementChild as HTMLElement;
    sent.className = "si-note";
    sent.setAttribute("role", "status");
    const code = field("6-digit code", { autocomplete: "one-time-code", maxLength: 6, placeholder: "123456", inputMode: "numeric" });
    const next2 = primary("Continue");
    const resend = link("Send a new code");
    const back2 = backBtn();
    s2.actions.append(next2, back2, resend);
    s2.step.append(code.wrap, s2.error, s2.actions);

    // Step 3: the name.
    const s3 = mkStep("Shown above your head. 1–8 letters, digits or underscores.");
    const name = field("Name", { autocomplete: "off", maxLength: 8, placeholder: "e.g. kim_22" });
    const next3 = primary("Continue");
    const back3 = backBtn();
    s3.actions.append(next3, back3);
    s3.step.append(name.wrap, s3.error, s3.actions);

    // Step 4: the password, twice.
    const s4 = mkStep(`${MIN_PASSWORD}+ characters. Not your ANU password.`);
    const pw1 = field("Password", { autocomplete: "new-password", type: "password", maxLength: 100 });
    const pw2 = field("Password again", { autocomplete: "new-password", type: "password", maxLength: 100 });
    const finish = primary("Create account");
    const back4 = backBtn();
    s4.actions.append(finish, back4);
    s4.step.append(pw1.wrap, pw2.wrap, s4.error, s4.actions);

    const steps = [s1, s2, s3, s4];
    const focusOf = [() => (staffBox.checked ? staff.input : student.input).focus(), () => code.input.focus(), () => name.input.focus(), () => pw1.input.focus()];
    const stage = el("div", "si-stage");
    stage.append(...steps.map((x) => x.step));
    form.append(stage);

    let at = 0;
    const paint = (): void => {
      segs.forEach((sg, i) => sg.classList.toggle("is-on", i <= at));
      bar.setAttribute("aria-valuenow", String(at + 1));
      bar.setAttribute("aria-label", `Step ${at + 1} of 4`);
    };

    /** Slides to step n: the old one out to the left (or right going back), the new one in from the other side. */
    function goStep(n: number, focus = true): void {
      if (n === at && !steps[n]!.step.hidden) return;
      const from = steps[at]!.step;
      const to = steps[n]!.step;
      const dir = n > at ? 1 : -1;
      at = n;
      paint();
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches || typeof to.animate !== "function";
      for (const [i, x] of steps.entries()) if (i !== n && x.step !== from) x.step.hidden = true;
      to.hidden = false;
      if (focus) focusOf[n]!();
      if (still || from === to || from.hidden) {
        from.hidden = from === to;
        return;
      }
      const opts: KeyframeAnimationOptions = { duration: 250, easing: "ease", fill: "both" };
      from.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${-dir * 40}px)`, opacity: 0 }], opts);
      window.setTimeout(() => {
        if (steps[at]!.step !== from) from.hidden = true;
      }, 260);
      to.animate([{ transform: `translateX(${dir * 40}px)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], opts);
    }

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
      s1.error.textContent = "";
      (staffBox.checked ? staff.input : student.input).focus();
    });

    const sendCode = (resending: boolean): void => {
      const err = resending ? s2.error : s1.error;
      const w = who();
      if (typeof w === "string") return void (err.textContent = w);
      void run(
        form,
        err,
        async () => await opts.signupStart(w),
        () => {
          const to = "email" in w ? w.email : `${w.studentNo}@anu.edu.au`;
          sent.textContent = `${resending ? "A new code went" : "We sent a code"} to ${to}. Check your inbox (and junk) for an email from no-reply@passionleader.click. Not your address? Go back.`;
          code.input.value = "";
          if (!resending) goStep(1);
          else code.input.focus();
        },
      );
    };
    const toName = (): void => {
      const c = code.input.value.trim();
      if (!CODE_RE.test(c)) return void (s2.error.textContent = "Enter the 6-digit code from the email.");
      const w = who();
      if (typeof w === "string") return void goStep(0), void (s1.error.textContent = w);
      // The server checks it now, so a wrong code stops here, not after the password.
      void run(
        form,
        s2.error,
        async () => await opts.signupCheck(w, c),
        () => {
          s2.error.textContent = "";
          goStep(2);
        },
      );
    };
    const toPassword = (): void => {
      const n = name.input.value.trim();
      if (!NAME_RE.test(n)) return void (s3.error.textContent = "Name: 1–8 letters, digits or underscores.");
      if (/^(qa_|guest)/i.test(n)) return void (s3.error.textContent = "That name is kept. Pick another.");
      s3.error.textContent = "";
      goStep(3);
    };
    const create = (): void => {
      const w = who();
      if (typeof w === "string") return void goStep(0), void (s1.error.textContent = w);
      if (pw1.input.value.length < MIN_PASSWORD) return void (s4.error.textContent = `Password: at least ${MIN_PASSWORD} characters.`);
      if (pw1.input.value !== pw2.input.value) return void (s4.error.textContent = "The two passwords don't match.");
      void run(
        form,
        s4.error,
        async () => {
          const r = await opts.signupFinish(w, code.input.value.trim(), name.input.value.trim(), pw1.input.value);
          // The server checks the code and the name only now: take the person to the step that needs fixing.
          if (typeof r === "string") {
            const low = r.toLowerCase();
            if (/code/.test(low)) return void (s2.error.textContent = r), goStep(1), null;
            if (/email|account already/.test(low)) return void (s1.error.textContent = r), goStep(0), null;
            if (/name|taken/.test(low)) return void (s3.error.textContent = r), goStep(2), null;
          }
          return r;
        },
        (s) => s && enter(s),
      );
    };

    send.addEventListener("click", () => sendCode(false));
    resend.addEventListener("click", () => sendCode(true));
    next2.addEventListener("click", toName);
    next3.addEventListener("click", toPassword);
    finish.addEventListener("click", create);
    to1.addEventListener("click", () => go("signin"));
    back2.addEventListener("click", () => goStep(0));
    back3.addEventListener("click", () => goStep(1));
    back4.addEventListener("click", () => goStep(2));
    // Enter in a field presses its step's button. The buttons are all type=button: a submit
    // button would make Enter click the first one in the form (step 1's), whatever step is up.
    const press = (): void => [() => sendCode(false), toName, toPassword, create][at]!();
    form.addEventListener("submit", (e) => e.preventDefault());
    form.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement) || e.target.type === "checkbox") return;
      e.preventDefault();
      if (!form.hasAttribute("aria-busy")) press();
    });
    for (const b of [send, next2, next3, finish]) b.type = "button";

    const reset = (): void => {
      for (const i of [student.input, staff.input, code.input, name.input, pw1.input, pw2.input]) i.value = "";
      staffBox.checked = false;
      student.wrap.hidden = false;
      staff.wrap.hidden = true;
      for (const x of steps) x.error.textContent = "";
      at = 0;
      steps.forEach((x, i) => (x.step.hidden = i !== 0));
      paint();
    };
    reset();
    return { form, focus: () => focusOf[at]!(), clear: (msg) => (reset(), void (msg && (s1.error.textContent = msg))) };
  }

  const built = { signin: buildSignIn(), signup: buildSignupWizard(), reset: buildCodeFlow("reset") };
  let open = !root.hidden;

  function go(v: View, message?: string): void {
    for (const k of Object.keys(built) as View[]) built[k].form.hidden = k !== v;
    card.classList.toggle("si-compact", v === "signup");
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
    showSignup(): void {
      open = true;
      root.hidden = false;
      go("signup");
    },
    hide(): void {
      open = false;
      root.hidden = true;
    },
    isOpen: () => open && !root.hidden,
  };
}
