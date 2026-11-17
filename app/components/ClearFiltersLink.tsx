import Link from "next/link";

export default function ClearFiltersLink() {
  return (
    <Link href="/orders" className="self-center text-sm text-blue-700 underline">
      Clear filters
    </Link>
  );
}
