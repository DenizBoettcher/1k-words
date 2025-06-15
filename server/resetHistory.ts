import fs from 'fs';

const filePath = 'Data/vocabulary.json';

// 1. Load the JSON file
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

// 2. Reset history for every word *in place*
data.turkish.words = data.turkish.words.map((word: any) => ({
  ...word,
  history: {
    counter: 0,
    learn: []
  }
}));

// 3. Save it back—note we’re writing the whole object, not just the array
fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

console.log('✅ History reset for all entries (structure preserved).');
