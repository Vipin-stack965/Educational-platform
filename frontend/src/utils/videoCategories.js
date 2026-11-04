const VIDEO_CATEGORY_RULES = [
  { label: "Music", pattern: /\b(music|song|songs|audio|lyrics|singer|album)\b/i },
  { label: "Gaming", pattern: /\b(game|games|gaming|gameplay|walkthrough|minecraft|roblox|fortnite)\b/i },
  { label: "Movies", pattern: /\b(movie|movies|film|films|cinema|trailer)\b/i },
  { label: "Education", pattern: /\b(education|educational|tutorial|learning|lesson|study|course)\b/i },
  { label: "Sports", pattern: /\b(sport|sports|football|cricket|basketball|tennis)\b/i },
  { label: "News", pattern: /\b(news|current affairs|politics|headline)\b/i },
  { label: "Comedy", pattern: /\b(comedy|funny|humor|joke|standup)\b/i },
  { label: "Cooking", pattern: /\b(cooking|recipe|recipes|food|baking)\b/i },
  { label: "Travel", pattern: /\b(travel|tour|vacation|vlog)\b/i },
  { label: "Science & Tech", pattern: /\b(technology|tech|science|ai|programming|coding|software)\b/i },
];

export const getVideoCategories = (video) => {
  const tags = (video?.tags || [])
    .map((tag) => tag?.trim().replace(/^#+/, "").trim())
    .filter(Boolean);
  const searchableText = [video?.title, video?.description, ...tags].filter(Boolean).join(" ");
  const matchedCategories = VIDEO_CATEGORY_RULES
    .filter(({ pattern }) => pattern.test(searchableText))
    .map(({ label }) => label);
  return matchedCategories.length ? matchedCategories : tags;
};
