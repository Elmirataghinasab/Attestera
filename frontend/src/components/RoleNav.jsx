const ROLES = [
  { id: "admin", label: "Admin", blurb: "Approve institutions, add majors" },
  { id: "issuer", label: "Issuer", blurb: "Issue and revoke credentials" },
  { id: "owner", label: "Owner", blurb: "Manage your credentials" },
  { id: "verifier", label: "Verifier", blurb: "Check a credential" },
];

export default function RoleNav({ active, onChange }) {
  return (
    <nav className="w-56 shrink-0 border-r border-line px-3 py-6">
      <p className="px-3 pb-3 text-xs uppercase tracking-wide text-muted">Dashboards</p>
      <ul className="space-y-1">
        {ROLES.map((role) => (
          <li key={role.id}>
            <button
              onClick={() => onChange(role.id)}
              className={`w-full rounded-sm px-3 py-2 text-left transition-colors ${
                active === role.id ? "bg-registry-light text-registry" : "hover:bg-line/30"
              }`}
            >
              <div className="font-medium">{role.label}</div>
              <div className="text-xs text-muted">{role.blurb}</div>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
