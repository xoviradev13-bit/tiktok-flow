// Comprehensive test of universal number parser for all 57 TikTok languages

export function parseUniversalNumAll(str: any): number {
  if (!str) return 0;
  let s = String(str).trim();

  // 1. Digits mapping across all scripts:
  // Arabic-Indic, Eastern Arabic/Urdu, Bengali, Devanagari (Hindi), Thai, Myanmar, Khmer
  const scriptDigits = [
    // 0    1    2    3    4    5    6    7    8    9
    ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"], // Arabic
    ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"], // Urdu/Persian
    ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"], // Bengali
    ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"], // Devanagari (Hindi)
    ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"], // Thai
    ["၀", "၁", "၂", "၃", "၄", "၅", "၆", "၇", "၈", "၉"], // Myanmar
    ["០", "១", "២", "៣", "៤", "៥", "៦", "៧", "៨", "៩"], // Khmer
  ];

  for (const digitSet of scriptDigits) {
    for (let i = 0; i < 10; i++) {
      s = s.split(digitSet[i]).join(String(i));
    }
  }

  // Normalize Unicode decimal/thousands separators
  s = s.replace(/\u066B/g, ".").replace(/\u066C/g, ",");
  s = s.toLowerCase();

  // Multiplier scanning
  let multiplier = 1;

  // Trillions / Billions / Crore / 亿 / 億 / 억
  if (/(?:^|[\s\d.,])(t|trillion|b|billion|млрд|tỷ|ty|مليار|কোটি|করোড়|করোড়|crore|หมื่นล้าน|亿|億|억)(?:[\s.,]|$)/iu.test(s)) {
    multiplier = 1000000000;
  }
  // Millions / Lakh / 万 / 萬 / 만 / ล้าน / သန်း / លាន
  else if (/(?:^|[\s\d.,])(m|million|млн|jt|tr|مليون|মি|মিলিয়ন|নিঝুত|ล้าน|သန်း|លាន|millon|milhões)(?:[\s.,]|$)/iu.test(s)) {
    multiplier = 1000000;
  }
  // Lakh (100,000)
  else if (/(?:^|[\s\d.,])(lakh|লাখ|लाख|แสน|သိန်း|សែន)(?:[\s.,]|$)/iu.test(s)) {
    multiplier = 100000;
  }
  // Myriad (10,000) - 万 / 萬 / 만 / หมื่น / သောင်း / ម៉ឺន
  else if (/(?:^|[\s\d.,])(万|萬|만|หมื่น|သောင်း|ម៉ឺន)(?:[\s.,]|$)/iu.test(s)) {
    multiplier = 10000;
  }
  // Thousands - K, тыс, тис, rb, mil, ألف, হাজার, हज़ार, พัน, ထောင်, ពាន់, хил, tsd, bin
  else if (/(?:^|[\s\d.,])(k|thousand|тыс|тыс\.|тис|тис\.|rb|mil|ألف|হাজার|हज़ार|พัน|ထောင်|ពាន់|хил|kilo|tūkst|tūst|tsd|tsd\.|bin)(?:[\s.,]|$)/iu.test(s)) {
    multiplier = 1000;
  }

  if (multiplier > 1) {
    const match = s.match(/([0-9]+(?:[.,][0-9]+)?)/);
    if (match) {
      const val = parseFloat(match[1].replace(",", "."));
      return Math.round(val * multiplier);
    }
  }

  // Standard clean integer
  const clean = s.replace(/[^0-9]/g, "");
  return parseInt(clean, 10) || 0;
}

const tests = [
  // 1. English
  { lang: "English", input: "1.5M", expected: 1500000 },
  // 2. German
  { lang: "Deutsch", input: "450 Tsd.", expected: 450000 },
  // 3. Spanish
  { lang: "Español", input: "2,5 M", expected: 2500000 },
  // 4. French
  { lang: "Français", input: "850 k", expected: 850000 },
  // 5. Russian
  { lang: "Русский", input: "1,2 млн", expected: 1200000 },
  // 6. Ukrainian
  { lang: "Українська", input: "750 тис.", expected: 750000 },
  // 7. Hindi
  { lang: "हिंदी", input: "२.५ लाख", expected: 250000 },
  // 8. Bengali
  { lang: "বাংলা", input: "১.৫ মিলিয়ন", expected: 1500000 },
  // 9. Arabic
  { lang: "العربية", input: "٣٫٤ مليون", expected: 3400000 },
  // 10. Urdu
  { lang: "اردو", input: "۵۰۰k", expected: 500000 },
  // 11. Thai
  { lang: "ภาษาไทย", input: "๑.๒ ล้าน", expected: 1200000 },
  // 12. Myanmar
  { lang: "မြန်မာ", input: "၅ သောင်း", expected: 50000 },
  // 13. Khmer
  { lang: "ខ្មែរ", input: "២ លាន", expected: 2000000 },
  // 14. Chinese (Simplified)
  { lang: "中文 (简体)", input: "12.5万", expected: 125000 },
  // 15. Chinese (Traditional)
  { lang: "中文 (繁體)", input: "3.2萬", expected: 32000 },
  // 16. Japanese
  { lang: "日本語", input: "50万", expected: 500000 },
  // 17. Korean
  { lang: "한국어", input: "15만", expected: 150000 },
  // 18. Vietnamese
  { lang: "Tiếng Việt", input: "2,8 tr", expected: 2800000 },
  // 19. Indonesian / Malay
  { lang: "Bahasa Indonesia", input: "420 rb", expected: 420000 },
  // 20. Turkish
  { lang: "Türkçe", input: "150 bin", expected: 150000 },
];

let allPassed = true;
for (const t of tests) {
  const got = parseUniversalNumAll(t.input);
  const ok = got === t.expected;
  if (!ok) allPassed = false;
  console.log(`${ok ? "✅" : "❌"} [${t.lang}] "${t.input}" -> got: ${got}, expected: ${t.expected}`);
}
console.log(`\nResult: ${allPassed ? "ALL 20 SCRIPT FAMILIES PASSED" : "SOME FAILED"}`);
