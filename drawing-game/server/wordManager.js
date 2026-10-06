const WORDS = {
  Animals: ['Elephant', 'Lion', 'Cat', 'Dog', 'Giraffe', 'Penguin', 'Octopus', 'Butterfly'],
  Objects: ['Laptop', 'Car', 'Bicycle', 'Phone', 'Umbrella', 'Guitar', 'Clock', 'Camera'],
  Food: ['Pizza', 'Burger', 'Apple', 'Cake', 'Sushi', 'Popcorn', 'Watermelon', 'Pancakes'],
  Nature: ['Rainbow', 'Volcano', 'Cactus', 'Ocean', 'Lightning', 'Mountain', 'Snowflake', 'Desert']
};

function getWordChoices(count = 3, customWords = []) {
  const pool = [...Object.values(WORDS).flat(), ...customWords].filter(Boolean);
  const choices = [];
  while (choices.length < Math.min(count, pool.length)) {
    const word = pool[Math.floor(Math.random() * pool.length)];
    if (!choices.includes(word)) choices.push(word);
  }
  return choices;
}

function normalizeWord(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

module.exports = { getWordChoices, normalizeWord };
