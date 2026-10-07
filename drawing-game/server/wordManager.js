const WORDS = {
  Animals: [
    "Elephant",
    "Lion",
    "Cat",
    "Dog",
    "Giraffe",
    "Penguin",
    "Octopus",
    "Butterfly",
    "Rabbit",
    "Horse",
  ],
  Objects: [
    "Laptop",
    "Car",
    "Bicycle",
    "Phone",
    "Umbrella",
    "Guitar",
    "Clock",
    "Camera",
    "Book",
    "Chair",
  ],
  Food: [
    "Pizza",
    "Burger",
    "Apple",
    "Cake",
    "Sushi",
    "Popcorn",
    "Watermelon",
    "Pancakes",
    "Rice",
    "Bread",
  ],
  Nature: [
    "Rainbow",
    "Volcano",
    "Cactus",
    "Ocean",
    "Lightning",
    "Mountain",
    "Snowflake",
    "Desert",
    "Sun",
    "Moon",
  ],
};

const HINDI_WORDS = {
  Animals: [
    "हाथी",
    "शेर",
    "बिल्ली",
    "कुत्ता",
    "जिराफ",
    "तितली",
    "मछली",
    "घोड़ा",
    "खरगोश",
    "बंदर",
  ],
  Objects: [
    "कंप्यूटर",
    "कार",
    "साइकिल",
    "फोन",
    "छाता",
    "गिटार",
    "घड़ी",
    "कैमरा",
    "किताब",
    "कुर्सी",
  ],
  Food: [
    "पिज्जा",
    "सेब",
    "केक",
    "चावल",
    "तरबूज",
    "रोटी",
    "आम",
    "केला",
    "दूध",
    "समोसा",
  ],
  Nature: [
    "इंद्रधनुष",
    "पहाड़",
    "समुद्र",
    "बिजली",
    "बर्फ",
    "रेगिस्तान",
    "सूरज",
    "चाँद",
    "पेड़",
    "फूल",
  ],
};

function getWordChoices(
  count = 3,
  customWords = [],
  language = "en",
  category = "All",
) {
  const words = language === "hi" ? HINDI_WORDS : WORDS;
  const pool = [
    ...new Set(
      [
        ...(words[category] || Object.values(words).flat()),
        ...customWords,
      ].filter(Boolean),
    ),
  ];
  const choices = [];
  while (choices.length < Math.min(count, pool.length)) {
    const word = pool[Math.floor(Math.random() * pool.length)];
    if (!choices.includes(word)) choices.push(word);
  }
  return choices;
}

function normalizeWord(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

module.exports = { getWordChoices, normalizeWord };
