import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useMidnight } from '../../hooks/useMidnight';
import { NETWORK } from '../../lib/env';
import { HeroSequence, type HeroSequenceHandle } from '../visual/HeroSequence';
import { ProofPipeline, type PipelineStage } from '../visual/ProofPipeline';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { IconArrowDown, IconCheck, IconGlobe, IconLock, IconWallet, IconX, IconZap } from '../icons';


gsap.registerPlugin(ScrollTrigger);


const STAGES: PipelineStage[] = [
    { icon: 'id', label: 'Identity', name: 'Verified by the KYC provider', kind: 'private' },
    { icon: 'cred', label: 'Private credential', name: 'Issuer-signed, held in your wallet', kind: 'private' },
    { icon: 'zk', label: 'ZK proof', name: 'Generated locally in your wallet', kind: 'transition' },
    { icon: 'elig', label: 'Eligibility', name: 'Predicates verified on Midnight', kind: 'public' },
    { icon: 'permit', label: 'One-time permit', name: 'Public authorization state', kind: 'public' },
    { icon: 'action', label: 'Protected action', name: 'Consumed by the third-party dApp', kind: 'public' },
];


/**
 * Landing page shown whenever the wallet is not connected.
 *
 * The hero is a scroll-controlled cinematic: a GSAP ScrollTrigger pins the
 * section and scrubs one master progress value (0 → 1) that drives both the
 * frame sequence (via `HeroSequence.setProgress`) and the foreground copy
 * phases. The ProofPipeline below is revealed after the sequence ends.
 */
export function ConnectView() {
    const { state, connect, network, clearError } = useMidnight();
    const connecting = state.status === 'connecting';


    const heroSequenceRef = useRef<HeroSequenceHandle>(null);
    const heroRef = useRef<HTMLElement>(null);
    const phase0Ref = useRef<HTMLDivElement>(null);
    const phase1Ref = useRef<HTMLDivElement>(null);
    const phase2Ref = useRef<HTMLDivElement>(null);
    const phase3Ref = useRef<HTMLDivElement>(null);
    const scrollHintRef = useRef<HTMLDivElement>(null);


    // Master scroll timeline: pins the hero and scrubs frames + copy together.
    useLayoutEffect(() => {
        const hero = heroRef.current;
        if (!hero) return;


        // Reduced-motion users get a static hero (frame 001 + first message) and
        // the sections flow normally — no forced scrubbing or pinning.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;


        const timeline = gsap.timeline({
            scrollTrigger: {
                trigger: hero,
                start: 'top top',
                end: () => `+=${window.innerHeight * 3}`,
                scrub: 1,
                pin: true,
                anticipatePin: 1,
                onUpdate: (self) => {
                    heroSequenceRef.current?.setProgress(self.progress);
                },
            },
            defaults: { ease: 'none' },
        });


        timeline
            .to(scrollHintRef.current, { autoAlpha: 0, y: 10, duration: 0.05 }, 0.02)
            .to(phase0Ref.current, { autoAlpha: 0, y: -40, duration: 0.12 }, 0.24)
            .fromTo(phase1Ref.current, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.12 }, 0.3)
            .to(phase1Ref.current, { autoAlpha: 0, y: -40, duration: 0.12 }, 0.56)
            .fromTo(phase2Ref.current, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.12 }, 0.6)
            .to(phase2Ref.current, { autoAlpha: 0, y: -40, duration: 0.12 }, 0.81)
            .fromTo(phase3Ref.current, { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.12 }, 0.85);


        // Re-measure the pin distance once late-loading assets are in.
        const onLoad = () => ScrollTrigger.refresh();
        window.addEventListener('load', onLoad);


        return () => {
            window.removeEventListener('load', onLoad);
            timeline.scrollTrigger?.kill();
            timeline.kill();
        };
    }, []);


    const scrollToFirstSection = () => {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        document.getElementById('pg-after-hero')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    };


    return (
        <div className="pg-landing">
            <section className="cinematic-hero" ref={heroRef}>
                <HeroSequence ref={heroSequenceRef} />


                <div className="hero-scrim" aria-hidden="true" />


                <div className="hero-topline">
                    <StatusBadge tone={connecting ? 'dim' : 'accent'}>
                        {connecting ? 'Connecting…' : `Powered by Midnight · ${NETWORK}`}
                    </StatusBadge>
                </div>


                <div className="hero-phases">
                    <div className="hero-phase" ref={phase0Ref}>
                        <h1>
                            Prove eligibility. <span className="accent">Not identity.</span>
                        </h1>
                        <p className="lead">
                            ProofGate lets regulated Web3 applications verify eligibility without exposing the user’s sensitive
                            identity or compliance data.
                        </p>
                        <div className="hero-actions">
                            <Button variant="primary" size="lg" onClick={connect} loading={connecting} icon={<IconWallet size={17} />}>
                                {connecting ? 'Connecting…' : `Connect wallet (${network})`}
                            </Button>
                            <Button variant="outline" size="lg" onClick={scrollToFirstSection} icon={<IconArrowDown size={17} />}>
                                Learn more
                            </Button>
                        </div>
                        {state.status === 'error' && (
                            <div className="error-state" role="alert">
                                <p>{state.error}</p>
                                <Button variant="ghost" size="sm" onClick={clearError}>
                                    Dismiss
                                </Button>
                            </div>
                        )}
                        <p className="hero-honesty">
                            <IconLock size={13} />
                            In this demo, a built-in demo issuer signs your claims. Your age, jurisdiction, and signature never leave
                            your wallet.
                        </p>
                    </div>


                    <div
                        className="hero-phase"
                        ref={phase1Ref}
                        style={{ opacity: 0, visibility: 'hidden', transform: 'translateY(40px)' }}
                    >
                        <h2>Your data stays private.</h2>
                        <p className="lead">
                            The issuer-signed credential lives only in your wallet. Nothing personal is ever published, logged, or
                            shared.
                        </p>
                    </div>


                    <div
                        className="hero-phase"
                        ref={phase2Ref}
                        style={{ opacity: 0, visibility: 'hidden', transform: 'translateY(40px)' }}
                    >
                        <h2>Prove eligibility without revealing identity.</h2>
                        <p className="lead">
                            A zero-knowledge proof is generated in your wallet and verified on Midnight — the verifier learns only
                            that you qualify.
                        </p>
                    </div>


                    <div
                        className="hero-phase"
                        ref={phase3Ref}
                        style={{ opacity: 0, visibility: 'hidden', transform: 'translateY(40px)' }}
                    >
                        <h2>Eligibility verified.</h2>
                        <p className="lead">
                            A one-time permit is minted on-chain and ready for the protected action.
                        </p>
                    </div>
                </div>


                <div className="hero-scroll-hint" ref={scrollHintRef}>
                    <IconArrowDown size={15} />
                    Scroll to explore
                </div>
            </section>


            <LandingSection
                id="pg-after-hero"
                title="What happens after you connect"
                subtitle="Connect your Midnight wallet — the proofs are generated in-wallet, then submitted to the network."
            >
                <ProofPipeline stages={STAGES} />
            </LandingSection>


            <LandingSection title="Three guarantees" subtitle="The ProofGate contract enforces these on-chain.">
                <div className="grid-3">
                    <Card icon={<IconZap size={18} />} title="Zero-knowledge">
                        Proofs are generated and verified locally or in-wallet. The verifier learns only that the proof is valid.
                    </Card>
                    <Card icon={<IconGlobe size={18} />} title="Public, but private">
                        The ledger stores commitments, policy parameters and status flags — never your attributes.
                    </Card>
                    <Card icon={<IconLock size={18} />} title="Unlinkable permits">
                        Each permit uses a fresh salt, so permit ids cannot be tied back to you.
                    </Card>
                </div>
            </LandingSection>


            <LandingSection
                title="Why ProofGate?"
                subtitle="Traditional KYC trades your data for access. ProofGate trades a zero-knowledge proof."
            >
                <KycComparison />
            </LandingSection>
        </div>
    );
}


const KYC_ROWS: ReadonlyArray<{ label: string; traditional: string; proofgate: string }> = [
    {
        label: 'Data shared',
        traditional: 'Full documents — ID, passport, proof of address',
        proofgate: 'A zero-knowledge proof, and nothing else',
    },
    {
        label: 'Storage',
        traditional: 'Copies kept on the service’s servers',
        proofgate: 'Commitments + status flags on a public ledger',
    },
    {
        label: 'Portability',
        traditional: 'Every site starts the check from scratch',
        proofgate: 'One credential works across many services',
    },
    {
        label: 'Replayability',
        traditional: 'Stored copies can be reused without consent',
        proofgate: 'One-time permits, fresh salt per permit',
    },
    {
        label: 'Breach risk',
        traditional: 'Data at rest can leak in a breach',
        proofgate: 'Nothing stored — proofs are ephemeral',
    },
    {
        label: 'Revocation',
        traditional: 'Often outside your control',
        proofgate: 'Permits expire and revoke on-chain',
    },
];


function KycComparison() {
    return (
        <div className="kyc-compare" role="table" aria-label="Traditional KYC versus ProofGate">
            <div className="kyc-row kyc-row-head" role="row">
                <span className="kyc-label" role="columnheader" />
                <span className="kyc-cell kyc-traditional" role="columnheader">
                    Traditional KYC
                </span>
                <span className="kyc-cell kyc-proofgate" role="columnheader">
                    ProofGate
                </span>
            </div>
            {KYC_ROWS.map((row) => (
                <div className="kyc-row" role="row" key={row.label}>
                    <span className="kyc-label" role="cell">
                        {row.label}
                    </span>
                    <span className="kyc-cell kyc-traditional" role="cell">
                        <IconX size={13} aria-hidden="true" />
                        {row.traditional}
                    </span>
                    <span className="kyc-cell kyc-proofgate" role="cell">
                        <IconCheck size={13} aria-hidden="true" />
                        {row.proofgate}
                    </span>
                </div>
            ))}
        </div>
    );
}


function LandingSection({
    id,
    title,
    subtitle,
    children,
}: {
    id?: string;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <section id={id} className="landing-section">
            <div className="landing-inner">
                <div className="section-head">
                    <div>
                        <h1 style={{ fontSize: 'var(--fs-h2)' }}>{title}</h1>
                        {subtitle && <p className="lead">{subtitle}</p>}
                    </div>
                </div>
                {children}
            </div>
        </section>
    );
}


function Card({
    icon,
    title,
    children,
}: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="card">
            <span className="badge badge-proof" style={{ width: 'fit-content' }}>
                {icon}
            </span>
            <h3 style={{ marginTop: 12 }}>{title}</h3>
            <p className="muted" style={{ marginTop: 6 }}>
                {children}
            </p>
        </div>
    );
}

