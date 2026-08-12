import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useMidnight } from '../../hooks/useMidnight';
import { NETWORK } from '../../lib/env';
import { HeroSequence, type HeroSequenceHandle } from '../visual/HeroSequence';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { IconArrowDown, IconLock, IconWallet } from '../icons';

gsap.registerPlugin(ScrollTrigger);

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
        end: () => `+=${window.innerHeight * 4.5}`,
        scrub: 1.15,
        pin: true,
        pinSpacing: true,
        anticipatePin: 1,
        onUpdate: (self) => {
          heroSequenceRef.current?.setProgress(self.progress);
        },
      },
      defaults: { ease: 'none' },
    });

    // The 192 frames are split into contiguous, non-overlapping story ranges:
    // 001–043 hero, 044–094 privacy, 095–145 proof, 146–192 verified.
    // Copy never overlaps another phase; each range includes an enter, hold, and exit.
    timeline
      .to(scrollHintRef.current, { autoAlpha: 0, y: 12, duration: 0.055, ease: 'power1.out' }, 0.03)
      .to(phase0Ref.current, { autoAlpha: 0, yPercent: -8, scale: 0.97, filter: 'blur(7px)', duration: 0.04, ease: 'power2.in' }, 0.185)
      .fromTo(phase1Ref.current, { autoAlpha: 0, xPercent: 12, yPercent: 4, scale: 0.95, filter: 'blur(12px)' }, { autoAlpha: 1, xPercent: 0, yPercent: 0, scale: 1, filter: 'blur(0px)', duration: 0.04, ease: 'power2.out' }, 0.235)
      .to(phase1Ref.current, { autoAlpha: 0, xPercent: 8, yPercent: -5, scale: 1.02, filter: 'blur(7px)', duration: 0.04, ease: 'power2.in' }, 0.455)
      .fromTo(phase2Ref.current, { autoAlpha: 0, xPercent: -12, yPercent: 8, scale: 1.04, filter: 'blur(12px)' }, { autoAlpha: 1, xPercent: 0, yPercent: 0, scale: 1, filter: 'blur(0px)', duration: 0.04, ease: 'power2.out' }, 0.505)
      .to(phase2Ref.current, { autoAlpha: 0, xPercent: -8, yPercent: -8, scale: 0.98, filter: 'blur(7px)', duration: 0.04, ease: 'power2.in' }, 0.725)
      .fromTo(phase3Ref.current, { autoAlpha: 0, xPercent: 9, yPercent: 10, scale: 0.91, filter: 'blur(12px)' }, { autoAlpha: 1, xPercent: 0, yPercent: 0, scale: 1, filter: 'blur(0px)', duration: 0.04, ease: 'power2.out' }, 0.775);

    // Force the spacer to be measured now; without following content this is
    // what supplies the scroll runway for the pinned sequence.
    ScrollTrigger.refresh();

    // Re-measure the pin distance once late-loading assets are in.
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener('load', onLoad);

    return () => {
      window.removeEventListener('load', onLoad);
      timeline.scrollTrigger?.kill();
      timeline.kill();
    };
  }, []);


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
          <div className="hero-phase hero-phase--intro" ref={phase0Ref}>
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
            className="hero-phase hero-phase--privacy"
            ref={phase1Ref}
            style={{ opacity: 0, visibility: 'hidden' }}
          >
            <h2>Your data stays private.</h2>
            <p className="lead">
              The issuer-signed credential lives only in your wallet. Nothing personal is ever published, logged, or
              shared.
            </p>
          </div>

          <div
            className="hero-phase hero-phase--proof"
            ref={phase2Ref}
            style={{ opacity: 0, visibility: 'hidden' }}
          >
            <h2>Prove eligibility without revealing identity.</h2>
            <p className="lead">
              A zero-knowledge proof is generated in your wallet and verified on Midnight — the verifier learns only
              that you qualify.
            </p>
          </div>

          <div
            className="hero-phase hero-phase--verified"
            ref={phase3Ref}
            style={{ opacity: 0, visibility: 'hidden' }}
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
    </div>
  );
}
