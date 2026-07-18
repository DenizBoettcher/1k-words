-- Additive migration: grammar (cloze) exercises per list.
-- wordItemIds: JSON array of resolved WordItem ids the sentence references  
-- the first one is the gap word. Resolved server-side from base forms on upload.

CREATE TABLE "GrammarItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "listId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "wordItemIds" TEXT NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GrammarItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "WordList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "GrammarItem_listId_idx" ON "GrammarItem"("listId");
