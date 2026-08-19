/**
 * Reads confirmation/reset emails from the local Mailpit inbox (http://127.0.0.1:54324) so e2e
 * specs can verify real signup/reset flows end-to-end without a real mail provider. Mailpit's
 * REST API is documented at https://mailpit.axllent.org/docs/api-v1/.
 */

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

interface MailpitMessageSummary {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
  Created: string;
}

interface MailpitSearchResponse {
  messages: MailpitMessageSummary[];
}

interface MailpitMessage {
  Text: string;
  HTML: string;
}

async function mailpitFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok) {
    throw new Error(`Mailpit request failed: ${path} -> ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Polls Mailpit for the most recent message sent to `email`, waiting up to `timeoutMs` for it to
 * arrive. Local email delivery is fast but not instant relative to the request that triggers it.
 */
export async function waitForMessageTo(
  email: string,
  { timeoutMs = 10_000, pollIntervalMs = 250 }: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<MailpitMessageSummary> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { messages } = await mailpitFetch<MailpitSearchResponse>(
      `/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const latest = messages.at(0);
    if (latest) return latest;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`No email arrived for ${email} within ${timeoutMs}ms`);
}

export async function getMessageBody(messageId: string): Promise<MailpitMessage> {
  return mailpitFetch<MailpitMessage>(`/api/v1/message/${messageId}`);
}

/** Pulls the first http(s) link out of a message body — typically the confirm/reset link. */
export function extractFirstLink(body: string): string {
  const match = body.match(/https?:\/\/[^\s"'<>]+/);
  if (!match) {
    throw new Error("No link found in email body");
  }
  return match[0];
}

export async function deleteAllMessages(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
}
