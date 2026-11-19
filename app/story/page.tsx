import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import ReadingShell from "@/components/ReadingShell";
import { chapters, elementById, limits, predictions, rejected, rumors } from "@/lib/content";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const title = "文字版：16 段劇情、26 條推測與 19 則流言";
const description = "The World Ahead 2027 封面捲動故事的完整文字版：每一段劇情的旁白與圖案，從封面推出的 2027 推測（含可信度與證偽條件），以及網路流言的查核。";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/story" },
  openGraph: { type: "article", url: "/story", title, description },
};

export default function StoryPage() {
  return (
    <ReadingShell crumbs={[{ href: "/story", label: "文字版" }]}>
      <article>
        <header>
          <p className="kicker">THE WORLD AHEAD 2027</p>
          <h1>{title}</h1>
          <p className="lede">{description}</p>
          <a className="cta" href="/">
            進入 3D 故事
          </a>
        </header>
        <nav aria-label="目錄">
          <h2>目錄</h2>
          <ol>
            {chapters.map((c) => (
              <li key={c.id}>
                <a href={`#${c.id}`}>{c.title}</a>
              </li>
            ))}
            <li>
              <a href="#predictions">2027 推測</a>
            </li>
            <li>
              <a href="#rumors">流言查核</a>
            </li>
          </ol>
        </nav>
        {chapters.map((c) => (
          <section key={c.id} id={c.id} aria-labelledby={`h-${c.id}`}>
            <h2 id={`h-${c.id}`}>
              {c.index + 1}. {c.title}
            </h2>
            {c.captions.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            <ul className="tags" aria-label="這一段的圖案">
              {c.elements.map((id) => (
                <li key={id}>
                  <a href={`/elements/${id}`}>
                    #{id} {elementById(id)?.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section id="predictions" aria-labelledby="h-predictions">
          <h2 id="h-predictions">2027 推測</h2>
          <p>從封面圖案推出來的預測。每一條都附上依據的圖案、可信度，以及什麼事發生就代表猜錯了。</p>
          {predictions.map((p) => (
            <article key={p.id} id={p.id}>
              <h3>
                {p.id}　<span className="level">{p.tier}</span>
              </h3>
              <p>{p.text}</p>
              <dl>
                <dt>依據</dt>
                <dd>{p.basis}</dd>
                <dt>理由</dt>
                <dd>{p.reason}</dd>
                <dt>證偽條件</dt>
                <dd>{p.falsifiedBy}</dd>
              </dl>
            </article>
          ))}
          <h3>排除的說法</h3>
          <ul>
            {rejected.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
        <section id="rumors" aria-labelledby="h-rumors">
          <h2 id="h-rumors">流言查核</h2>
          {rumors.map((r) => (
            <article key={r.claim}>
              <h3>{r.claim}</h3>
              <p>
                <span className="level">{r.verdict}</span> {r.reason}
              </p>
            </article>
          ))}
        </section>
        <section aria-labelledby="h-limits">
          <h2 id="h-limits">這份分析的限制</h2>
          <ul>
            {limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      </article>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          description,
          inLanguage: "zh-Hant",
          url: `${SITE_URL}/story`,
          isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
          about: { "@type": "CreativeWork", name: "The World Ahead 2027", publisher: { "@type": "Organization", name: "The Economist" } },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "文字版", item: `${SITE_URL}/story` },
          ],
        }}
      />
    </ReadingShell>
  );
}
