"use client";

import { useState } from "react";
import type { DayTrend } from "@/lib/dashboard";

export function MessageTrendChart({ data }: { data: DayTrend[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxVal = Math.max(...data.map((d) => Math.max(d.incoming, d.outgoing, 1)), 10);
  const totalOutgoing = data.reduce((acc, d) => acc + d.outgoing, 0);
  const totalIncoming = data.reduce((acc, d) => acc + d.incoming, 0);

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-line bg-surface p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-fg">Aktivitas Pesan (7 Hari)</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            Total {totalOutgoing} pesan keluar · {totalIncoming} pesan masuk
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-fg">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" /> Keluar
          </span>
          <span className="flex items-center gap-1.5 text-fg">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Masuk
          </span>
        </div>
      </div>

      {/* Chart visualization */}
      <div className="mt-6 flex h-48 items-end gap-2 sm:gap-4">
        {data.map((item, idx) => {
          const outHeight = Math.max(4, (item.outgoing / maxVal) * 100);
          const inHeight = Math.max(4, (item.incoming / maxVal) * 100);
          const isHovered = hoveredIndex === idx;

          return (
            <div
              key={item.isoDate}
              className="group relative flex flex-1 flex-col items-center justify-end h-full cursor-pointer"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Tooltip */}
              {isHovered && (
                <div className="absolute -top-12 z-20 whitespace-nowrap rounded-lg border border-line bg-ink px-2.5 py-1.5 text-[11px] shadow-xl">
                  <p className="font-semibold text-fg">{item.date}</p>
                  <p className="text-accent-bright">Keluar: {item.outgoing}</p>
                  <p className="text-sky-300">Masuk: {item.incoming}</p>
                </div>
              )}

              {/* Bars */}
              <div className="flex w-full items-end justify-center gap-1 sm:gap-1.5 h-36">
                <div
                  className={`w-full max-w-[14px] rounded-t-md transition-all ${
                    isHovered ? "bg-accent-bright" : "bg-accent/80 hover:bg-accent"
                  }`}
                  style={{ height: `${outHeight}%` }}
                />
                <div
                  className={`w-full max-w-[14px] rounded-t-md transition-all ${
                    isHovered ? "bg-sky-300" : "bg-sky-400/80 hover:bg-sky-400"
                  }`}
                  style={{ height: `${inHeight}%` }}
                />
              </div>

              {/* Day Label */}
              <span className="mt-2 block truncate text-[11px] font-medium text-fg-faint group-hover:text-fg">
                {item.date.split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
