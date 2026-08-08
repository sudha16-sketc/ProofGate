import type { ReactNode } from 'react';

export interface TrustNode {
  role: string;
  desc: string;
  icon: ReactNode;
}

export interface TrustGraphProps {
  nodes: TrustNode[];
  edges: string[];
  compact?: boolean;
}

/**
 * "Who verifies what" — each party runs its own proof to reach a joint
 * outcome. The edge labels read top to bottom, so the chain is read as:
 * the issuer proves identity to the wallet, the wallet proves eligibility to
 * the contract, the contract exposes the permit to the dApp.
 */
export function TrustGraph({ nodes, edges, compact = false }: TrustGraphProps) {
  return (
    <div className="trust-graph">
      {nodes.map((node, i) => (
        <div className="trust-col" key={node.role}>
          <div className="trust-node" role="img" aria-label={`${node.role}: ${node.desc}`}>
            <span className="trust-icon" aria-hidden="true">
              {node.icon}
            </span>
            <span>
              <span className="trust-role">{node.role}</span>
              {!compact && <span className="trust-desc">{node.desc}</span>}
            </span>
          </div>
          {i < edges.length && (
            <div className="trust-edge" aria-hidden="true">
              <span className="trust-edge-line" />
              <span className="trust-edge-label">{edges[i]}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
