// Name rules both sides need: the forms check them before sending, the
// server checks them again because a client can send anything.
export const USERNAME_RE = /^[a-z0-9_-]{3,16}$/i;

// AUTH-02: a guest's pseudonym is 3 to 20 characters; account display names follow the same rule.
export const RIDER_NAME_MIN = 3;
export const RIDER_NAME_MAX = 20;
// Letters of any alphabet (so "Éloïse" works), digits, spaces, - and _.
const RIDER_NAME_RE = new RegExp(`^[\\p{L}\\p{N} _-]{${RIDER_NAME_MIN},${RIDER_NAME_MAX}}$`, "u");

/** The rider name as it will be shown, or null when it breaks the rules. */
export function cleanRiderName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // NFC first: an "é" typed as e + combining accent becomes one letter, and
  // any accent that can't combine (stacked "zalgo" marks) fails the check.
  const name = raw.normalize("NFC").trim().replace(/ +/g, " ");
  return RIDER_NAME_RE.test(name) ? name : null;
}
