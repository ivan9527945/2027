// 全視之眼的小圖示（和頁籤圖示同一個圖形），閱讀頁的抬頭用。
export default function Eye({ className = "eye" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M3 32C12 17 22 11 32 11C42 11 52 17 61 32C52 47 42 53 32 53C22 53 12 47 3 32Z" fill="#f2efe6" stroke="#050505" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="14" fill="#050505" />
      <circle cx="32" cy="32" r="5.5" fill="#c8281e" />
      <circle cx="37.5" cy="26.5" r="3.2" fill="#f2efe6" />
    </svg>
  );
}
