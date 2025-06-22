# 1 K Words — Single‑User Vocabulary Trainer

**does not work right now implementing cloudflare pages**

A lightweight, flash‑card app to learn the 1 000 most common words, languages can now be importet.  

| Feature                  | Summary                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| **Two Modes**            | **Vocabulary Mode** flip card **Learn Mode** type answer + feedback                            |
| **Weighted Random**      | Words you miss (`learn = false`) appear 5 × more often than ones you get right.                |
| **Per‑session Progress** | Compact progress bar shows “words covered” and the least‑seen repetition count (e.g. *2 / 3*). |
| **Importing Languages**  | Import every language you like based on the provided json in test_data                         |
| **User Specific**        | Support Multiple Users, user can only see there Imported words                                 |
| **App**                  | .Net MAUI app that displayes the Website on Windows, Android (and maybe IOS, MACOS not tested) |

## Quick Start

### client: 
```bash
npm install
npm run start
```

### Server:
```bash
npm install
npx prisma migrate dev --name init
npx ts-node index.ts 
```

### Maui:  
Enable Windows developer mode or install jdk 17 and add a Android phone  
in the Developer-Powershell  
```bash
dotnet workload repair
dotnet workload update
```

### http 
use the .env.http.example environment
change .env for client and AppConfig for app to http://localhost:4000

### https setup (optional)
use the .env.https.example environment and create/put the files at KEY_PATH and CERT_PATH  
the same for client copy the files and change .env SSL_CRT_FILE and SSL_KEY_FILE  
change .env for client and AppConfig for app to https://localhost:4000

``` bash
choco install mkcert      # Windows
brew install mkcert nss   # macOS
sudo pacman -S mkcert     # Arch, etc.

mkcert -install
mkcert localhost 127.0.0.1 ::1
```

## Roadmap / Ideas

* **WordSequenzes** WordSequenzes should be handled by the server to send a range from 5-50 words instead of all words
* **WordSets** wordsets from people should be download/choosable by other users if flagged public
* **Better DB** Support changing between languages and also track it correctly
* **Better design** robust to screen changes 
* **User settings** better design
* **User settings** implement Darkmode
* **Better Apps** Maui is just added in, testing needs to be done yet 
* **App Notification** Notification by apps
* **XP system** increase the will to open the webiste/app up again
* **Deploy** deploy the webiste

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
