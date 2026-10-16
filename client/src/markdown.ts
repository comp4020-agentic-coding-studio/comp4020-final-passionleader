// A small Markdown for board posts: headings, bold, italic, inline code,
// code blocks, lists, quotes and links. It builds DOM nodes with
// textContent only, never innerHTML, so whatever someone writes in a post
// can't become a script or a tag on everyone else's screen. Links open in a
// new tab and only for http(s) addresses. Comments stay plain text.

/** Renders `text` as Markdown into a fragment of safe DOM nodes. */
export function renderMarkdown(text: string): DocumentFragment {
  const out = document.createDocumentFragment();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    // A fenced code block, kept exactly as written.
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) code.push(lines[i++]!);
      i++;
      const pre = document.createElement("pre");
      const el = document.createElement("code");
      el.textContent = code.join("\n");
      pre.append(el);
      out.append(pre);
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      // Inside the post, # is a small heading (h4..h6): the post's title is the big one.
      const h = document.createElement(`h${heading[1]!.length + 3}`);
      h.append(inline(heading[2]!));
      out.append(h);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) quote.push(lines[i++]!.replace(/^>\s?/, ""));
      const bq = document.createElement("blockquote");
      bq.append(renderMarkdown(quote.join("\n")));
      out.append(bq);
      continue;
    }
    const bullet = /^\s*[-*+]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const marker = bullet.test(line) ? bullet : numbered;
      const list = document.createElement(marker === bullet ? "ul" : "ol");
      while (i < lines.length && marker.test(lines[i]!)) {
        const li = document.createElement("li");
        li.append(inline(lines[i++]!.replace(marker, "")));
        list.append(li);
      }
      out.append(list);
      continue;
    }
    // A paragraph runs until a blank line or another block starts; its line
    // breaks stay, as people type them.
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !/^(```|#{1,3}\s|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i]!)) para.push(lines[i++]!);
    if (para.length === 0) para.push(lines[i++]!);
    const p = document.createElement("p");
    para.forEach((l, n) => {
      if (n > 0) p.append(document.createElement("br"));
      p.append(inline(l));
    });
    out.append(p);
  }
  return out;
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
