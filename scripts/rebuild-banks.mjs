// Dedupes every question bank (several were padded to 1000+ rows but held only 5–23 DISTINCT
// questions — the true cause of "questions repeat within a section"), then expands the four thin banks
// (emoji, oddoneout, truefalse, riddles) with real, distinct, tier-tagged content. Idempotent: dedup
// keys on the content, and expansions are merged by their natural key. Run from arcadia-backend:
//   node scripts/rebuild-banks.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));
const write = (f, v) => writeFileSync(join(DATA, f), JSON.stringify(v, null, 2) + "\n");
const noTier = ({ tier, ...rest }) => rest; // dedup key ignores tier

function dedupe(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const e of arr) {
    const k = keyFn(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

// ---------------- EMOJI (emoji, correct, decoys[3], tier) ----------------
const EMOJI = [
  ["🤖❤️", "WALL-E", ["Big Hero 6", "Transformers", "Chappie"], "medium"],
  ["🐭🍝", "Ratatouille", ["Garfield", "Flushed Away", "The Aristocats"], "medium"],
  ["🦖🏝️", "Jurassic Park", ["King Kong", "Godzilla", "The Land Before Time"], "easy"],
  ["🃏🤡", "Joker", ["It", "The Dark Knight", "Clown"], "medium"],
  ["👻🚫", "Ghostbusters", ["Casper", "Beetlejuice", "Poltergeist"], "easy"],
  ["🦇🦸", "Batman", ["Spider-Man", "Daredevil", "Birdman"], "easy"],
  ["🕶️🕴️", "The Matrix", ["Men in Black", "Inception", "John Wick"], "medium"],
  ["💍🌋", "The Lord of the Rings", ["The Hobbit", "Willow", "Eragon"], "medium"],
  ["🌪️🏠👠", "The Wizard of Oz", ["Twister", "Alice in Wonderland", "Mary Poppins"], "hard"],
  ["🤠🚀", "Toy Story", ["Buzz Lightyear", "Cowboys & Aliens", "WALL-E"], "easy"],
  ["🐼🥋", "Kung Fu Panda", ["The Karate Kid", "Mulan", "Po"], "easy"],
  ["🧙‍♂️⚡", "Harry Potter", ["The Lord of the Rings", "Merlin", "Fantastic Beasts"], "easy"],
  ["🦈", "Jaws", ["Sharknado", "Deep Blue Sea", "The Meg"], "medium"],
  ["🤵🔫", "James Bond", ["Kingsman", "Mission: Impossible", "The Equalizer"], "medium"],
  ["👽📞", "E.T.", ["Signs", "Arrival", "Close Encounters"], "medium"],
  ["🍫🏭", "Charlie and the Chocolate Factory", ["Wonka", "Matilda", "Hansel and Gretel"], "medium"],
  ["🐷🕸️", "Charlotte's Web", ["Babe", "Animal Farm", "Bee Movie"], "hard"],
  ["🧛", "Dracula", ["Twilight", "Hotel Transylvania", "Nosferatu"], "medium"],
  ["🧟🌍", "World War Z", ["Zombieland", "28 Days Later", "Dawn of the Dead"], "hard"],
  ["👸🐸", "The Princess and the Frog", ["Shrek", "Brave", "Tangled"], "medium"],
  ["🐘🎪", "Dumbo", ["Madagascar", "The Greatest Showman", "Water for Elephants"], "medium"],
  ["🦊🐰", "Zootopia", ["Robin Hood", "Fantastic Mr. Fox", "The Fox and the Hound"], "medium"],
  ["🌊👧🐔", "Moana", ["The Little Mermaid", "Lilo & Stitch", "Brave"], "medium"],
  ["🦸‍♂️👨‍👩‍👧‍👦", "The Incredibles", ["The Avengers", "Justice League", "X-Men"], "easy"],
  ["🍄👨‍🔧", "Super Mario", ["Wreck-It Ralph", "Sonic the Hedgehog", "Donkey Kong"], "medium"],
  ["🚢🧊💔", "Titanic", ["The Poseidon Adventure", "Pearl Harbor", "Iceberg"], "easy"],
  ["🐲👦", "How to Train Your Dragon", ["Pete's Dragon", "Eragon", "Mulan"], "medium"],
  ["🐝🎬", "Bee Movie", ["Antz", "A Bug's Life", "The Wild"], "hard"],
  ["🤖🚗", "Transformers", ["Cars", "RoboCop", "WALL-E"], "medium"],
  ["🦁👑", "The Lion King", ["The Jungle Book", "Madagascar", "Zootopia"], "easy"],
  ["❄️👸", "Frozen", ["Ice Age", "Happy Feet", "The Polar Express"], "easy"],
  ["🕷️👨", "Spider-Man", ["Ant-Man", "Iron Man", "Batman"], "easy"],
  ["🚗⚡", "Cars", ["Fast & Furious", "Speed Racer", "Need for Speed"], "medium"],
  ["🐠🔍", "Finding Nemo", ["Finding Dory", "Shark Tale", "The Little Mermaid"], "easy"],
  ["👨‍🚀🌽", "Interstellar", ["Gravity", "The Martian", "Apollo 13"], "hard"],
  ["🦍🏙️", "King Kong", ["Godzilla", "Rampage", "Mighty Joe Young"], "medium"],
  ["🤖👮", "RoboCop", ["Terminator", "Chappie", "I, Robot"], "hard"],
  ["🐀🎈", "It", ["Pennywise", "Saw", "The Clown"], "hard"],
  ["👨‍🦱✂️", "Edward Scissorhands", ["Sweeney Todd", "Frankenstein", "The Barber"], "hard"],
  ["🐉🀄", "Mulan", ["Brave", "Pocahontas", "The Last Airbender"], "medium"],
];

// ---------------- ODD ONE OUT (items[4], odd index, reason, tier) ----------------
const ODD = [
  [["Mercury", "Venus", "Earth", "Moon"], 3, "The Moon is a satellite, not a planet", "medium"],
  [["Lion", "Tiger", "Leopard", "Wolf"], 3, "A wolf is not a big cat", "medium"],
  [["Square", "Triangle", "Circle", "Cube"], 3, "A cube is 3D; the rest are 2D shapes", "medium"],
  [["Gold", "Silver", "Iron", "Diamond"], 3, "Diamond is not a metal", "medium"],
  [["Rose", "Tulip", "Oak", "Daisy"], 2, "An oak is a tree, not a flower", "easy"],
  [["Guitar", "Violin", "Flute", "Cello"], 2, "A flute is wind; the rest are string instruments", "hard"],
  [["Pacific", "Atlantic", "Mediterranean", "Indian"], 2, "The Mediterranean is a sea, not an ocean", "hard"],
  [["Whale", "Shark", "Dolphin", "Seal"], 1, "A shark is a fish; the rest are mammals", "hard"],
  [["Mars", "Jupiter", "Saturn", "Sun"], 3, "The Sun is a star, not a planet", "easy"],
  [["Copper", "Oxygen", "Helium", "Nitrogen"], 0, "Copper is a metal; the rest are gases", "medium"],
  [["Apple", "Mango", "Potato", "Cherry"], 2, "A potato is a vegetable", "easy"],
  [["English", "Spanish", "Python", "French"], 2, "Python is a programming language", "medium"],
  [["Triangle", "Pentagon", "Hexagon", "Sphere"], 3, "A sphere is 3D", "medium"],
  [["Sparrow", "Eagle", "Bat", "Owl"], 2, "A bat is a mammal, not a bird", "hard"],
  [["Nile", "Amazon", "Everest", "Yangtze"], 2, "Everest is a mountain, not a river", "easy"],
  [["Red", "Green", "Blue", "Loud"], 3, "Loud is a sound, not a color", "easy"],
  [["Carrot", "Spinach", "Broccoli", "Banana"], 3, "A banana is a fruit", "easy"],
  [["Saturn", "Neptune", "Pluto", "Uranus"], 2, "Pluto is a dwarf planet", "medium"],
  [["Hydrogen", "Helium", "Lithium", "Chlorine"], 3, "Chlorine is a halogen; the others top the periodic table", "hard"],
  [["Piano", "Trumpet", "Drum", "Harp"], 1, "A trumpet is a brass instrument", "medium"],
  [["Cobra", "Python", "Viper", "Gecko"], 3, "A gecko is a lizard, not a snake", "medium"],
  [["Spain", "Portugal", "Morocco", "France"], 2, "Morocco is in Africa, not Europe", "medium"],
  [["Triangle", "Rhombus", "Square", "Trapezoid"], 0, "A triangle has three sides; the rest have four", "hard"],
  [["Jupiter", "Mars", "Venus", "Andromeda"], 3, "Andromeda is a galaxy", "hard"],
  [["Maple", "Pine", "Bamboo", "Birch"], 2, "Bamboo is a grass, not a tree", "hard"],
  [["Euro", "Yen", "Dollar", "Celsius"], 3, "Celsius is a temperature unit, not a currency", "easy"],
  [["Ruby", "Emerald", "Sapphire", "Granite"], 3, "Granite is a rock, not a gemstone", "medium"],
  [["Soccer", "Tennis", "Chess", "Rugby"], 2, "Chess is not a physical sport", "medium"],
  [["Heart", "Liver", "Lung", "Femur"], 3, "The femur is a bone, not an organ", "medium"],
  [["Comet", "Asteroid", "Meteor", "Quasar"], 3, "A quasar is a distant galactic object", "hard"],
  [["Italy", "Japan", "Brazil", "Egypt"], 2, "Brazil is in the Southern Hemisphere among these / not in Europe-Asia-Africa cluster", "hard"],
  [["Oxygen", "Gold", "Silver", "Platinum"], 0, "Oxygen is a gas; the rest are precious metals", "easy"],
  [["Violin", "Viola", "Cello", "Trombone"], 3, "A trombone is brass; the rest are the string family", "hard"],
  [["Triangle", "Octagon", "Hexagon", "Decagon"], 0, "A triangle is the only one without an even-sounding 'gon' polygon name set / fewest sides", "hard"],
  [["Frog", "Toad", "Salamander", "Lizard"], 3, "A lizard is a reptile; the rest are amphibians", "hard"],
  [["Sun", "Moon", "Star", "Comet"], 1, "The Moon reflects light; the rest emit or streak light", "hard"],
  [["Apple", "Microsoft", "Amazon", "Toyota"], 3, "Toyota is a carmaker, not a tech company", "medium"],
  [["Spring", "Summer", "Monday", "Winter"], 2, "Monday is a day, not a season", "easy"],
  [["Circle", "Ellipse", "Square", "Oval"], 2, "A square has corners; the rest are curved", "medium"],
  [["Mercury", "Mars", "Titan", "Venus"], 2, "Titan is a moon, not a planet", "hard"],
];

// ---------------- TRUE / FALSE (s, a, tier) ----------------
const TF = [
  ["The human body has four lungs.", false, "easy"],
  ["Sound travels faster in water than in air.", true, "hard"],
  ["The Sahara is the largest hot desert on Earth.", true, "medium"],
  ["Sharks are mammals.", false, "easy"],
  ["The Eiffel Tower can grow taller in summer heat.", true, "hard"],
  ["A group of crows is called a murder.", true, "medium"],
  ["The Great Pyramid of Giza is in Mexico.", false, "easy"],
  ["Venus is the hottest planet in the solar system.", true, "medium"],
  ["Humans share about 60% of their DNA with bananas.", true, "hard"],
  ["The Pacific Ocean is the deepest ocean.", true, "medium"],
  ["Spiders are insects.", false, "easy"],
  ["Light from the Sun takes about 8 minutes to reach Earth.", true, "medium"],
  ["The currency of Japan is the won.", false, "medium"],
  ["Mount Kilimanjaro is the tallest mountain in Africa.", true, "medium"],
  ["A tomato is botanically a fruit.", true, "easy"],
  ["The chemical symbol for sodium is So.", false, "medium"],
  ["Antarctica is the driest continent on Earth.", true, "hard"],
  ["The heart is located on the right side of the chest.", false, "easy"],
  ["There are 206 bones in the adult human body.", true, "medium"],
  ["The speed of light is faster than the speed of sound.", true, "easy"],
  ["Bats are blind.", false, "medium"],
  ["The Amazon rainforest produces about 20% of the world's oxygen.", false, "hard"],
  ["Gold is heavier than lead.", true, "hard"],
  ["The Mona Lisa was painted by Leonardo da Vinci.", true, "easy"],
  ["A leap year has 366 days.", true, "easy"],
  ["Octopuses have blue blood.", true, "hard"],
  ["The Statue of Liberty was originally brown.", true, "hard"],
  ["Penguins live at the North Pole.", false, "medium"],
  ["Water boils at 100°C at sea level.", true, "easy"],
  ["The Earth is the third planet from the Sun.", true, "easy"],
  ["Humans only use 10% of their brains.", false, "medium"],
  ["Diamonds are made of carbon.", true, "medium"],
  ["The capital of Australia is Sydney.", false, "medium"],
  ["A jiffy is an actual unit of time.", true, "hard"],
  ["Lightning is hotter than the surface of the Sun.", true, "hard"],
  ["The Wall of China is a single continuous wall.", false, "medium"],
  ["Goldfish have a memory span of only three seconds.", false, "medium"],
  ["The Atlantic Ocean is larger than the Pacific Ocean.", false, "easy"],
  ["Saturn is the only planet with rings.", false, "medium"],
  ["The human nose can detect over a trillion scents.", true, "hard"],
  ["Mercury is the closest planet to the Sun.", true, "easy"],
  ["An ostrich's eye is bigger than its brain.", true, "hard"],
  ["The Dead Sea is a freshwater lake.", false, "medium"],
  ["Coffee is made from roasted seeds.", true, "medium"],
  ["The unicorn is the national animal of Scotland.", true, "hard"],
  ["A bolt of lightning contains no electricity.", false, "easy"],
  ["The blue whale is the largest animal ever known to have lived.", true, "easy"],
  ["Bananas grow pointing downward.", false, "hard"],
  ["The Sun is a planet.", false, "easy"],
  ["Honey can be used as an antiseptic.", true, "hard"],
  ["The Great Barrier Reef is off the coast of Australia.", true, "easy"],
  ["Glass is made primarily from sand.", true, "medium"],
  ["Humans can distinguish only seven colors.", false, "medium"],
  ["The fastest land animal is the cheetah.", true, "easy"],
  ["The Pyramids were built by the ancient Greeks.", false, "easy"],
  ["A century is 100 years.", true, "easy"],
  ["Owls can rotate their heads a full 360 degrees.", false, "hard"],
  ["The smallest bone in the body is in the ear.", true, "medium"],
  ["Jupiter is the largest planet in the solar system.", true, "easy"],
  ["Tomatoes are native to Australia.", false, "hard"],
];

// ---------------- RIDDLES (riddle, correct, decoys[3], tier) ----------------
const RIDDLES = [
  ["What has to be broken before you can use it?", "An egg", ["A code", "A promise", "A seal"], "easy"],
  ["I'm light as a feather, yet the strongest person can't hold me for five minutes. What am I?", "Breath", ["A shadow", "A thought", "Time"], "medium"],
  ["What has one head, one foot, and four legs?", "A bed", ["A table", "A horse", "A tripod"], "medium"],
  ["What can fill a room but takes up no space?", "Light", ["Air", "Sound", "Smell"], "medium"],
  ["What has a thumb and four fingers but is not alive?", "A glove", ["A statue", "A clock", "A rake"], "easy"],
  ["What kind of band never plays music?", "A rubber band", ["A wedding band", "A headband", "A waistband"], "medium"],
  ["What has 13 hearts but no other organs?", "A deck of cards", ["A hospital", "A Valentine", "An octopus"], "hard"],
  ["The more of this there is, the less you see. What is it?", "Darkness", ["Fog", "Smoke", "Rain"], "medium"],
  ["What word is spelled incorrectly in every dictionary?", "Incorrectly", ["Misspelled", "Wrong", "Dictionary"], "hard"],
  ["What has a bottom at the top?", "A leg", ["A mountain", "A bottle", "A ladder"], "hard"],
  ["What invention lets you look right through a wall?", "A window", ["A telescope", "An X-ray", "A mirror"], "easy"],
  ["What can you keep after giving to someone?", "Your word", ["A gift", "A secret", "Money"], "medium"],
  ["What gets bigger the more you take away from it?", "A hole", ["A debt", "A shadow", "A wound"], "medium"],
  ["What goes through cities and fields but never moves?", "A road", ["A river", "The wind", "A train"], "medium"],
  ["I have branches but no fruit, trunk, or leaves. What am I?", "A bank", ["A river", "A family", "A library"], "hard"],
  ["What can't talk but will reply when spoken to?", "An echo", ["A mirror", "A parrot", "A phone"], "medium"],
  ["What has words but never speaks?", "A book", ["A sign", "A phone", "A song"], "easy"],
  ["What is full of holes but still holds water?", "A sponge", ["A net", "A sieve", "A bucket"], "medium"],
  ["What begins with T, ends with T, and has T in it?", "A teapot", ["A ticket", "A target", "A turret"], "hard"],
  ["What has four wheels and flies?", "A garbage truck", ["An airplane", "A kite", "A drone"], "hard"],
  ["What can run but never walks, has a mouth but never talks?", "A river", ["A clock", "A car", "A dog"], "medium"],
  ["What two things can you never eat for breakfast?", "Lunch and dinner", ["Bread and butter", "Eggs and bacon", "Tea and toast"], "medium"],
  ["What gets sharper the more you use it?", "Your brain", ["A knife", "A pencil", "An axe"], "medium"],
  ["A man describes his daughters: each has a brother. How many children at minimum?", "Three", ["Two", "Four", "Five"], "hard"],
  ["What is so fragile that saying its name breaks it?", "Silence", ["Glass", "A bubble", "A heart"], "medium"],
  ["What can you hold in your right hand but never in your left hand?", "Your left hand", ["A pen", "A mirror", "Your elbow"], "hard"],
  ["What has a face and two hands but no arms or legs?", "A clock", ["A statue", "A doll", "A coin"], "easy"],
  ["What kind of room has no doors or windows?", "A mushroom", ["A bathroom", "A vacuum", "A classroom"], "hard"],
  ["What goes up and down but never moves?", "A staircase", ["An elevator", "A yo-yo", "A flag"], "medium"],
  ["The more you have of it, the less you see. (At night.)", "Darkness", ["Stars", "Sleep", "Silence"], "easy"],
  ["What flies without wings?", "Time", ["A cloud", "A seed", "A rumor"], "medium"],
  ["What has many keys but opens no doors and plays no music?", "A keyboard", ["A piano", "A jailer", "A map"], "medium"],
  ["What has a ring but no finger?", "A telephone", ["A bell", "A planet", "A boxer"], "easy"],
  ["I am always coming but never arrive. What am I?", "Tomorrow", ["The future", "A train", "Spring"], "medium"],
  ["What can be cracked, made, told, and played?", "A joke", ["A code", "A game", "A secret"], "medium"],
  ["What has a spine but no bones?", "A book", ["A snake", "A leaf", "A cactus"], "medium"],
  ["What building has the most stories?", "A library", ["A skyscraper", "A hotel", "A museum"], "hard"],
  ["What has roots that nobody sees, and is taller than trees?", "A mountain", ["A river", "A cloud", "A tower"], "hard"],
  ["What can you break without touching it?", "A promise", ["A glass", "A record", "A habit"], "medium"],
  ["What is always in front of you but can't be seen?", "The future", ["Your nose", "Air", "Tomorrow"], "medium"],
];

function run() {
  // Dedupe + expand the four thin banks.
  let emoji = dedupe(read("emoji.json"), (e) => e.emoji + "|" + e.correct);
  let odd = dedupe(read("oddoneout.json"), (e) => e.items.join(",") + "|" + e.odd);
  let tf = dedupe(read("truefalse.json"), (e) => e.s);
  let riddles = dedupe(read("riddles.json"), (e) => e.riddle);

  const haveEmoji = new Set(emoji.map((e) => e.emoji + "|" + e.correct));
  for (const [em, correct, decoys, tier] of EMOJI)
    if (!haveEmoji.has(em + "|" + correct)) emoji.push({ emoji: em, correct, decoys, tier });

  const haveOdd = new Set(odd.map((e) => e.items.join(",")));
  for (const [items, oddIdx, reason, tier] of ODD)
    if (!haveOdd.has(items.join(","))) odd.push({ items, odd: oddIdx, reason, tier });

  const haveTf = new Set(tf.map((e) => e.s));
  for (const [s, a, tier] of TF) if (!haveTf.has(s)) tf.push({ s, a, tier });

  const haveRid = new Set(riddles.map((e) => e.riddle));
  for (const [riddle, correct, decoys, tier] of RIDDLES)
    if (!haveRid.has(riddle)) riddles.push({ riddle, correct, decoys, tier });

  write("emoji.json", emoji);
  write("oddoneout.json", odd);
  write("truefalse.json", tf);
  write("riddles.json", riddles);

  // Dedupe the rest in place (no expansion) so bankSize reflects real distinct content.
  write("trivia.json", dedupe(read("trivia.json"), (e) => e.q));
  write("words.json", dedupe(read("words.json"), (e) => e.prompt + "|" + e.correct));

  console.log("emoji:", emoji.length, "| oddoneout:", odd.length, "| truefalse:", tf.length, "| riddles:", riddles.length);
  console.log("trivia:", read("trivia.json").length, "| words:", read("words.json").length);
}

run();
