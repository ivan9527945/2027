// 閱讀頁（/story、/elements）共用的外框：抬頭的眼睛、麵包屑、頁尾。
// 回首頁用一般的 <a>（整頁重新載入），因為 3D 引擎是單例，不能在同一頁裡重新掛載。
import type { ReactNode } from "react";
import Eye from "./Eye";

export interface Crumb {
  href: string;
  label: string;
}

export default function ReadingShell({ crumbs, children }: { crumbs: Crumb[]; children: ReactNode }) {
  return (
    <main className="read">
      <nav className="crumbs" aria-label="麵包屑">
        <a href="/" aria-label="回到 3D 故事">
          <Eye />
        </a>
        {crumbs.map((c) => (
          <span key={c.href}>
            {" / "}
            <a href={c.href}>{c.label}</a>
          </span>
        ))}
      </nav>
      {children}
      <footer>
        圖案改畫自《經濟學人》The World Ahead 2027 封面；解讀來自本專案的交叉分析，詮釋都是推測。僅供研究。
      </footer>
    </main>
  );
}
