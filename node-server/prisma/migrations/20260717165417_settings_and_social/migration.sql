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
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("activeListId", "darkMode", "id", "userId", "wordsPerSession") SELECT "activeListId", "darkMode", "id", "userId", "wordsPerSession" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
