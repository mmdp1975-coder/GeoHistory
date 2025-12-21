// frontend/app/module/about/page.tsx
import styles from "./page.module.css";

export default function AboutPage() {
  return (
    <main className={`${styles.root} relative overflow-hidden`}>
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 18%, rgba(31, 122, 140, 0.18), transparent 55%), radial-gradient(circle at 85% 12%, rgba(217, 123, 74, 0.18), transparent 50%), radial-gradient(circle at 72% 85%, rgba(122, 162, 102, 0.2), transparent 55%)",
          }}
        />
        <div className={styles.grid} />
        <div className={`${styles.orb} ${styles.orbOne}`} aria-hidden="true" />
        <div className={`${styles.orb} ${styles.orbTwo}`} aria-hidden="true" />
      </div>

      <div className="relative mx-auto flex min-h-[70vh] max-w-6xl items-center px-6 py-16 md:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6 motion-safe:animate-[rise_0.8s_ease-out]">
            <span className={styles.kicker}>About GeoHistory</span>
            <h1 className={`${styles.title} text-4xl font-semibold leading-tight md:text-5xl`}>
              What is GeoHistory
            </h1>
            <div className={`${styles.text} space-y-4 text-base md:text-lg`}>
              <p>
                GeoHistory is an interactive platform dedicated to exploring world history through geography and time.
                It transforms historical events into journeys that can be explored on maps, timelines, and immersive visual narratives.
              </p>
              <p>
                GeoHistory is designed for students, teachers, history enthusiasts, and anyone curious about how civilizations, cultures, and events evolved across space and centuries.
              </p>
              <p>
                By combining accurate historical data, geographic visualization, and storytelling, GeoHistory helps users understand history not as isolated facts, but as connected stories unfolding across the world.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className={`${styles.card} motion-safe:animate-[rise_0.9s_ease-out]`}>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--gh-muted)]">Core experience</p>
              <p className="mt-3 text-2xl font-semibold text-[var(--gh-ink)]">History becomes a living atlas.</p>
              <p className="mt-3 text-sm text-[var(--gh-muted)]">
                Follow events across continents, trace timelines, and connect stories with geographic context.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className={styles.chip}>Maps</span>
                <span className={styles.chip}>Timelines</span>
                <span className={styles.chip}>Journeys</span>
                <span className={styles.chip}>Narratives</span>
              </div>
            </div>

            <div className={`${styles.card} ${styles.altCard} motion-safe:animate-[rise_1s_ease-out]`}>
              <p className="text-xs uppercase tracking-[0.28em] text-[var(--gh-muted)]">Who it is for</p>
              <p className="mt-3 text-2xl font-semibold text-[var(--gh-ink)]">Built for learning and curiosity.</p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm text-[var(--gh-muted)]">
                <span className={styles.tag}>Students</span>
                <span className={styles.tag}>Teachers</span>
                <span className={styles.tag}>Enthusiasts</span>
                <span className={styles.tag}>Explorers</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
