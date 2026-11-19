import ReadingShell from "@/components/ReadingShell";

export default function NotFound() {
  return (
    <ReadingShell crumbs={[]}>
      <h1>找不到這一頁</h1>
      <p>
        <a href="/">回到 3D 故事</a>・<a href="/elements">117 個圖案</a>
      </p>
    </ReadingShell>
  );
}
