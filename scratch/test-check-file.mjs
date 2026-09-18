import fs from 'fs';

// Let's check ousnowfan_final_rewards.json to see what URL was used to fetch the 68 videos!
const data = JSON.parse(fs.readFileSync('scratch/ousnowfan_final_rewards.json', 'utf8'));
console.log('Account:', data.account);
console.log('TotalCount in file:', data.totalCount);
if (data.videos) {
  console.log('Number of videos in data.videos:', data.videos.length);
  // Check unique IDs
  const ids = new Set(data.videos.map(v => v.video_id_str || v.video_id));
  console.log('Unique video IDs in data.videos:', ids.size);
}
