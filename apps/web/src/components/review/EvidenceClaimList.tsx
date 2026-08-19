import type { EvidenceClaim } from "@collegeos/api";

/** LLM_LAYER_SPEC.md §3 / the Lead's hard requirement: every claim renders its cited
 *  evidence. A claim with an empty evidence array is dropped, not rendered bare -- the
 *  schema requires evidence per claim, this is the UI half of that contract. Callers that
 *  wrap this in a titled Section must gate on this too, or an empty section heading leaks
 *  through with nothing underneath it. */
export function claimsWithEvidence(claims: EvidenceClaim[]): EvidenceClaim[] {
  return claims.filter((c) => c.evidence.length > 0);
}

export function EvidenceClaimList({ claims }: { claims: EvidenceClaim[] }) {
  const withEvidence = claimsWithEvidence(claims);
  if (withEvidence.length === 0) return null;

  return (
    <ul className="flex flex-col gap-4">
      {withEvidence.map((claim, i) => (
        <li key={i} className="flex flex-col gap-1.5">
          <p className="text-body-l font-serif text-ink">{claim.claim}</p>
          <ul className="flex flex-col gap-0.5 pl-3">
            {claim.evidence.map((e, j) => (
              <li key={j} className="font-mono text-caption text-ink-faint before:mr-2 before:content-['·']">
                {e}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
