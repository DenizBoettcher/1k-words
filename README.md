# 1 K Words — Single‑User Vocabulary Trainer

A lightweight, offline‑friendly flash‑card app to learn the 1 000 most common Turkish ↔ German words.  
*Words are stored in* `vocabulary.json`. The API rewrites the file on every update.


| Feature                  | Summary                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| **Two Modes**            | *Vocabulary Mode* (flip card) · *Learn Mode* (type answer + instant feedback)                  |
| **Weighted Random**      | Words you miss (`learn = false`) appear 5 × more often than ones you get right.                |
| **Per‑session Progress** | Compact progress bar shows “words covered” and the least‑seen repetition count (e.g. *2 / 3*). |
| **Storage Options**      | flat `vocabulary.json` This can easily be adapted to any need and language.                    |

---

## Quick Start (flat‑file mode)
client 
```bash
npm install
npm run start
```

Server
```bash
npm install
npx ts-node index.ts 
```

Clear json
```bash
npx ts-node resetHistory.ts
```

## Roadmap / Ideas

* **Login/User** Login and User based Changes.
* **User settings** Darkmode
* **DB** to Support more languages on the fly
* **App** Adding an app that fetches the website
* **Better design** robust to screen changes 

---

## License

```text
MIT License

Copyright (c) 2025  1 K Words

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
