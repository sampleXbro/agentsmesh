/**
 * Redact `user:password@` userinfo from any URLs embedded in a message so
 * tokens (GitHub PATs, GitLab OAuth2 tokens, etc.) never reach stdout/stderr
 * via error wrappers, log lines, or thrown error messages.
 *
 * Use anywhere a string that may contain a credential-bearing URL is about
 * to be logged or surfaced (`logger.warn(redactUrlSecrets(err.message))`).
 */

// Match `<scheme>://<userinfo>@<host…>` where the URL ends at whitespace, a
// quote, or end of string. Userinfo is non-empty and may contain `:`. We
// trim a single trailing punctuation character (`.,;:!?`) so URLs in prose
// like "failed: https://u:p@h/r.git." still get redacted cleanly.
const URL_WITH_CREDENTIALS = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/@\s"'<>]+)@([^\s"'<>]+)/g;

export function redactUrlSecrets(message: string): string {
  return message.replace(
    URL_WITH_CREDENTIALS,
    (_full, scheme: string, _userinfo: string, rest: string) => {
      return `${scheme}***@${rest}`;
    },
  );
}

/**
 * Drop `user:password@` userinfo entirely, rather than masking it.
 *
 * Use for any URL that is about to be PERSISTED or used as a cache key:
 * `installs.yaml`, `pack.yaml`, the install manifest and cache directory
 * names are all committed or long-lived, so a token in them is a leaked
 * secret rather than a convenience. Transport keeps the credentialed URL;
 * authentication for a later refresh comes from git's own credential
 * mechanism, not from the recorded source.
 */
export function stripUrlCredentials(url: string): string {
  return url.replace(
    URL_WITH_CREDENTIALS,
    (_full, scheme: string, _userinfo: string, rest: string) => {
      return `${scheme}${rest}`;
    },
  );
}
