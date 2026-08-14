/**
 * Background video for the landing/overview hero.
 *
 * Renders the gateway film as a cover-cropped layer behind the hero content.
 * The `poster` is the first extracted frame, so the composition is identical
 * before the media loads and under `prefers-reduced-motion` (CSS swaps the
 * moving <video> for the static frame).
 */
export function HeroVideo() {
  return (
    <div className="hero-video" aria-hidden="true">
      <video
        className="hero-video__media"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/heroframes/frame_0001.jpg"
        disablePictureInPicture
        tabIndex={-1}
      >
        <source src="/gate.mp4" type="video/mp4" />
      </video>
      <div className="hero-video__overlay" />
    </div>
  );
}
