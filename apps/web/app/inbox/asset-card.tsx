import type { KnowledgeAsset } from "@saave/shared-types";

type AssetCardProps = {
  asset: KnowledgeAsset;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function displayTitle(asset: KnowledgeAsset): string {
  if (asset.title) return asset.title;
  if (asset.type === "url" && asset.url) return asset.url;
  if (asset.type === "text" && asset.raw_content) {
    return asset.raw_content.length > 80
      ? `${asset.raw_content.slice(0, 80)}…`
      : asset.raw_content;
  }
  return `${asset.type} capture`;
}

export function AssetCard({ asset }: AssetCardProps) {
  const title = displayTitle(asset);

  return (
    <article className="rounded-lg border border-neutral-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-600">
              {asset.type}
            </span>
            <time className="text-xs text-neutral-400">{formatDate(asset.created_at)}</time>
          </div>

          {asset.type === "url" && asset.url ? (
            <a
              href={asset.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate font-medium text-blue-600 hover:underline"
            >
              {title}
            </a>
          ) : (
            <p className="font-medium">{title}</p>
          )}

          {asset.type === "text" && asset.raw_content && asset.title && (
            <p className="mt-2 line-clamp-3 text-sm text-neutral-600">{asset.raw_content}</p>
          )}

          {asset.summary && (
            <p className="mt-2 line-clamp-2 text-sm text-neutral-500">{asset.summary}</p>
          )}

          {asset.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {asset.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}