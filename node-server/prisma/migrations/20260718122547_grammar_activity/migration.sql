-- CreateTable
CREATE TABLE "GrammarItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "listId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "wordItemIds" TEXT NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GrammarItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "WordList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "userId" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("userId", "day"),
    CONSTRAINT "ReviewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
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

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "activeListId" INTEGER,
    "darkMode" BOOLEAN NOT NULL DEFAULT false,
    "wordsPerSession" INTEGER NOT NULL DEFAULT 15,
    "checkCapitalization" BOOLEAN NOT NULL DEFAULT false,
    "foldSpecialLetters" BOOLEAN NOT NULL DEFAULT false,
    "speakWords" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("activeListId", "checkCapitalization", "darkMode", "foldSpecialLetters", "id", "userId", "wordsPerSession") SELECT "activeListId", "checkCapitalization", "darkMode", "foldSpecialLetters", "id", "userId", "wordsPerSession" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GrammarItem_listId_idx" ON "GrammarItem"("listId");

-- CreateIndex
CREATE INDEX "DailySession_userId_idx" ON "DailySession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailySession_userId_listId_sessionDate_key" ON "DailySession"("userId", "listId", "sessionDate");
