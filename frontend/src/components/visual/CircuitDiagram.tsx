/**
 * Technical explorer: how the proof is built inside the wallet. Each column
 * is one stage of the pipeline. The dashed wires animate to suggest data
 * flowing through the circuit. Honest by construction — every gate shown here
 * corresponds to a check the ProofGate contract actually performs before
 * issuing a permit.
 */
export function CircuitDiagram() {
  return (
    <div className="circuit-diagram" role="img" aria-label="Circuit architecture">
      <svg viewBox="0 0 760 360" width="100%" height="auto" aria-hidden="true">
        <defs>
          <pattern id="cd-grid" width="22" height="22" patternUnits="userSpaceOnUse">
            <path d="M 22 0 L 0 0 0 22" fill="none" stroke="rgba(0, 229, 255, 0.06)" strokeWidth="1" />
          </pattern>
          <filter id="cd-glow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="760" height="360" fill="url(#cd-grid)" rx="14" />
        <text x="20" y="30" className="cd-stage-label" fill="#e6f7ff">1 · private inputs (witness)</text>
        <text x="296" y="30" className="cd-stage-label" fill="#e6f7ff">2 · circuit gates</text>
        <text x="600" y="30" className="cd-stage-label" fill="#e6f7ff">3 · proof</text>

        <g className="cd-group">
          <rect x="18" y="48" width="240" height="52" rx="9" className="cd-box cd-private" />
          <text x="32" y="70" className="cd-term" fill="#7ff3ff">identity</text>
          <text x="32" y="88" className="cd-mono" fill="#8be9fd">cm(issuer, subject, kyc)</text>

          <rect x="18" y="112" width="240" height="52" rx="9" className="cd-box cd-private" />
          <text x="32" y="134" className="cd-term" fill="#7ff3ff">age</text>
          <text x="32" y="152" className="cd-mono" fill="#8be9fd">cm(dob, issuer sig)</text>

          <rect x="18" y="176" width="240" height="52" rx="9" className="cd-box cd-private" />
          <text x="32" y="198" className="cd-term" fill="#7ff3ff">jurisdiction</text>
          <text x="32" y="216" className="cd-mono" fill="#8be9fd">cm(us, fr, de, …)</text>

          <rect x="18" y="240" width="240" height="52" rx="9" className="cd-box cd-private" />
          <text x="32" y="262" className="cd-term" fill="#7ff3ff">kyc level</text>
          <text x="32" y="280" className="cd-mono" fill="#8be9fd">cm(basic, enhanced, l3)</text>
        </g>

        <g className="cd-group">
          <rect x="300" y="48" width="250" height="52" rx="9" className="cd-box cd-gate" />
          <text x="314" y="70" className="cd-term" fill="#faf9f7">verify issuer signature</text>
          <text x="314" y="88" className="cd-mono" fill="#bfc9d9">schnorr ✓</text>

          <rect x="300" y="112" width="250" height="52" rx="9" className="cd-box cd-gate" />
          <text x="314" y="134" className="cd-term" fill="#faf9f7">age ≥ policy minimum</text>
          <text x="314" y="152" className="cd-mono" fill="#bfc9d9">age ≥ 18 ✓</text>

          <rect x="300" y="176" width="250" height="52" rx="9" className="cd-box cd-gate" />
          <text x="314" y="198" className="cd-term" fill="#faf9f7">jurisdiction ∈ allowed set</text>
          <text x="314" y="216" className="cd-mono" fill="#bfc9d9">us, fr, de ✓</text>

          <rect x="300" y="240" width="250" height="52" rx="9" className="cd-box cd-gate" />
          <text x="314" y="262" className="cd-term" fill="#faf9f7">kyc level ≥ required</text>
          <text x="314" y="280" className="cd-mono" fill="#bfc9d9">kyc ≥ basic ✓</text>
        </g>

        <g className="cd-wires">
          {[80, 144, 208, 272].map((y, i) => (
            <path key={`w-${i}`} d={`M 258 ${y} C 278 ${y}, 278 ${y}, 300 ${y}`} />
          ))}
        </g>
        <g className="cd-wires" style={{ animationDelay: '0.4s' }}>
          {[80, 144, 208, 272].map((y, i) => (
            <path key={`p-${i}`} d={`M 550 ${y} L 594 ${y + (i - 1.5) * 46}`} />
          ))}
        </g>

        <g className="cd-group">
          <rect x="596" y="102" width="140" height="64" rx="9" className="cd-box cd-proof" filter="url(#cd-glow)" />
          <text x="610" y="128" className="cd-term" fill="#faf9f7">zero-knowledge</text>
          <text x="610" y="146" className="cd-mono" fill="#bfc9d9">π (opaque)</text>

          <rect x="596" y="190" width="140" height="64" rx="9" className="cd-box cd-verify" />
          <text x="610" y="216" className="cd-term" fill="#faf9f7">verify(π, policy)</text>
          <text x="610" y="234" className="cd-mono" fill="#bfc9d9">→ true</text>

          <rect x="596" y="278" width="140" height="52" rx="9" className="cd-box cd-permit" />
          <text x="610" y="300" className="cd-term" fill="#faf9f7">permit minted</text>
          <text x="610" y="316" className="cd-mono" fill="#bfc9d9">PUBLIC ✓</text>
        </g>

        <path className="cd-pulse" d="M 598 136 L 578 136 C 572 136 572 222 578 222 L 596 222" />
      </svg>
      <p className="caption" style={{ marginTop: 'var(--sp-2)' }}>
        Read-only demo of the in-circuit checks. No credentials or attributes
        are ever stored on-chain.
      </p>
    </div>
  );
}
