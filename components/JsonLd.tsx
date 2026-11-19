// 結構化資料（schema.org JSON-LD），讓搜尋引擎理解頁面的種類與內容。
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
