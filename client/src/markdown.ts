// A small Markdown for board posts: headings, bold, italic, inline code,
// code blocks, lists, quotes and links. It builds DOM nodes with
// textContent only, never innerHTML, so whatever someone writes in a post
// can't become a script or a tag on everyone else's screen. Links open in a
// new tab and only for http(s) addresses. Comments stay plain text.

/** Extras for a caller that wants more than a board post's small Markdown. Without them the output is the board's, unchanged. */
export interface MarkdownOptions {
  /** The deepest # drawn as a heading (default 3; beyond it the line is a paragraph). */
  headings?: number;
  /** The h-level of a single # (default 4: inside a post, the post's title is the big one). */
  topLevel?: number;
  /** A line of --- , *** or ___ draws a rule, a code fence's language becomes a class, lists nest by indent. */
  rich?: boolean;
  /** Marks each block with data-line, its line in `text` (0-based), so a click can find its source. */
  lines?: boolean;
  /** A line that is only ![alt](room-file:ID): the node to draw for it (null: leave it as text). */
  picture?: (alt: string, id: string) => Node | null;
}

const PICTURE = /^!\[([^\]]*)\]\(room-file:([A-Za-z0-9-]+)\)\s*$/;
const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^(\s*)[-*+]\s+/;
const NUMBERED = /^(\s*)\d+[.)]\s+/;

/** Renders `text` as Markdown into a fragment of safe DOM nodes. */
export function renderMarkdown(text: string, opts: MarkdownOptions = {}): DocumentFragment {
  return blocks(text.replace(/\r\n?/g, "\n").split("\n"), 0, opts);
}

function blocks(lines: string[], base: number, opts: MarkdownOptions): DocumentFragment {
  const out = document.createDocumentFragment();
  const maxHead = opts.headings ?? 3;
  const top = opts.topLevel ?? 4;
  const headRe = new RegExp(`^(#{1,${maxHead}})\\s+(.*)$`);
  const stopRe = new RegExp(`^(\`\`\`|#{1,${maxHead}}\\s|>|\\s*[-*+]\\s|\\s*\\d+[.)]\\s)`);
  const mark = <T extends HTMLElement>(el: T, at: number): T => {
    if (opts.lines) el.dataset.line = String(base + at);
    return el;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    // A fenced code block, kept exactly as written.
    if (/^```/.test(line)) {
      const at = i;
      const lang = /^```\s*([\w+#.-]+)/.exec(line)?.[1];
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) code.push(lines[i++]!);
      i++;
      const pre = mark(document.createElement("pre"), at);
      const el = document.createElement("code");
      if (opts.rich && lang) {
        el.className = `language-${lang.toLowerCase().replace(/[^\w-]/g, "")}`;
        pre.dataset.lang = lang;
      }
      el.textContent = code.join("\n");
      pre.append(el);
      out.append(pre);
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (opts.rich && RULE.test(line)) {
      out.append(mark(document.createElement("hr"), i));
      i++;
      continue;
    }
    const heading = headRe.exec(line);
    if (heading) {
      const h = mark(document.createElement(`h${Math.min(6, top + heading[1]!.length - 1)}`), i);
      h.append(inline(heading[2]!));
      out.append(h);
      i++;
      continue;
    }
    if (opts.picture) {
      const m = PICTURE.exec(line);
      const node = m ? opts.picture(m[1]!, m[2]!) : null;
      if (node) {
        const wrap = mark(document.createElement("div"), i);
        wrap.className = "md-picture";
        wrap.append(node);
        out.append(wrap);
        i++;
        continue;
      }
    }
    if (/^>\s?/.test(line)) {
      const at = i;
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) quote.push(lines[i++]!.replace(/^>\s?/, ""));
      const bq = mark(document.createElement("blockquote"), at);
      bq.append(blocks(quote, base + at, opts));
      out.append(bq);
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const at = i;
      if (opts.rich) {
        const run: string[] = [];
        const ordered = !BULLET.test(line);
        const indent = (l: string): number => /^\s*/.exec(l)![0].replace(/\t/g, "    ").length;
        while (i < lines.length) {
          const l = lines[i]!;
          const item = BULLET.test(l) || NUMBERED.test(l);
          // A bullet after numbers (or the reverse) at the list's own indent starts another list.
          if (item && indent(l) === indent(line) && !BULLET.test(l) !== ordered) break;
          if (!item && !(/^\s+\S/.test(l) && run.length)) break;
          run.push(l);
          i++;
        }
        out.append(nestedList(run, base + at, opts));
        continue;
      }
      const marker = BULLET.test(line) ? BULLET : NUMBERED;
      const list = mark(document.createElement(marker === BULLET ? "ul" : "ol"), at);
      while (i < lines.length && marker.test(lines[i]!)) {
        const li = mark(document.createElement("li"), i);
        li.append(inline(lines[i++]!.replace(marker, "")));
        list.append(li);
      }
      out.append(list);
      continue;
    }
    // A paragraph runs until a blank line or another block starts; its line
    // breaks stay, as people type them.
    const at = i;
    const para: string[] = [];
    const breaks = (l: string): boolean => stopRe.test(l) || (!!opts.rich && RULE.test(l)) || (!!opts.picture && PICTURE.test(l));
    while (i < lines.length && lines[i]!.trim() !== "" && !breaks(lines[i]!)) para.push(lines[i++]!);
    if (para.length === 0) para.push(lines[i++]!);
    const p = mark(document.createElement("p"), at);
    para.forEach((l, n) => {
      if (n > 0) p.append(document.createElement("br"));
      p.append(inline(l));
    });
    out.append(p);
  }
  return out;
}

/** A list whose items may sit deeper by indent (two or more spaces, or a tab), each deeper run a list inside its item. */
function nestedList(run: string[], base: number, opts: MarkdownOptions): HTMLElement {
  const depth = (l: string): number => (/^\s*/.exec(l)![0].replace(/\t/g, "    ").length);
  let i = 0;
  // The outermost list takes any line shallower than its first as its own depth: otherwise
  // "  - a" then "- b" dropped b from the rendered notes (audit, 11/8).
  const build = (indent: number, root = false): HTMLElement => {
    const first = run[i]!;
    const ordered = NUMBERED.test(first) && !BULLET.test(first);
    const list = document.createElement(ordered ? "ol" : "ul");
    if (opts.lines) list.dataset.line = String(base + i);
    while (i < run.length) {
      const l = run[i]!;
      const d = root ? Math.max(depth(l), indent) : depth(l);
      if (d < indent) break;
      if (d > indent) {
        // Deeper than this list: it belongs to the last item (or starts one if there is none).
        const li = (list.lastElementChild as HTMLElement | null) ?? list.appendChild(document.createElement("li"));
        li.append(build(d));
        continue;
      }
      const marker = BULLET.test(l) ? BULLET : NUMBERED.test(l) ? NUMBERED : null;
      if (!marker) {
        // A continuation line at this depth: more text for the last item.
        const li = list.lastElementChild;
        if (li) li.append(document.createElement("br"), inline(l.trim()));
        i++;
        continue;
      }
      const li = document.createElement("li");
      if (opts.lines) li.dataset.line = String(base + i);
      li.append(inline(l.replace(marker, "")));
      list.append(li);
      i++;
    }
    return list;
  };
  return build(depth(run[0]!), true);
}

// `code`, **bold**, *italic* or _italic_, and [text](https://…). Earlier
// alternatives win, so nothing inside `code` is read as Markdown.
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_|\[([^\]]+)\]\((\S+?)\)/;

function inline(text: string): DocumentFragment {
  const out = document.createDocumentFragment();
  let rest = text;
  for (let m = INLINE.exec(rest); m; m = INLINE.exec(rest)) {
    if (m.index > 0) out.append(rest.slice(0, m.index));
    const [whole, code, bold, star, under, label, href] = m;
    if (code !== undefined) {
      const el = document.createElement("code");
      el.textContent = code;
      out.append(el);
    } else if (bold !== undefined) {
      const el = document.createElement("strong");
      el.append(inline(bold));
      out.append(el);
    } else if (star !== undefined || under !== undefined) {
      const el = document.createElement("em");
      el.append(inline((star ?? under)!));
      out.append(el);
    } else if (label !== undefined && href !== undefined) {
      out.append(link(label, href) ?? whole);
    }
    rest = rest.slice(m.index + whole.length);
  }
  if (rest) out.append(rest);
  return out;
}

/** An http(s) link in a new tab, or null for anything else (javascript:, data:, …). */
function link(label: string, href: string): HTMLAnchorElement | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const a = document.createElement("a");
  a.href = url.href;
  a.target = "_blank";
  a.rel = "noopener noreferrer nofollow";
  a.append(inline(label));
  return a;
}
