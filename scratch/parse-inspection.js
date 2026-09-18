const fs = require("fs");
const raw = JSON.parse(fs.readFileSync("scratch/studio_inspection_raw.json", "utf8"));

// Check intercepted URLs
console.log("Intercepted URLs:");
raw.interceptedUrls.forEach(u => console.log(u.status, u.url));

// Check Home text matches
console.log("\nHome Text relevant lines:");
raw.homeTextSnippet.split("\n").filter(l => l.trim()).slice(0, 35).forEach((l, i) => console.log(i, l));

// Check where 469 could be
const fullText = raw.homeTextSnippet + " " + raw.m10nTextSnippet;
console.log("469 in text:", fullText.includes("469"));
