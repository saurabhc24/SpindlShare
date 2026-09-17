-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Track_playlistId_position_idx" ON "Track"("playlistId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Track_playlistId_position_key" ON "Track"("playlistId", "position");

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
