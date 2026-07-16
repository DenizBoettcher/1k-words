-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "xp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WordList" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sourceLang" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "originListId" INTEGER,
    "originVersion" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WordList_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "listId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "commitMessage" TEXT NOT NULL DEFAULT '',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListVersion_listId_fkey" FOREIGN KEY ("listId") REFERENCES "WordList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WordItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "listId" INTEGER,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    CONSTRAINT "WordItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "WordList" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VersionItem" (
    "versionId" INTEGER NOT NULL,
    "wordItemId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("versionId", "wordItemId"),
    CONSTRAINT "VersionItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ListVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VersionItem_wordItemId_fkey" FOREIGN KEY ("wordItemId") REFERENCES "WordItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListFollow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "listId" INTEGER NOT NULL,
    "versionId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListFollow_listId_fkey" FOREIGN KEY ("listId") REFERENCES "WordList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListFollow_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ListVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListLike" (
    "userId" INTEGER NOT NULL,
    "listId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "listId"),
    CONSTRAINT "ListLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListLike_listId_fkey" FOREIGN KEY ("listId") REFERENCES "WordList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListMaintainer" (
    "listId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("listId", "userId"),
    CONSTRAINT "ListMaintainer_listId_fkey" FOREIGN KEY ("listId") REFERENCES "WordList" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ListMaintainer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Progress" (
    "userId" INTEGER NOT NULL,
    "wordItemId" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "masteredAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "wordItemId"),
    CONSTRAINT "Progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Progress_wordItemId_fkey" FOREIGN KEY ("wordItemId") REFERENCES "WordItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "activeListId" INTEGER,
    "darkMode" BOOLEAN NOT NULL DEFAULT false,
    "wordsPerSession" INTEGER NOT NULL DEFAULT 15,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "WordList_ownerId_idx" ON "WordList"("ownerId");

-- CreateIndex
CREATE INDEX "WordList_isPublic_idx" ON "WordList"("isPublic");

-- CreateIndex
CREATE INDEX "ListVersion_listId_idx" ON "ListVersion"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "ListVersion_listId_version_key" ON "ListVersion"("listId", "version");

-- CreateIndex
CREATE INDEX "WordItem_listId_idx" ON "WordItem"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "WordItem_listId_source_target_key" ON "WordItem"("listId", "source", "target");

-- CreateIndex
CREATE INDEX "VersionItem_versionId_idx" ON "VersionItem"("versionId");

-- CreateIndex
CREATE INDEX "VersionItem_wordItemId_idx" ON "VersionItem"("wordItemId");

-- CreateIndex
CREATE INDEX "ListFollow_userId_idx" ON "ListFollow"("userId");

-- CreateIndex
CREATE INDEX "ListFollow_listId_idx" ON "ListFollow"("listId");

-- CreateIndex
CREATE UNIQUE INDEX "ListFollow_userId_listId_key" ON "ListFollow"("userId", "listId");

-- CreateIndex
CREATE INDEX "ListLike_listId_idx" ON "ListLike"("listId");

-- CreateIndex
CREATE INDEX "ListMaintainer_userId_idx" ON "ListMaintainer"("userId");

-- CreateIndex
CREATE INDEX "Progress_userId_idx" ON "Progress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
