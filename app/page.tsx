import Experience from "@/components/Experience";
import JsonLd from "@/components/JsonLd";
import { chapters, elementById } from "@/lib/content";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/site";

// 首頁：捲動的 3D 故事。畫面上沒有文字（使用者要求），但伺服器端會把整段故事的文字版——每一章的旁白、
// 117 個元素的解讀——渲染進 HTML（視覺上隱藏，螢幕閱讀器和搜尋引擎讀得到），並連到可見的閱讀頁 /story 與 /elements。
export default function Home() {
  return (
    <Experience>
      <article className="story" id="story">
        <h1>{SITE_TITLE}</h1>
        <p>{SITE_DESCRIPTION}</p>
        <p>
          <a href="/story">閱讀文字版</a>・<a href="/elements">117 個圖案的解讀</a>
        </p>
        {chapters.map((c) => (
          <section key={c.id} aria-labelledby={`h-${c.id}`}>
            <h2 id={`h-${c.id}`}>{c.title}</h2>
            {c.captions.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            <ul>
              {c.elements.map((id) => {
                const e = elementById(id);
                return (
                  <li key={id}>
                    <a href={`/elements/${id}`}>
                      #{id} {e?.name}
                    </a>
                    ：{e?.reading}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </article>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          name: SITE_TITLE,
          description: SITE_DESCRIPTION,
          url: SITE_URL,
          inLanguage: "zh-Hant",
          genre: "互動敘事",
          about: { "@type": "CreativeWork", name: "The World Ahead 2027", publisher: { "@type": "Organization", name: "The Economist" } },
          hasPart: chapters.map((c) => ({ "@type": "CreativeWork", name: c.title, url: `${SITE_URL}/story#${c.id}`, position: c.index + 1 })),
        }}
      />
    </Experience>
  );
}
