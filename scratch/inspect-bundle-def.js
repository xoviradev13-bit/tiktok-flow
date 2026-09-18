const https = require("https");

https.get("https://sf16-website-login.neutral.tiktokcdn-eu.com/obj/tiktok_web_login_static_eu/tiktok/web/tiktok_studio_monetization_web/static/js/async/204.54492f02.js", (res) => {
  let data = "";
  res.on("data", c => data += c);
  res.on("end", () => {
    let pos = data.indexOf("genBaseURL");
    console.log("=== genBaseURL & request ===");
    console.log(data.slice(pos - 100, pos + 400));
  });
});
