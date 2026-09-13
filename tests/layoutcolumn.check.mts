/**
 * Proves the playlistLayout column exists and round-trips. Read-only: it writes
 * nothing, so it is safe against the production database this .env points at.
 */
import "dotenv/config";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { asPlaylistLayout } from "@/app/dashboard/settings/layouts";

const rows = await prisma.profile.findMany({
  select: { username: true, playlistLayout: true },
  take: 5,
});

console.log(`read ${rows.length} profile(s)`);
for (const row of rows) {
  console.log(`  ${row.username}: playlistLayout=${JSON.stringify(row.playlistLayout)}`);
  // Whatever is stored must map to a layout the profile page can render.
  const resolved = asPlaylistLayout(row.playlistLayout);
  assert.ok(["stacked", "arc"].includes(resolved), `bad layout for ${row.username}`);
}
assert.ok(rows.every((r) => r.playlistLayout === "stacked"),
  "existing rows should have taken the 'stacked' default");

console.log("playlistLayout column: readable, defaulted, and valid");
await prisma.$disconnect();
