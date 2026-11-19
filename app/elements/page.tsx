import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import ReadingShell from "@/components/ReadingShell";
import { chapters, elementById, elements } from "@/lib/content";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const title = "117 個圖案的解讀";
const description = "The World Ahead 2027 封面上全部 117 個圖案：每一個畫了什麼、代表什麼、可信度多高，依故事的段落分組。";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/elements" },
  openGraph: { type: "website", url: "/elements", title, description },
};

export default function ElementsPage() {
  return (
    <ReadingShell crumbs={[{ href: "/elements", label: "117 個圖案" }]}>
      <header>
        <p className="kicker">THE WORLD AHEAD 2027</p>
        <h1>{title}</h1>
        <p className="lede">{description}</p>
      </header>
      {chapters.map((c) => (
        <section key={c.id} aria-labelledby={`h-${c.id}`}>
          <h2 id={`h-${c.id}`}>{c.title}</h2>
          <ul className="grid">
            {c.elements.map((id) => {
              const e = elementById(id);
              return (
                <li key={id}>
                  <a href={`/elements/${id}`}>
                    #{id} {e?.name}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: title,
          numberOfItems: elements.length,
          itemListElement: elements.map((e, i) => ({ "@type": "ListItem", position: i + 1, name: `#${e.id} ${e.name}`, url: `${SITE_URL}/elements/${e.id}` })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "117 個圖案", item: `${SITE_URL}/elements` },
          ],
        }}
      />
    </ReadingShell>
  );
}
