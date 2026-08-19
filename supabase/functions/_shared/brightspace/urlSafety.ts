// Real DNS resolution wrapper around packages/core's ssrfGuard -- resolving a hostname
// is I/O, so it can't live in the pure guard itself. Called before every fetch of a
// user-supplied feed URL, not just at connect time: brightspace-sync re-syncs
// periodically, and a hostname's DNS answer can change between syncs.

import { checkUrlSchemeAndHostname, isPrivateOrReservedIp } from "../core/index.ts";

export interface UrlSafetyResult {
  ok: boolean;
  reason: string | null;
}

export async function assertSafeFeedUrl(rawUrl: string): Promise<UrlSafetyResult> {
  const schemeCheck = checkUrlSchemeAndHostname(rawUrl);
  if (!schemeCheck.ok) return schemeCheck;

  const hostname = new URL(rawUrl).hostname;

  // A literal IP address needs no DNS resolution -- check it directly rather than
  // relying on however Deno.resolveDns happens to behave when handed a raw IP instead
  // of a domain name (observed to fail resolution for an IP literal, which happens to
  // produce the right refusal today, but the guard's correctness must not depend on
  // that incidental behavior holding across Deno versions).
  const bareIpv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
  const bareIpv6 = hostname.includes(":");
  if (bareIpv4 || bareIpv6) {
    if (isPrivateOrReservedIp(hostname)) {
      return { ok: false, reason: `Host "${hostname}" is a non-public address, which is not allowed.` };
    }
    return { ok: true, reason: null };
  }

  let addresses: string[];
  try {
    const [v4, v6] = await Promise.allSettled([
      Deno.resolveDns(hostname, "A"),
      Deno.resolveDns(hostname, "AAAA"),
    ]);
    addresses = [...(v4.status === "fulfilled" ? v4.value : []), ...(v6.status === "fulfilled" ? v6.value : [])];
  } catch (err) {
    return { ok: false, reason: `Could not resolve host "${hostname}": ${err instanceof Error ? err.message : String(err)}` };
  }

  if (addresses.length === 0) {
    return { ok: false, reason: `Host "${hostname}" did not resolve to any address.` };
  }

  const privateAddress = addresses.find((addr) => isPrivateOrReservedIp(addr));
  if (privateAddress) {
    return { ok: false, reason: `Host "${hostname}" resolves to a non-public address (${privateAddress}), which is not allowed.` };
  }

  return { ok: true, reason: null };
}
