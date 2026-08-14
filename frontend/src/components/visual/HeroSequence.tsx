// HeroSequence — cinematic scroll-controlled frame sequence player.
//
// Loads `/heroframes/frame-001.jpg … frame-NNN.jpg` in batches and renders the
// current frame onto a single full-viewport canvas. The parent controls the
// playback by calling `setProgress(0…1)` (typically from a GSAP ScrollTrigger
// master timeline); this component never owns its own ScrollTrigger.
//
// Public imperative API (via ref):
//   setProgress(progress: number) — clamp 0..1, maps 0 → frame 001, 1 → frame N
//   isReady(): boolean             — true once every batch has finished loading

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import gsap from 'gsap';

export type HeroSequenceHandle = {
  setProgress: (progress: number) => void;
  isReady: () => boolean;
};

export type HeroSequenceProps = {
  /** Number of frames in the `/heroframes/frame-NNN.jpg` sequence. */
  frameCount?: number;
  /** How many frames are preloaded per batch. */
  batchSize?: number;
  /** URL prefix the frames are served from. */
  basePath?: string;
};

export const HeroSequence = forwardRef<HeroSequenceHandle, HeroSequenceProps>(function HeroSequence(
  { frameCount = 192, batchSize = 10, basePath = '/heroframes' },
  ref,
) {
  const containerRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Loaded frames, dense (index = frameNumber - 1). Failed slots stay null and
  // are skipped by the renderer, so the mapping progress → frame never shifts.
  const framesRef = useRef<(HTMLImageElement | null)[]>([]);
  const currentFrameRef = useRef(-1);
  const frameAnimationRef = useRef<gsap.core.Tween | null>(null);
  const pendingProgressRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const canvasSizeRef = useRef({ width: 0, height: 0 });

  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renderFrame = (frameIndex: number) => {
    const canvas = canvasRef.current;
    const frames = framesRef.current;
    if (!canvas || frames.length === 0) return;

    const index = Math.max(0, Math.min(Math.round(frameIndex), frames.length - 1));
    const frame = frames[index];
    if (!frame || !frame.complete || !frame.naturalWidth || !frame.naturalHeight) return;
    if (currentFrameRef.current === index) return;

    currentFrameRef.current = index;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasSizeRef.current;
    if (!width || !height) return;

    // Clear and prep a black backdrop so letterboxed regions stay clean.
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Cover-fit: scale the frame so it fills the viewport while preserving the
    // image's aspect ratio, centering any overflow.
    const imageAspect = frame.naturalWidth / frame.naturalHeight;
    const canvasAspect = width / height;

    let drawWidth: number;
    let drawHeight: number;
    if (imageAspect > canvasAspect) {
      drawHeight = height;
      drawWidth = height * imageAspect;
    } else {
      drawWidth = width;
      drawHeight = width / imageAspect;
    }

    const drawX = (width - drawWidth) / 2;
    const drawY = (height - drawHeight) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(frame, drawX, drawY, drawWidth, drawHeight);
  };

  const setProgress = (progress: number) => {
    const p = Math.min(1, Math.max(0, progress));
    pendingProgressRef.current = p;

    // Reduced-motion users see a static first frame; playback is disabled.
    if (reducedMotionRef.current) return;

    const animation = frameAnimationRef.current;
    if (animation) {
      animation.progress(p);
      return;
    }

    if (framesRef.current.length > 0) {
      renderFrame(p * (framesRef.current.length - 1));
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      setProgress,
      isReady: () => isLoaded,
    }),
    [isLoaded],
  );

  // Track the reduced-motion preference live.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mq.matches;
    const onChange = (event: MediaQueryListEvent) => {
      reducedMotionRef.current = event.matches;
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Size the canvas backing store to the container × devicePixelRatio.
  const setupCanvas = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    canvasSizeRef.current = { width, height };

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Force a redraw at the current master progress.
    currentFrameRef.current = -1;
    if (framesRef.current.length === 0) return;

    const animation = frameAnimationRef.current;
    if (animation) {
      animation.progress(pendingProgressRef.current);
    } else {
      renderFrame(pendingProgressRef.current * (framesRef.current.length - 1));
    }
  };

  // Preload frames in batches so the initial render is never blocked.
  useEffect(() => {
    let cancelled = false;

    const loadFrames = async () => {
      const loadedFrames: (HTMLImageElement | null)[] = new Array(frameCount).fill(null);
      const failed: number[] = [];

      for (let start = 0; start < frameCount; start += batchSize) {
        if (cancelled) return;

        const end = Math.min(start + batchSize, frameCount);
        const batchPromises: Promise<void>[] = [];

        for (let i = start; i < end; i++) {
          batchPromises.push(
            new Promise<void>((resolve) => {
              const image = new Image();
              image.decoding = 'async';

              const timeout = window.setTimeout(() => {
                failed.push(i + 1);
                resolve();
              }, 5000);

              image.onload = () => {
                window.clearTimeout(timeout);
                loadedFrames[i] = image;
                resolve();
              };

              image.onerror = () => {
                window.clearTimeout(timeout);
                failed.push(i + 1);
                resolve();
              };

              image.src = `${basePath}/frame_${String(i + 1).padStart(4, '0')}.jpg`;
            }),
          );
        }

        await Promise.all(batchPromises);
        if (!cancelled) {
          setLoadingProgress(Math.round((end / frameCount) * 100));
        }
      }

      if (cancelled) return;

      if (loadedFrames.every((frame) => frame === null)) {
        setError('No frames could be loaded.');
        setIsLoaded(true);
        return;
      }

      framesRef.current = loadedFrames;
      currentFrameRef.current = -1;
      setupCanvas();
      renderFrame(0);
      setLoadingProgress(100);
      setIsLoaded(true);

      if (failed.length > 0) {
        console.warn(`[HeroSequence] Failed to load ${failed.length} frame(s):`, failed);
      }
    };

    void loadFrames();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Paused tween that maps master progress (0..1) onto the frame range.
  useEffect(() => {
    if (!isLoaded) return;
    if (framesRef.current.length === 0) return;

    if (reducedMotionRef.current) {
      renderFrame(0);
      return;
    }

    const state = { frame: 0 };
    const animation = gsap.to(state, {
      frame: framesRef.current.length - 1,
      duration: 1,
      ease: 'none',
      paused: true,
      onUpdate: () => {
        renderFrame(state.frame);
      },
    });
    frameAnimationRef.current = animation;

    renderFrame(0);

    // Catch up if the sequence finished loading after the master progress
    // already advanced (e.g. the parent started scrolling during preload).
    if (pendingProgressRef.current > 0) {
      animation.progress(pendingProgressRef.current);
    }

    return () => {
      animation.kill();
      frameAnimationRef.current = null;
    };
  }, [isLoaded]);

  // Keep the canvas sized correctly across viewport changes.
  useEffect(() => {
    if (!isLoaded) return;

    setupCanvas();

    let resizeTimer: number | undefined;
    const onResize = () => {
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(setupCanvas, 150);
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
    };
  }, [isLoaded]);

  // Drop every reference on unmount so the images can be garbage-collected.
  useEffect(() => {
    return () => {
      frameAnimationRef.current = null;
      framesRef.current = [];
    };
  }, []);

  return (
    <section ref={containerRef} className="hero-sequence">
      <canvas ref={canvasRef} className="hero-sequence__canvas" aria-hidden="true" />

      {error && (
        <div className="hero-sequence__error" role="alert">
          <p>Unable to load the cinematic experience.</p>
          <span>{error}</span>
        </div>
      )}

      {!isLoaded && !error && (
        <div className="hero-sequence__loader" role="status" aria-live="polite">
          <div className="hero-sequence__loader-inner">
            <span className="hero-sequence__loader-label">Preparing the experience…</span>
            <div className="hero-sequence__loader-bar">
              <div className="hero-sequence__loader-fill" style={{ width: `${loadingProgress}%` }} />
            </div>
            <span className="hero-sequence__loader-pct">{loadingProgress}%</span>
          </div>
        </div>
      )}
    </section>
  );
});

HeroSequence.displayName = 'HeroSequence';
