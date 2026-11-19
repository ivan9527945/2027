import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import ReadingShell from "@/components/ReadingShell";
import { elementById, elements } from "@/lib/content";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// 117 個圖案各一頁，請求時在伺服器端渲染；不在清單裡的編號回 404（notFound）。

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const e = elementById(Number(id));
  if (!e) return {};
  const title = `#${e.id} ${e.name}`;
  const description = `${e.reading}${e.level ? `（可信度：${e.level}）` : ""}`.slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: `/elements/${e.id}` },
    openGraph: { type: "article", url: `/elements/${e.id}`, title, description },
  };
}

export default async function ElementPage({ params }: Props) {
  const { id } = await params;
  const e = elementById(Number(id));
  if (!e) notFound();
  const index = elements.findIndex((x) => x.id === e.id);
  const prev = elements[index - 1];
  const next = elements[index + 1];
  return (
    <ReadingShell
      crumbs={[
        { href: "/elements", label: "117 個圖案" },
        { href: `/elements/${e.id}`, label: `#${e.id}` },
      ]}
    >
      <article>
        <header>
          <p className="kicker">{e.chapter ? `第 ${e.chapter.index + 1} 段・${e.chapter.title}` : "THE WORLD AHEAD 2027"}</p>
          <h1>
            #{e.id} {e.name}
          </h1>
          <p className="lede">{e.reading}</p>
        </header>
        <dl>
          {e.level && (
            <>
              <dt>可信度</dt>
              <dd>
                <span className="level">{e.level}</span>
              </dd>
            </>
          )}
          {e.detail && (
            <>
              <dt>封面上</dt>
              <dd>{e.detail}</dd>
            </>
          )}
          {e.color && (
            <>
              <dt>顏色</dt>
              <dd>{e.color}</dd>
            </>
          )}
          {e.count > 1 && (
            <>
              <dt>數量</dt>
              <dd>{e.count}</dd>
            </>
          )}
          {e.region && (
            <>
              <dt>位置</dt>
              <dd>{e.region}</dd>
            </>
          )}
        </dl>
        {e.dual && (
          <section aria-labelledby="h-dual">
            <h2 id="h-dual">兩種讀法並存</h2>
            <ul>
              <li>甲：{e.dual.a}</li>
              <li>乙：{e.dual.b}</li>
            </ul>
            <p>要等{e.dual.settledBy}才能定案。</p>
          </section>
        )}
        {e.predictions.length > 0 && (
          <section aria-labelledby="h-pred">
            <h2 id="h-pred">相關的 2027 推測</h2>
            <ul>
              {e.predictions.map((p) => (
                <li key={p.id}>
                  <a href={`/story#${p.id}`}>{p.id}</a>（{p.tier}）：{p.text}
                </li>
              ))}
            </ul>
          </section>
        )}
        {e.chapter && (
          <section aria-labelledby="h-chapter">
            <h2 id="h-chapter">出現在故事的「{e.chapter.title}」</h2>
            {e.chapter.captions.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            <p>
              <a href={`/story#${e.chapter.id}`}>在文字版裡閱讀這一段</a>
            </p>
          </section>
        )}
        <nav aria-label="上一個與下一個圖案">
          <p>
            {prev && <a href={`/elements/${prev.id}`}>← #{prev.id} {prev.name}</a>}
            {prev && next && "　"}
            {next && <a href={`/elements/${next.id}`}>#{next.id} {next.name} →</a>}
          </p>
        </nav>
      </article>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "DefinedTerm",
          name: `#${e.id} ${e.name}`,
          description: e.reading,
          url: `${SITE_URL}/elements/${e.id}`,
          inDefinedTermSet: { "@type": "DefinedTermSet", name: "The World Ahead 2027 封面圖案", url: `${SITE_URL}/elements` },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "117 個圖案", item: `${SITE_URL}/elements` },
            { "@type": "ListItem", position: 3, name: `#${e.id} ${e.name}`, item: `${SITE_URL}/elements/${e.id}` },
          ],
        }}
      />
    </ReadingShell>
  );
}
