/** Small square thumbnail for lists and pickers; a neutral placeholder when the item has no image. */
export function ProductThumb({ url, name, size = 32 }: { url: string | null | undefined; name: string; size?: number }) {
  return url ? (
    <img
      src={url}
      alt={name}
      loading="lazy"
      width={size}
      height={size}
      className="shrink-0 rounded border bg-white object-contain"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded border bg-muted text-[10px] font-semibold text-muted-foreground"
      style={{ width: size, height: size }}
    >
      {name.trim().charAt(0)}
    </span>
  );
}
