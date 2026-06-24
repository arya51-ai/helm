/**
 * Unified guest reviews for an independent property — every site an owner is rated on, pulled under
 * one roof. Today a motel owner checks Google, Tripadvisor, Booking.com and Expedia in four separate
 * apps, each on its own scale (Booking.com is out of 10). Helm blends them into one score and one
 * recent feed, and reads back what guests bring up the most.
 *
 * Mock data for the Northwood demo, anchored to the property's real public profile (~4.5★, well
 * reviewed; praised for cleanliness, the owners, and the swing-bridge location — with the occasional
 * honest "rooms are a little dated" note).
 */

export type ReviewPlatform = "google" | "tripadvisor" | "bookingcom" | "expedia";

export interface PlatformRating {
  platform: ReviewPlatform;
  label: string;
  /** Native score exactly as the platform shows it (Booking.com on /10, the rest on /5). */
  score: number;
  scale: 5 | 10;
  count: number;
  /** Brand-ish accent for the platform chip, legible on the dark canvas. */
  color: string;
}

export interface GuestReview {
  id: string;
  platform: ReviewPlatform;
  author: string;
  rating: number;
  scale: 5 | 10;
  date: string; // ISO
  title: string;
  text: string;
}

export interface ReviewHighlight {
  label: string;
  /** How often guests bring it up. */
  count: number;
  sentiment: "love" | "watch";
}

export interface ReviewSummary {
  /** Blended score normalized to /5, volume-weighted across platforms. */
  blended: number;
  totalCount: number;
  platforms: PlatformRating[];
  reviews: GuestReview[];
  highlights: ReviewHighlight[];
}

const META: Record<ReviewPlatform, { label: string; color: string }> = {
  google: { label: "Google", color: "#6fa8dc" },
  tripadvisor: { label: "Tripadvisor", color: "#34c79a" },
  bookingcom: { label: "Booking.com", color: "#4c83c4" },
  expedia: { label: "Expedia", color: "#f4b740" },
};

const PLATFORMS: PlatformRating[] = [
  { platform: "google", ...META.google, score: 4.6, scale: 5, count: 70 },
  { platform: "tripadvisor", ...META.tripadvisor, score: 4.5, scale: 5, count: 33 },
  { platform: "bookingcom", ...META.bookingcom, score: 8.8, scale: 10, count: 16 },
  { platform: "expedia", ...META.expedia, score: 4.4, scale: 5, count: 9 },
];

const REVIEWS: GuestReview[] = [
  {
    id: "r1", platform: "google", author: "Karen M.", rating: 5, scale: 5, date: "2026-06-19",
    title: "Spotless, right by the swing bridge",
    text: "Sam and his family made us feel so welcome. The room was immaculate and you can walk to everything in Pinecrest. Already booking for next summer.",
  },
  {
    id: "r2", platform: "tripadvisor", author: "DaveFromBarrie", rating: 5, scale: 5, date: "2026-06-15",
    title: "Perfect base for Pinecrest",
    text: "Three nights exploring the island. Clean, quiet, friendly owners who pointed us to Bridal Veil Falls. You can't beat the value up here.",
  },
  {
    id: "r3", platform: "bookingcom", author: "Sophie", rating: 9, scale: 10, date: "2026-06-12",
    title: "Great value, walkable to everything",
    text: "Lovely little motel steps from the boardwalk. Comfy bed, spotless bathroom. Would happily stay again.",
  },
  {
    id: "r4", platform: "google", author: "Mark R.", rating: 4, scale: 5, date: "2026-06-08",
    title: "Clean and comfortable",
    text: "Rooms are a touch dated but very well kept, and the hosts are wonderful. Great sunset views over the North Channel.",
  },
  {
    id: "r5", platform: "expedia", author: "Linda H.", rating: 4, scale: 5, date: "2026-06-03",
    title: "Lovely hosts, great location",
    text: "Friendly check-in, easy parking, walk to dinner. Older property but clean and very quiet.",
  },
  {
    id: "r6", platform: "tripadvisor", author: "northern_traveller", rating: 5, scale: 5, date: "2026-05-28",
    title: "Best sunset on the North Channel",
    text: "We come back every year. Honest, hardworking owners and the cleanest rooms on the island.",
  },
  {
    id: "r7", platform: "bookingcom", author: "Hans", rating: 8, scale: 10, date: "2026-05-22",
    title: "Quiet, clean, friendly",
    text: "Good stop on our Pinecrest road trip. Simple, tidy, and the owners couldn't be kinder.",
  },
  {
    id: "r8", platform: "google", author: "Jen K.", rating: 5, scale: 5, date: "2026-05-17",
    title: "Felt like home",
    text: "Booked direct after finding them on Google. We'll be back for Summerfest weekend — book early, they sell out!",
  },
];

const HIGHLIGHTS: ReviewHighlight[] = [
  { label: "Spotless rooms", count: 41, sentiment: "love" },
  { label: "Friendly owners", count: 33, sentiment: "love" },
  { label: "Walk to town", count: 28, sentiment: "love" },
  { label: "Great value", count: 22, sentiment: "love" },
  { label: "Rooms a little dated", count: 9, sentiment: "watch" },
];

/** Normalize any platform score to a /5 scale. */
export const toFive = (score: number, scale: 5 | 10) => (scale === 10 ? score / 2 : score);

/** The blended, one-roof review picture for Northwood. */
export function northwoodReviews(): ReviewSummary {
  const totalCount = PLATFORMS.reduce((a, p) => a + p.count, 0);
  const weighted = PLATFORMS.reduce((a, p) => a + toFive(p.score, p.scale) * p.count, 0);
  const blended = Math.round((weighted / totalCount) * 10) / 10;
  return {
    blended,
    totalCount,
    platforms: PLATFORMS,
    reviews: REVIEWS,
    highlights: HIGHLIGHTS,
  };
}
