export const mockEvents = [
  { type: "transcript", speaker: "Doctor", text: "How have you been feeling since we last met?" },
  { type: "transcript", speaker: "Patient", text: "Honestly, I've just been feeling a bit overwhelmed." },
  { type: "biomarker", data: { arousal: 0.6, valence: 0.3, engagement: 0.8 } },
  { type: "concordance_score", value: 65 },
  { type: "concordance_flag", flag_id: "1", title: "Sentiment Gap", message: "Patient expressed feeling 'fine' but voice biomarkers indicate distress." }
];