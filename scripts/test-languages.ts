// Test script to verify multi-language parsing across top 10 TikTok countries:
// 1. United States (English)
// 2. Indonesia (Indonesian - Bahasa Indonesia)
// 3. Brazil (Portuguese - pt-BR)
// 4. Mexico (Spanish - es)
// 5. Pakistan (Urdu / English)
// 6. Philippines (Tagalog / Filipino)
// 7. Vietnam (Vietnamese)
// 8. Russia (Russian)
// 9. Bangladesh (Bengali)
// 10. Egypt (Arabic)

export function parseUniversalNum(str: any): number {
  if (!str) return 0;
  let s = String(str).trim();

  // Convert Eastern Arabic, Urdu, Bengali digits to standard 0-9
  const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  const urduDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  const bengaliDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  for (let i = 0; i < 10; i++) {
    s = s.split(arabicDigits[i]).join(String(i))
         .split(urduDigits[i]).join(String(i))
         .split(bengaliDigits[i]).join(String(i));
  }
  // Normalize Arabic decimal (U+066B ٫) and thousands (U+066C ٬) separators
  s = s.replace(/\u066B/g, ".").replace(/\u066C/g, ",");
  s = s.toLowerCase();

  let multiplier = 1;
  // Non-ASCII aware patterns
  if (/(?:^|[\s\d.,])(b|billion|млрд|tỷ|ty|مليار)(?:[\s.,]|$)/iu.test(s)) {
    multiplier = 1000000000;
  } else if (/(?:^|[\s\d.,])(m|million|млн|jt|tr|مليون|মি|মিলিয়ন|নিঝুত)(?:[\s.,]|$)/iu.test(s)) {
    multiplier = 1000000;
  } else if (/(?:^|[\s\d.,])(k|thousand|тыс|тыс\.|rb|mil|ألف|হাজার)(?:[\s.,]|$)/iu.test(s)) {
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
  { lang: "1. US (English)", input: "1.5M", expected: 1500000 },
  { lang: "2. Indonesia (Bahasa)", input: "350 rb", expected: 350000 },
  { lang: "2. Indonesia (Bahasa)", input: "2,4 jt", expected: 2400000 },
  { lang: "3. Brazil (Portuguese)", input: "1,8 mil", expected: 1800 },
  { lang: "3. Brazil (Portuguese)", input: "4,5 M", expected: 4500000 },
  { lang: "4. Mexico (Spanish)", input: "850 mil", expected: 850000 },
  { lang: "5. Pakistan (Urdu)", input: "۲۵۰k", expected: 250000 },
  { lang: "6. Philippines (Tagalog)", input: "45.2K", expected: 45200 },
  { lang: "7. Vietnam (Vietnamese)", input: "12,5k", expected: 12500 },
  { lang: "7. Vietnam (Vietnamese)", input: "3,8 tr", expected: 3800000 },
  { lang: "8. Russia (Russian)", input: "2,4 млн", expected: 2400000 },
  { lang: "8. Russia (Russian)", input: "450 тыс.", expected: 450000 },
  { lang: "9. Bangladesh (Bengali)", input: "১.৫ মিলিয়ন", expected: 1500000 },
  { lang: "10. Egypt (Arabic)", input: "٥٫٢ مليون", expected: 5200000 },
  { lang: "10. Egypt (Arabic)", input: "٨٥٠ ألف", expected: 850000 },
];

let allPassed = true;
for (const t of tests) {
  const got = parseUniversalNum(t.input);
  const ok = got === t.expected;
  if (!ok) allPassed = false;
  console.log(`${ok ? "✅" : "❌"} [${t.lang}] "${t.input}" -> got: ${got}, expected: ${t.expected}`);
}
console.log(`\nResult: ${allPassed ? "ALL 10 COUNTRIES PASSED" : "SOME FAILED"}`);
