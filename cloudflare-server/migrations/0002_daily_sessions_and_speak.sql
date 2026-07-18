-- Additive migration: daily study sessions + text-to-speech setting.

ALTER TABLE "UserSettings" ADD COLUMN "speakWords" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "DailySession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "listId" INTEGER NOT NULL,
    "sessionDate" TEXT NOT NULL,
    "wordItemIds" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailySession_listId_fkey" FOREIGN KEY ("listId") REFERENCES "WordList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailySession_userId_listId_sessionDate_key" ON "DailySession"("userId", "listId", "sessionDate");
CREATE INDEX "DailySession_userId_idx" ON "DailySession"("userId");
