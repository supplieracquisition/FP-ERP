"use client";

import Link from "next/link";

export default function ViewToggle({
  current,
  basePath = "/orders",
}: {
  current: "table" | "kanban";
  basePath?: string;
}) {
  return (
    <div className="flex items-center rounded-md border border-gray-300 overflow-hidden text-xs font-medium">
      <Link
        href={basePath}
        className={`px-3 py-1.5 transition-colors ${
          current === "table"
            ? "bg-gray-900 text-white"
            : "text-gray-500 hover:bg-gray-50"
        }`}
      >
        Table
      </Link>
      <Link
        href={`${basePath}?view=kanban`}
        className={`px-3 py-1.5 border-l border-gray-300 transition-colors ${
          current === "kanban"
            ? "bg-gray-900 text-white"
            : "text-gray-500 hover:bg-gray-50"
        }`}
      >
        Board
      </Link>
    </div>
  );
}
