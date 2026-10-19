"use client";

import Link from "next/link";

// This component is a client component because it uses a click handler to force a full page reload when the link is clicked.
// This is necessary to clear the filters in the URL and reset the state of the page.
export default function ClearFiltersLink() {
  return (
    <Link
      href="/orders"
      onClick={() => {
        window.location.href = "/orders"; // force full reload
      }}
      className="self-center text-sm text-blue-700 underline"
    >
      Clear filters
    </Link>
  );
}
