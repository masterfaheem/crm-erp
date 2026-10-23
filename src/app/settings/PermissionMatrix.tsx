"use client";

import { useMemo, useState } from "react";
import { PERMISSION_GROUPS, ROLE_TEMPLATES } from "@/lib/permissions";

/* Tick-box grid of every permission, grouped by area.
   🔒 = confidential (money, cost, profit, khata, exports). */
export default function PermissionMatrix({
  value,
  onChange,
  readOnly = false,
  showTemplates = true,
}: {
  value: string[];
  onChange?: (keys: string[]) => void;
  readOnly?: boolean;
  showTemplates?: boolean;
}) {
  const set = useMemo(() => new Set(value), [value]);
  const [onlyTicked, setOnlyTicked] = useState(false);

  const total = PERMISSION_GROUPS.reduce((n, g) => n + g.items.length, 0);
  const set_ = (keys: Set<string>) => onChange?.([...keys]);

  const toggle = (key: string) => {
    if (readOnly) return;
    const next = new Set(set);
    if (next.has(key)) {
      next.delete(key);
      // removing "view" of an area removes its other ticks too
      const [mod, act] = key.split(".");
      if (act === "view") for (const k of [...next]) if (k.startsWith(mod + ".")) next.delete(k);
    } else {
      next.add(key);
      // any action in an area needs its "view" (when the area has one)
      const [mod] = key.split(".");
      const view = `${mod}.view`;
      if (PERMISSION_GROUPS.some((g) => g.items.some((i) => i.key === view)) && key !== view) next.add(view);
    }
    set_(next);
  };

  const toggleGroup = (keys: string[], on: boolean) => {
    if (readOnly) return;
    const next = new Set(set);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    set_(next);
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {showTemplates && (
            <>
              <span className="text-xs font-medium text-gray-500">Quick start:</span>
              {ROLE_TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  title={t.description}
                  onClick={() => set_(new Set(t.keys))}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-[#17D65D] hover:text-gray-900"
                >
                  {t.name}
                </button>
              ))}
            </>
          )}
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => set_(new Set())} className="text-xs font-medium text-gray-500 hover:text-red-600">
              Clear all
            </button>
          </span>
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          <b className="text-gray-900">{value.length}</b> of {total} permissions ticked ·{" "}
          <span className="text-amber-700">🔒 = confidential</span>
        </span>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={onlyTicked} onChange={(e) => setOnlyTicked(e.target.checked)} className="accent-[#17D65D]" />
          Show ticked only
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {PERMISSION_GROUPS.map((g) => {
          const keys = g.items.map((i) => i.key);
          const on = keys.filter((k) => set.has(k)).length;
          const items = onlyTicked ? g.items.filter((i) => set.has(i.key)) : g.items;
          if (onlyTicked && !items.length) return null;
          const all = on === keys.length;
          return (
            <div key={g.module} className={`rounded-lg border bg-white ${on ? "border-[#17D65D]/40" : "border-gray-200"}`}>
              <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span>{g.icon}</span>
                  {g.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${on ? "bg-[#17D65D]/15 text-[#0fa846]" : "bg-gray-100 text-gray-400"}`}>
                    {on}/{keys.length}
                  </span>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(keys, !all)}
                    className="text-[11px] font-medium text-gray-500 hover:text-gray-900"
                  >
                    {all ? "None" : "All"}
                  </button>
                )}
              </div>
              <ul className="divide-y divide-gray-50">
                {items.map((it) => {
                  const checked = set.has(it.key);
                  return (
                    <li key={it.key}>
                      <label
                        className={`flex items-start gap-2.5 px-3 py-2 ${readOnly ? "" : "cursor-pointer hover:bg-gray-50"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={readOnly}
                          onChange={() => toggle(it.key)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#17D65D]"
                        />
                        <span className="min-w-0">
                          <span className={`text-sm ${checked ? "text-gray-900" : "text-gray-600"}`}>
                            {it.label}
                            {it.confidential && (
                              <span className="ml-1.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-700">🔒</span>
                            )}
                          </span>
                          {it.hint && <span className="block text-[11px] text-gray-400">{it.hint}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
