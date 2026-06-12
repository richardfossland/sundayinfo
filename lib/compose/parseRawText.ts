// Paste-raw-text → structured announcement. The editor pastes whatever they
// have (an email, a poster text, a one-liner); we make a sensible slide out of
// it without any AI: first line becomes the title, URLs become a QR sub-card,
// date-ish lines are kept in the body but also suggested as the expiry hint.

export type ParsedContent = {
  title: string;
  body: string;
  /** First URL found, if any — offered as a QR code. */
  url: string | null;
  /** Bible reference detected (e.g. "Joh 3,16") — flips the type to `verse`. */
  reference: string | null;
};

const URL_RE = /https?:\/\/[^\s)>\]]+/i;

// "Joh 3,16", "1 Kor 13,4-7", "Salme 23", "Matt 5,3–12"
const BIBLE_RE =
  /^\s*(?:[1-3]\s?)?[A-ZÆØÅ][a-zæøå]+\.?\s\d{1,3}(?:\s?[,:]\s?\d{1,3}(?:\s?[-–]\s?\d{1,3})?)?\s*$/;

export function parseRawText(raw: string): ParsedContent {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { title: "", body: "", url: null, reference: null };

  const urlMatch = raw.match(URL_RE);
  const url = urlMatch ? urlMatch[0] : null;

  // Verse heuristic: short quote + a line that looks like a Bible reference.
  const refLine = lines.find((l) => BIBLE_RE.test(l));
  if (refLine && lines.length <= 6) {
    const quote = lines
      .filter((l) => l !== refLine)
      .join("\n")
      .replace(/^[«"']|[»"']$/g, "");
    if (quote.length > 0 && quote.length <= 500) {
      return { title: "", body: quote, url, reference: refLine };
    }
  }

  const [first, ...rest] = lines;
  // A short first line is a natural title; a long one means the text has no
  // obvious title, so we leave the body intact.
  if (first.length <= 80) {
    const body = rest.join("\n").replace(URL_RE, "").trim();
    return { title: first.replace(/[.:]$/, ""), body, url, reference: null };
  }
  return {
    title: "",
    body: lines.join("\n").replace(URL_RE, "").trim(),
    url,
    reference: null,
  };
}
