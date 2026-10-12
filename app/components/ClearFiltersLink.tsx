"use client";

import Link from "next/link";

export default function ClearFiltersLink() {
  return (
    <Link
      href="/student"
      onClick={() => {
        window.location.href = "/student"; // force full reload
      }}
      className="self-center text-sm text-blue-700 underline"
    >
      Clear filters
    </Link>
  );
}