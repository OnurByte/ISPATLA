import { notFound } from 'next/navigation';

// Keep unmatched nested URLs out of the authenticated workspace's modal fallback.
export default function MissingRoute() {
  notFound();
}
