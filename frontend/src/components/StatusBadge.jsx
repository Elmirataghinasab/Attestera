const STYLES = {
  Active: "bg-registry-light text-registry border-registry/30",
  Expired: "bg-[#FBF3E7] text-brass border-brass/30",
  Revoked: "bg-seal-light text-seal border-seal/30",
};

export default function StatusBadge({ status }) {
  const style = STYLES[status] || "bg-line/30 text-muted border-line";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-sm ${style}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
