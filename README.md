# SpindlShare

**Everything you've got spinning.** A shareable shelf for your music playlists —
connect Spotify and YouTube, pick what you want to show, and share it all from
one link (`spindlshare.vercel.app/yourname`).

Built with Next.js 16 (App Router) + TypeScript, Prisma 7 + Postgres, and
Auth.js v5. Deploys to Vercel.

---

## Getting started

```bash
npm install                  # also runs `prisma generate` via postinstall
cp .env.example .env         # then fill in the values (see below)
npx prisma dev --detach      # local Postgres, or point DATABASE_URL at Neon
npm run db:migrate           # apply the schema
npm run db:seed              # optional: demo profile at /demo
npm run dev                  # http://127.0.0.1:3000
```

> Use `127.0.0.1`, not `localhost` — Spotify rejects `localhost` redirect URIs
> for the **connect** flow, whose URL we build ourselves.
>
> Sign in with Google or the email link.

### Minimum env to boot

`AUTH_SECRET` (`npx auth secret`), `TOKEN_ENCRYPTION_KEY`
(`openssl rand -base64 32`), and `DATABASE_URL` / `DIRECT_URL`. Provider
credentials are only needed for the features that use them — the login page
offers only the sign-in methods that are configured, and the Connections page
shows a "not configured" state until they're set. See `.env.example` for where to
obtain each value.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (typechecks) |
| `npm run lint` | ESLint |
| `npm run check` | All logic checks (see below) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Seed a demo profile |
| `npm run db:studio` | Prisma Studio |

`npm run check` runs eight suites: `crypto`, `sync`, `youtube`, `hardening`,
`username`, `rename`, `admin` and `link`. Each is also runnable on its own
(`npm run check:sync`). They're plain `tsx` scripts with a `check()` helper rather
than a test framework — enough to assert the invariants that matter without
another dependency in the tree.

`crypto`, `youtube`, `hardening`, `link` and `authurl` run anywhere. `sync`, `username`,
`rename` and `admin` need a live database; they create rows under a timestamped
prefix and clean up after themselves.

## How it's put together

```
app/page.tsx                      landing page
app/halftone-field.tsx            its animated backdrop, shared with the auth screens
app/landing-actions.tsx           the sign-in card, and the links that open it
app/[username]/                   public profile page + OG image
app/(auth)/layout.tsx             one backdrop for all three auth screens
app/(auth)/                       login, magic-link verify, username onboarding
app/dashboard/page.tsx            the paste-a-link screen a new account lands on
app/dashboard/paste-link-form.tsx the link row, shared by that screen and the board
app/dashboard/settings-menu.tsx   the header gear: Admin (admins only), Settings, Sign out
app/dashboard/settings/          profile, username, and self-serve deletion
app/api/avatar/                  photo upload to Vercel Blob
app/dashboard/welcome-moment.tsx  the greeting a new account gets, once
app/(legal)/                      privacy policy and terms
app/admin/                        moderation and site overview
app/api/connect/                  OAuth start + callback (per provider)
app/api/sync/                     pull playlists from a connected provider
app/api/visit/                    the visit counter's write end
app/api/health/                   deployment diagnostics
components/sign-in-options.tsx    the providers, shared by the card and /login
lib/providers/                    one module per music service
lib/sync.ts                       reconciles fetched playlists into the DB
lib/crypto.ts                     AES-256-GCM for stored OAuth tokens
lib/rate-limit.ts                 per-account + per-IP fixed windows
lib/admin-metrics.ts              the admin page's counts and signup trends
lib/dal.ts                        the authoritative session and profile checks
proxy.ts                          optimistic auth gate (Next 16's renamed middleware)
```

### Notable decisions

- **App login and music connections are separate OAuth systems.** Auth.js
  handles sign-in only; Spotify/YouTube connections are hand-rolled and stored
  in `ConnectedAccount` with encrypted tokens. This keeps login scopes minimal
  and lets a music account be revoked without affecting sign-in.
- **Google's OAuth client is reused for both** login and YouTube-connect, with
  different redirect URIs and scopes — one client to manage instead of two.
- **Sync never destroys curation.** `visible` and `sortOrder` are set only when a
  playlist is first seen. Playlists that vanish upstream are flagged stale, not
  deleted, so a curated order never silently changes.
- **New imports default to hidden**, so connecting an account doesn't dump a
  hundred playlists onto your public page.
- **Refresh re-runs the paste, it does not sync an account.** Spotify and
  YouTube only grant the OAuth scopes bulk import needs to approved
  organisations, so in practice every playlist here arrives as a pasted link.
  The reload icon on the "Chosen" row re-reads each one through the same oEmbed
  lookup pasting uses, writing back a changed name or cover art, and reports
  what it found -- "5 playlists checked, 197 songs, 5 updated" -- in a card that
  floats clear of the flow and then takes itself away. Inline, it would have
  shifted every playlist below it each time it appeared and went.
- **The player is ours, not an iframe.** Spotify's embed only streams to a
  visitor with their own session open, so on a public page it mostly sits there
  doing nothing, and a cross-origin iframe cannot be restyled to match anything.
  Every track carries a 30-second preview MP3 that plays for anyone, so the song
  rows are the controls and the audio is a plain `<audio>` element. Full tracks
  are impossible for a signed-out visitor either way; this at least plays, and
  looks like the rest of the page. YouTube keeps its iframe, having no previews.
- **The songs come from Spotify's own embed page**, not from oEmbed. oEmbed
  publishes ten fields and not one is a track, which is why the song list sat
  empty at first; the embed page ships its whole `trackList` in a
  `__NEXT_DATA__` blob that needs no account. That blob is internal and carries
  no compatibility promise, so `lib/playlist-tracks.ts` searches for the list
  rather than walking a fixed path, and every failure returns an empty array: a
  shape change costs the song list and never the page. Songs are read when a
  link is pasted as well as on refresh, so a new playlist never opens empty. The connected-
  account sync path still exists behind `/api/sync` for the day that approval
  comes through; nothing in the UI reaches it.
- **YouTube's songs come from its playlist page**, whose `ytInitialData` lists
  the first 100 with their video ids, and YouTube Music's art tracks among
  them: their "Artist - Topic" channel is where the artist name comes from.
  YouTube has no audio-only previews, so its songs play through the IFrame
  API player, kept on the page at opacity 0 behind the same bar and rows as
  Spotify's: a video window above a song list read as a different product.
  This is a deliberate trade against YouTube's API terms, which require the
  player to stay visible; if YouTube enforces them, this is what breaks. It
  is opacity rather than `display: none`, which stops the frame loading at
  all. The player opens on the first song rather than on the list, because
  some YouTube Music list ids load in the embed as "This video is unavailable".
  The watch URL is stored in `previewUrl`, being what plays the row, which
  spared a migration.
- **A YouTube 401 is not taken at its word.** YouTube's oEmbed refuses some
  playlists anyone can open, answering 401 exactly as it does for a private
  one, so a perfectly public link was rejected as private. On a refusal the
  resolver reads the playlist page's `og:` tags instead, and accepts them only
  when `og:url` names the same list: a missing or private playlist renders
  there as the literal string "undefined".
- **Tokens are encrypted at rest** (AES-256-GCM) rather than stored in plaintext.
- **`@prisma/adapter-pg` over the Neon serverless driver**, so the same code path
  works against local Postgres and Neon.
- **`proxy.ts` only checks for a cookie.** It runs on every dashboard request, so
  it stays a cheap optimistic gate; the authoritative check lives in `lib/dal.ts`,
  next to the data it protects.
- **Signing in opens a card, but `/login` is still a real page.** The landing
  page's links intercept their own click and open a `<dialog>`; if that fails,
  or JavaScript never arrives, the click is never intercepted and the browser
  follows the href. `/login` is not merely that fallback — the proxy sends every
  unauthenticated dashboard request there with a `callbackUrl`, and Auth.js
  reports its own errors there, which a card that never receives an `?error=`
  cannot show. The methods themselves live in one component used by both, so a
  provider cannot be added to one and missed on the other.
- **Deleting an account is a flag, not a cascade** — see Moderation below.
- **Visits are counted by a beacon, not during render** — see Counting visits
  below.

### Usernames

Profiles store the name twice: `username` as typed (display only) and
`usernameNormalized` (NFKC + lowercase) which carries the unique index and is the
only lookup path. NFKC matters for more than tidiness — without it, fullwidth
`ｄｅｍｏ` would register as a distinct row from `demo` and read identically on
screen. Postgres `citext` would also work, but Prisma can only model it as
`Unsupported()`, which is unusable in typed `where` clauses.

Three to 32 characters: letters, numbers, and `.` `-` `_` as separators between
them. One anchored pattern carries the whole rule, so "no leading or trailing
separator" and "no two in a row" cannot disagree with each other, and anything
outside that set — spaces, symbols, emoji — falls out of the same anchoring. The
dash lookalikes are worth a mention: an en dash has no NFKC equivalence to a
plain hyphen, so it is rejected rather than quietly folded into one.

Claiming a name does **no** availability pre-check before inserting. Any
SELECT-then-INSERT is a TOCTOU race, so the unique index arbitrates and the
`P2002` violation is translated into a friendly "just taken" message. The
`/api/username/available` endpoint exists purely for form feedback, is debounced
client-side, rate-limited per IP, and caches only *negative* results (a name
going from taken to free is rare; the reverse is not).

Renaming from Settings records the released name in `UsernameHistory`, so old
links 301 to the current profile instead of 404ing. History is consulted only
after the primary lookup misses, keeping the common path a single indexed query.
Claiming a name that someone else previously released deletes that stale history
row in the same transaction — otherwise an old link would resolve to the wrong
profile. Casing variants of a live URL permanently redirect to the canonical
lowercase form, which also stops `/demo`, `/Demo` and `/DEMO` from each occupying
a separate ISR cache entry.

### Settings

Playlist Layout picks how the public page arranges playlists: the stacked deck
or the arc carousel. It is a `String` column rather than a Postgres enum --
adding a third layout should not need a migration that rewrites every row, which
is what altering an enum costs. Anything unrecognised falls back to `stacked`,
so a hand-edited or future value renders rather than breaks.

Both layouts share the same profile chrome, so choosing one swaps the playlist
component and nothing else.

The selected playlist's name travels the way the gesture did -- scrolling down
brings it up from below, scrolling up drops it in from above -- so the details
read as part of the same ribbon rather than as a caption being swapped. The
direction is latched at the moment the selection changes, not read live: keying
the animation on a direction that could change mid-motion ran it twice per
gesture, once for the outgoing name and again for the incoming one.

The arc's ends hang past the band the chrome leaves it, blurring as they go, and
a mask on the stage dissolves them before the header and footer. Culling them at
the band's edge instead ended the ribbon on a hard line, and fading each cover by
itself let one sit at 0.39 opacity with half of it over the header -- the mask is
what actually guarantees nothing paints there.

The control saves on click, in its own form and its own action. It is one choice
with nothing to review, so waiting on the profile section's Save changes read as
a bug -- the section sits outside that form, and looked independent of it. The
buttons are submit buttons carrying the value, so picking one is the save; there
is still no Save button of its own, which is what the design asks for.

Photo uploads go to Vercel Blob and need `BLOB_READ_WRITE_TOKEN`; without it the
route answers 501 and says so rather than failing silently. The route checks type
and size itself — `accept="image/*"` only filters the picker, it promises nothing
about what arrives. The returned URL is held in the form and written with the
rest of the profile, so choosing a photo and then leaving changes nothing.

The photo is downscaled to 512px and re-encoded as WebP in the browser before it
is sent — a 10MB phone photo lands at about 80KB. That is mostly about what gets
*served*: the same file renders a 32px header avatar on every page view. The
server-side type and size limits stay as the real guard, since a canvas is
trivially bypassed. GIFs skip the resize, which would flatten them to one frame.

Replacing a photo deletes the blob it replaced, after the profile row is saved —
an orphaned blob is untidy, but deleting first and then failing to save would
leave the profile pointing at nothing. Only blobs in our own store are eligible:
`avatarUrl` may still hold the Google account picture seeded at signup, and that
one is not ours to delete. `npm run check:avatarblob` covers that distinction.

Deleting your own account uses the same reversible flag an admin's delete sets,
so support can still undo it. It asks for the username to be typed, then clears
every session.

### Moderation and admin

`/admin` lists every profile with its playlist count and join date, plus
site-wide totals, and can suspend, restore or delete an account.

Ten profiles to a page, newest first, because nobody moderates by scrolling —
they arrive knowing which account they want. Search covers username, display
name and email in one pass, and is a GET form, so a search is a URL: shareable,
and the back button steps out of it.

Deleting from here confirms in place: the card names the person, says what goes
with them, and offers "Delete permanently" against "Keep". The username is still
submitted -- the action validates it -- but as a hidden field rather than
something to retype, so the click on the named button is the confirmation.

The copy says the deletion can't be undone *from their side*, which is the true
version: the row is soft-deleted, so an admin can still restore it from this
page, but the person themselves has no way back.

The numbers at the head of the page are visits, signups, active, suspended and
deleted, as five tiles. Only visits and signups carry a percentage: the arrow
compares the last 30 days with the 30 before, and there is no stored snapshot of
who was active or suspended a month ago, so those tiles show the count alone
rather than an invented change. A trend is shown as a
pair of counts rather than one number, because eleven signups this week is good
or bad entirely depending on last week; where the previous period was zero the
percentage is withheld rather than rendered as +100% or +∞, both of which would
be inventions. All four windows come from one query off the database's clock —
four separate queries could each land on a different second and fail to add up,
and reading `Date.now()` during render is impure either way. "Active" is counted
directly rather than as total minus suspended minus deleted, since an account can
be both and that arithmetic would subtract it twice.

Who counts as an admin comes from the `ADMIN_EMAILS` environment variable
(comma-separated, matched case-insensitively against the whole address), not a
column on `User`. Admin status therefore sits outside the data the application
writes: anyone who finds a way to write to the database still can't promote
themselves, and there is no "grant admin" code path to get wrong. The cost is a
redeploy to change the list, which is the right trade for a list that should
change roughly never.

The header gear links to `/admin` only for an admin, which matches rather than
replaces that gate -- hiding the link is a courtesy, the 404 is the control.

The gate responds **404, not 403**, so a signed-in non-admin sees exactly what a
logged-out stranger sees and the area isn't discoverable by probing.

Suspension writes `suspendedAt`, deliberately a separate column from the user's
own `isPublic` toggle — otherwise a suspended user could simply un-hide
themselves from Settings. A suspended page returns an ordinary 404 rather than
announcing that it was suspended, and the reason is shown only in the admin list.
Admins can't suspend or delete their own account (a misclick would hide the page
they need in order to undo it), and deletion requires typing the username.

Deletion is **reversible**. It used to be `user.delete` and a cascade, which made
"how many accounts were deleted" unanswerable — the rows that would have carried
the answer were the ones being removed. It now sets `deletedAt` and the row
survives, so the deletion can be counted and undone. What actually goes is the
ability to use the account: sessions are dropped so an open tab is signed out at
once, the public page 404s, and a `signIn` callback refuses a fresh sign-in.

Two consequences of that design are deliberate. The email address moves to
`deletedEmail`, because `email` carries a unique index and leaving it in place
would permanently bar that person from ever signing up again — which would make
the *reversible* delete more destructive than the hard one it replaced. And the
OAuth `Account` rows are kept, so the same Google or Spotify identity is refused
rather than allowed to register again immediately; for a moderation delete that
is the point.

Because the row survives, every path that could resurface it has to exclude it:
the public profile lookup, the rename redirect, the OG image, sign-in, and the
cleanup cron — which would otherwise hard-delete a flagged account with no
username after 30 days and walk the count backwards.

### The public profile

Playlists are a deck of covers receding up and to the right, scrolled through
rather than scrolled past. Three states, one click apart: stacked, lifted (title,
service and track count), then the provider's player over the playlist's songs.
Clicking off a lifted card returns it to the stack.

The scroll is driven from wheel and touch rather than a scrollbar, because a
scrollbar needs a tall spacer to scroll against and can still hit its end; the
deck's position wraps modulo the playlist count, so it is endless in both
directions without the list ever being duplicated. Both ends of the visible run
fade, so cards dissolve in and out instead of popping at the window edge.

Geometry comes from the design as ratios, not pixels: a 184px card stepping 40px
on both axes in a 393px frame. The card is sized as that fraction of the measured
stage and every offset follows from it, so the deck holds its proportions on any
screen instead of needing a constant per breakpoint. It is capped by height too,
since the run is as tall as it is wide and a short window would otherwise push it
off the bottom.

One gesture advances exactly one card. Any scroll or swipe past a small
threshold starts a fixed animation and further input is ignored until it lands,
so the orbit always plays out -- tracking the finger left a card frozen part-way
round whenever a scroll stopped short. A touch commits on release, from the
distance travelled, so a drag is one gesture however many move events it fires.

A card leaving the front does not fade out and reappear at the back: it shrinks,
slides straight down its own height first -- clearing the card behind it -- then
bows out to the right of the run and lands at the far end. Starting the arc
immediately cut the card across its neighbour; the slide is what makes the exit
read as leaving the stack rather than passing through it.

Paint order follows the same two phases. The card was the front card, so it
keeps front rank while it slides clear -- ducking behind immediately read as a
jump -- and drops behind the stack for the arc, which is the half that travels
round the back. Scrolled the other way the journey runs in reverse: the card
starts behind and comes forward to land as the new front card. Right because that is
the open half of the stage: the front card sits near the left edge, so a leftward
arc big enough to clear the stack ran off screen entirely. The bow's sign is
fixed, so the path looks the same whichever way the deck is scrolled. It passes *behind* every stacked card on the way: it is travelling round
the back to rejoin there, so riding over the top read as going the wrong way.

Behind means depth, not just paint order. The card is pushed back in Z as it
leaves, and its swing rises off zero quickly (`sin^0.55`) so it pulls away before
it advances along the deck. Dropping it behind while still level with the stack
was what made it look like it was passing through the next card rather than
around it -- a card 184px wide stepping 40px cannot avoid overlapping in the
plane, so the depth is what has to carry the illusion. Its position is a function of depth like every other card's -- between
depth -1 and 0 that function is an arc rather than a straight line.

The far end still fades, but only on a deck longer than the window. A deck short
enough to wrap has every card delivered to the back by the orbit, in full view,
so fading there would dim a card that is plainly arriving.

Both anchors are measured against the run that actually renders, not the eight
cards a full deck would hold -- three playlists make a run three long, and
centring on the constant left a short deck low and to the right.

The run is biased left rather than centred on its full span. The far cards are
meant to bleed off the right edge, as they do in the design; centring the whole
span instead pushed the front card off the *left* edge, where it was clipped. A
lifted card translates to the stage centre, which is what keeps it centred on a
narrow screen.

Each label sits over two scrims: a band that holds its own row dark, and a corner
wash that fades that band into the cover rather than leaving a hard edge. A text
shadow alone was not enough -- on a white cover the title measured 1.6:1 against
its ground, which is illegible. It now clears 5.5:1 on pure white and 12:1 on a
generated cover.

Covers with no artwork take a colour hashed from the playlist's id with FNV-1a.
Not the title -- two playlists called "Liked Songs" would come out identical --
and not a simple `hash * 31 % 360`, which barely moved between neighbouring cuids
and gave playlists created seconds apart the same colour.

Labels are pinned to each card's top-right corner: that corner is the strip a
card still shows past the one in front of it, and anchoring right means the title
does not slide as a card advances to the front.

The open playlist is a modal over the whole page, so it stacks above the profile
chrome rather than under it. At its old z-index the header, bio and footer -- all
at 2000 and deliberately `pointer-events: none` so the deck stays draggable --
printed straight through it. Hit-testing could not see that: those strips pass
clicks through while still painting, so only a screenshot showed it.

Songs are stored, not fetched when the page is viewed. A visitor holds no Spotify
or YouTube token, so the owner's sync is the only moment the list can be read.
They are fetched only for playlists that are actually visible: new imports start
hidden, and YouTube's daily quota is shared by every user of the app, so paying
for a list nobody can reach is quota spent on nothing. The list is replaced
wholesale on each sync -- position is the identity, so a reordered playlist would
otherwise keep rows from its previous shape.

Spotify picks its player's layout from the height it is given: 80 draws the
compact transport bar, 152 and 352 both draw a track list of their own. Since the
songs are listed beneath it from our own data, anything taller renders that list
twice. YouTube carries no duration on the endpoint that lists a playlist's items
-- a second request per 50 videos -- so those rows simply have no duration column
rather than a row of dashes.

Two things about the embedded player are load-bearing for the back button. The
fallback iframe is attached blank and then navigated with `location.replace`,
because assigning `.src` on a fresh iframe pushes onto the joint session history
-- Back would step through the embeds a visitor opened instead of leaving the
page. And the provider's script is handed a plain div created outside React,
since it replaces whatever node it is given: leaving React as that node's owner
made React later remove children it no longer had, throwing NotFoundError and
taking the whole page down through the error boundary.

### Handling traffic and abuse

The public profile page is the highest-traffic route, so it's ISR-cached and
served from the edge — repeat views never reach the database. This requires
`generateStaticParams` on the dynamic segment: **without it Next serves
`Cache-Control: no-store` and every view hits the DB.** Verify with
`x-nextjs-cache: HIT` on a repeat request. The OG image is cached the same way,
on a longer window, since crawlers hit it in bursts and each render is expensive.

Mutating endpoints are rate-limited **per account and per IP together**
(`lib/rate-limit.ts`) — an account limit alone is bypassed by making more
accounts, so username claiming is IP-limited as the choke point on account
farming. Limits use Upstash Redis when configured and fall back to an in-process
counter otherwise; **the fallback is per-instance, so production must set
`UPSTASH_REDIS_REST_URL`/`TOKEN`** for limits to actually hold across serverless
instances. `/api/health` reports which backend is live.

Every JSON endpoint caps its request body (`readJsonBody`), counting real bytes
rather than trusting `Content-Length`. Provider 429s and YouTube quota errors are
surfaced as `503` with `Retry-After` rather than retried, because those quotas
are per-application: hammering them degrades sync for every user.

A daily Vercel Cron (`vercel.json` → `/api/cron/cleanup`, guarded by
`CRON_SECRET`) clears expired sessions and verification tokens, which Auth.js
writes but never reaps, plus signups older than 30 days that never claimed a
username. It deliberately does **not** delete established accounts for
inactivity — that destroys real data and breaks live shared links, so it should
be a product decision with warning emails, not a silent cron job. Pass
`?dryRun=1` to see what it would remove.

### Counting visits

The counter is a first-party one in Postgres — `DailyVisit`, one row per day
keyed by the date, so recording a visit is a single atomic upsert with no lookup
and no way to race two rows into existence for the same day.

It is written by a beacon from the browser rather than during render, and that is
forced by the caching. The highest-traffic route is the public profile, which is
ISR-cached precisely so repeat views never reach the database; counting at render
time would either miss every cached view or force the page dynamic and throw away
the cache that makes it cheap. The trade is that only visitors running JavaScript
are counted — roughly the same population Vercel Analytics reports, and it
excludes most crawlers, which here is a feature.

The beacon fires once per browser session, so the number is *visits* rather than
page views. Vercel's own analytics stays for its bot filtering and dashboard;
this exists so the admin page doesn't depend on a third party being up or on a
plan tier.

Storage is not a concern worth optimising: a row is about 56 bytes including its
index entry, so a year of daily rows is ~20 kB. Rolling months up into single
records would save that much per year and cost the day-level resolution
permanently.

### On "YouTube" vs "YouTube Music"

There is no official YouTube Music API. SpindlShare reads your playlists through the
YouTube Data API v3, which is where YouTube Music playlists live underneath — so
the UI says "YouTube playlists" rather than claiming YouTube Music support.

Note that `youtube.readonly` is a *sensitive* scope, which has two consequences.

Until Google verifies the app, the consent screen shows an "unverified app"
warning and the app is capped at 100 users. Sensitive is not *restricted*, so
verification needs no third-party security assessment -- it needs a public
homepage, a privacy policy disclosing what is done with Google user data, domain
ownership proved in Search Console, a scope justification and a demo video. The
policy and terms live at `/privacy` and `/terms`, are linked from the foot of the
landing page because the review expects to find them there and not only on the
consent screen, and both names are in the reserved-username list so no profile
can shadow them.

**Verification cannot pass on a `*.vercel.app` URL.** Google requires the home
page's domain to be verified as a *Domain property* in Search Console — its own
wording is "you must verify the Domain Property (DNS-level), rather than a 'URL
prefix' or 'Site,' property" — which means a DNS TXT record on the root domain.
`vercel.app` is Vercel's zone, so there is no record to add and no ownership to
prove; an HTML-file URL-prefix verification is accepted by Search Console and
then rejected by the OAuth review with "the website of your home page URL is not
registered to you". A custom domain is the only way past it. Until then the
workable state is Production-but-unverified: the warning and the 100-user cap
stay, the 7-day token expiry does not.

The sharper consequence is that while the OAuth consent screen is in **Testing**,
Google issues refresh tokens that expire after **7 days** -- with an exception
only for `email`/`profile`/`openid`. Sign-in is therefore fine, but every YouTube
connection dies weekly and `lib/sync.ts` reports it as a revoked grant. Publishing
to Production fixes that on its own, before verification; the warning and the user
cap simply remain until the review passes.

## Deploying

Push to `main`, import the repo on Vercel, then set every variable from
`.env.example` in the project settings. Point `DATABASE_URL` at Neon's **pooled**
connection string and `DIRECT_URL` at the unpooled one. Set `ADMIN_EMAILS` if you
want the moderation area, and `CRON_SECRET` for the daily cleanup job.

Then register the production callback URLs. There are two per provider and only
the connect ones are environment variables, which is exactly why the login ones
get missed — a missing entry surfaces as the provider's own
`redirect_uri: not matching configuration` after the user has already typed
their password:

| Console | Redirect URI |
| --- | --- |
| Google | `https://your-app/api/auth/callback/google` (login) |
| Google | `https://your-app/api/connect/youtube/callback` (connect) |
| Spotify | `https://your-app/api/connect/spotify/callback` (connect) |

The live values are worth reading rather than assuming — `/api/auth/providers`
is public and reports exactly what Auth.js will send:

```bash
curl -s https://your-app/api/auth/providers
```

### Checking a deploy

`/api/health` answers `{ ok, db }` publicly — deliberately minimal, because error
text from a failed connection can leak the database host and user. Send the cron
secret to get the detail that actually debugs a broken deploy:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/health
```

That returns which required variables are missing (names and booleans only, never
values), whether `DATABASE_URL` is the pooled endpoint, database latency, the
region, and which rate-limit backend is live.

## Not built yet

- **The rest of the signed-in UI.** Every page under `/dashboard` was removed to
  be redesigned from scratch, and only the connect screen has been rebuilt so far
  — there is no playlists, connections or settings screen behind it yet. The
  server actions were kept, so the write path (add and remove a link, rename,
  edit profile) is waiting on screens rather than needing to be rebuilt with
  them. `/dashboard` shows the connect screen unconditionally for now, including
  to someone who has already connected a service.
- **Somewhere for the paste-a-link control to go.** The connect screen draws it,
  because the design does, but it leads nowhere until that flow is designed.
- **Themes.** `Profile.theme` exists in the schema with no UI behind it.
- **A dashboard view of the visit counter.** `DailyVisit` holds a daily series
  and `/admin` only shows the total.
