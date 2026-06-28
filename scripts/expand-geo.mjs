// One-shot content generator: expands the GeoGuess + Name-That-Landmark banks.
//
// For each curated NEW entry it fetches the landmark's Wikipedia REST summary, pulls the real
// upload.wikimedia.org image URL (no filename guessing), downloads a ~1024px copy into public/geo/,
// validates it's a real image, and — only on success — appends matching entries to data/geo.json and
// data/landmarks.json (same `id`, so landmark reuses the photo). It also tags the EXISTING 43 entries
// with difficulty tiers. Idempotent: ids already present in geo.json are skipped.
//
// Run from arcadia-backend:  node scripts/expand-geo.mjs

import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEO_JSON = join(ROOT, "data/geo.json");
const LM_JSON = join(ROOT, "data/landmarks.json");
const IMG_DIR = join(ROOT, "public/geo");
const UA = "ArcadiaGame/1.0 (educational quiz; contact@arcadia.example)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Difficulty tiers for the EXISTING 43 ids (by global fame). Missing => medium.
const EXISTING_TIERS = {
  eiffel: "easy", colosseum: "easy", opera: "easy", taj: "easy", ggbridge: "easy",
  liberty: "easy", bigben: "easy", redeemer: "easy", burj: "easy", pisa: "easy",
  greatwall: "easy", gizapyramid: "easy", hollywood: "easy", whitehouse: "easy",
  sagrada: "medium", acropolis: "medium", forbidden: "medium", fuji: "medium", senso: "medium",
  angkor: "medium", marina: "medium", neuschwanstein: "medium", stbasil: "medium", hagia: "medium",
  burjalarab: "medium", chichen: "medium", spaceneedle: "medium", brandenburg: "medium",
  charlesbridge: "medium", moai: "medium", uluru: "medium", wat: "medium", gateofindia: "medium",
  petra: "medium",
  atomium: "hard", windmills: "hard", littlemermaid: "hard", westernwall: "hard", gatewaymo: "hard",
  obelisco: "hard", tianjin: "hard", nblue: "hard", tablemountain: "hard",
};

// Curated NEW entries. wiki = Wikipedia page title used to fetch the lead image.
const NEW = [
  { id: "machupicchu", wiki: "Machu Picchu", answer: "Cusco Region, Peru", cityDecoys: ["La Paz, Bolivia", "Quito, Ecuador", "Bogotá, Colombia"], landmark: "Machu Picchu", lmDecoys: ["Chichen Itza", "Tikal", "Sacsayhuamán"], tier: "medium" },
  { id: "borobudur", wiki: "Borobudur", answer: "Central Java, Indonesia", cityDecoys: ["Bagan, Myanmar", "Siem Reap, Cambodia", "Ayutthaya, Thailand"], landmark: "Borobudur", lmDecoys: ["Angkor Wat", "Bagan", "Prambanan"], tier: "medium" },
  { id: "bagan", wiki: "Bagan", answer: "Bagan, Myanmar", cityDecoys: ["Luang Prabang, Laos", "Siem Reap, Cambodia", "Chiang Mai, Thailand"], landmark: "Bagan Temples", lmDecoys: ["Borobudur", "Angkor Wat", "Ayutthaya"], tier: "hard" },
  { id: "prambanan", wiki: "Prambanan", answer: "Yogyakarta, Indonesia", cityDecoys: ["Bagan, Myanmar", "Siem Reap, Cambodia", "Kandy, Sri Lanka"], landmark: "Prambanan", lmDecoys: ["Borobudur", "Angkor Wat", "Bagan"], tier: "hard" },
  { id: "himeji", wiki: "Himeji Castle", answer: "Himeji, Japan", cityDecoys: ["Kyoto, Japan", "Osaka, Japan", "Nagoya, Japan"], landmark: "Himeji Castle", lmDecoys: ["Osaka Castle", "Nijō Castle", "Matsumoto Castle"], tier: "medium" },
  { id: "potala", wiki: "Potala Palace", answer: "Lhasa, Tibet", cityDecoys: ["Kathmandu, Nepal", "Thimphu, Bhutan", "Leh, India"], landmark: "Potala Palace", lmDecoys: ["Tashilhunpo Monastery", "Tiger's Nest", "Jokhang Temple"], tier: "hard" },
  { id: "alhambra", wiki: "Alhambra", answer: "Granada, Spain", cityDecoys: ["Seville, Spain", "Córdoba, Spain", "Fez, Morocco"], landmark: "Alhambra", lmDecoys: ["Mezquita of Córdoba", "Seville Alcázar", "Aljafería"], tier: "medium" },
  { id: "montstmichel", wiki: "Mont-Saint-Michel", answer: "Normandy, France", cityDecoys: ["Brittany, France", "Cornwall, England", "Galicia, Spain"], landmark: "Mont-Saint-Michel", lmDecoys: ["St Michael's Mount", "Rocamadour", "Le Puy-en-Velay"], tier: "medium" },
  { id: "matterhorn", wiki: "Matterhorn", answer: "Zermatt, Switzerland", cityDecoys: ["Chamonix, France", "Cortina, Italy", "Innsbruck, Austria"], landmark: "Matterhorn", lmDecoys: ["Mont Blanc", "Eiger", "Jungfrau"], tier: "medium" },
  { id: "cntower", wiki: "CN Tower, Toronto", answer: "Toronto, Canada", cityDecoys: ["Chicago, USA", "Seattle, USA", "Montreal, Canada"], landmark: "CN Tower", lmDecoys: ["Space Needle", "Willis Tower", "Sky Tower"], tier: "easy" },
  { id: "petronas", wiki: "Petronas Towers", answer: "Kuala Lumpur, Malaysia", cityDecoys: ["Singapore", "Jakarta, Indonesia", "Bangkok, Thailand"], landmark: "Petronas Towers", lmDecoys: ["Taipei 101", "Burj Khalifa", "Marina Bay Sands"], tier: "easy" },
  { id: "taipei101", wiki: "Taipei 101", answer: "Taipei, Taiwan", cityDecoys: ["Hong Kong", "Shanghai, China", "Seoul, South Korea"], landmark: "Taipei 101", lmDecoys: ["Petronas Towers", "Shanghai Tower", "Burj Khalifa"], tier: "easy" },
  { id: "sheikhzayed", wiki: "Sheikh Zayed Mosque", answer: "Abu Dhabi, UAE", cityDecoys: ["Doha, Qatar", "Muscat, Oman", "Manama, Bahrain"], landmark: "Sheikh Zayed Grand Mosque", lmDecoys: ["Sultan Qaboos Mosque", "Faisal Mosque", "Blue Mosque"], tier: "medium" },
  { id: "bluemosque", wiki: "Sultan Ahmed Mosque", answer: "Istanbul, Turkey", cityDecoys: ["Cairo, Egypt", "Isfahan, Iran", "Bursa, Turkey"], landmark: "Blue Mosque", lmDecoys: ["Hagia Sophia", "Süleymaniye Mosque", "Selimiye Mosque"], tier: "medium" },
  { id: "teotihuacan", wiki: "Teotihuacan", answer: "State of Mexico, Mexico", cityDecoys: ["Oaxaca, Mexico", "Yucatán, Mexico", "Guatemala City, Guatemala"], landmark: "Teotihuacan", lmDecoys: ["Chichen Itza", "Tikal", "Monte Albán"], tier: "hard" },
  { id: "tikal", wiki: "Tikal", answer: "Petén, Guatemala", cityDecoys: ["Yucatán, Mexico", "Copán, Honduras", "Belize City, Belize"], landmark: "Tikal", lmDecoys: ["Chichen Itza", "Teotihuacan", "Palenque"], tier: "hard" },
  { id: "niagara", wiki: "Niagara Falls", answer: "Ontario, Canada", cityDecoys: ["New York, USA", "Quebec, Canada", "Michigan, USA"], landmark: "Niagara Falls", lmDecoys: ["Victoria Falls", "Iguazu Falls", "Angel Falls"], tier: "easy" },
  { id: "victoriafalls", wiki: "Victoria Falls", answer: "Livingstone, Zambia", cityDecoys: ["Nairobi, Kenya", "Maun, Botswana", "Arusha, Tanzania"], landmark: "Victoria Falls", lmDecoys: ["Niagara Falls", "Iguazu Falls", "Murchison Falls"], tier: "medium" },
  { id: "grandcanyon", wiki: "Grand Canyon", answer: "Arizona, USA", cityDecoys: ["Utah, USA", "Nevada, USA", "Colorado, USA"], landmark: "Grand Canyon", lmDecoys: ["Bryce Canyon", "Zion Canyon", "Antelope Canyon"], tier: "easy" },
  { id: "mountrushmore", wiki: "Mount Rushmore", answer: "South Dakota, USA", cityDecoys: ["Wyoming, USA", "Montana, USA", "Colorado, USA"], landmark: "Mount Rushmore", lmDecoys: ["Crazy Horse Memorial", "Stone Mountain", "Mount Vernon"], tier: "easy" },
  { id: "santorini", wiki: "Santorini", answer: "Santorini, Greece", cityDecoys: ["Mykonos, Greece", "Naxos, Greece", "Bodrum, Turkey"], landmark: "Santorini", lmDecoys: ["Mykonos", "Positano", "Oia"], tier: "medium" },
  { id: "dubrovnik", wiki: "Dubrovnik", answer: "Dubrovnik, Croatia", cityDecoys: ["Split, Croatia", "Kotor, Montenegro", "Venice, Italy"], landmark: "Dubrovnik Old Town", lmDecoys: ["Kotor Old Town", "Split's Diocletian's Palace", "Mdina"], tier: "hard" },
  { id: "meteora", wiki: "Meteora", answer: "Thessaly, Greece", cityDecoys: ["Epirus, Greece", "Cappadocia, Turkey", "Mount Athos, Greece"], landmark: "Meteora", lmDecoys: ["Mount Athos", "Cappadocia", "Sümela Monastery"], tier: "hard" },
  { id: "edinburghcastle", wiki: "Edinburgh Castle", answer: "Edinburgh, Scotland", cityDecoys: ["Stirling, Scotland", "Dublin, Ireland", "York, England"], landmark: "Edinburgh Castle", lmDecoys: ["Stirling Castle", "Edinburgh's Holyrood Palace", "Windsor Castle"], tier: "medium" },
  { id: "towerbridge", wiki: "Tower Bridge", answer: "London, UK", cityDecoys: ["Newcastle, UK", "Manchester, UK", "Liverpool, UK"], landmark: "Tower Bridge", lmDecoys: ["London Bridge", "Millennium Bridge", "Brooklyn Bridge"], tier: "easy" },
  { id: "stonehenge", wiki: "Stonehenge", answer: "Wiltshire, England", cityDecoys: ["Cornwall, England", "Orkney, Scotland", "County Meath, Ireland"], landmark: "Stonehenge", lmDecoys: ["Avebury", "Carnac Stones", "Newgrange"], tier: "easy" },
  { id: "versailles", wiki: "Palace of Versailles", answer: "Versailles, France", cityDecoys: ["Vienna, Austria", "Madrid, Spain", "Potsdam, Germany"], landmark: "Palace of Versailles", lmDecoys: ["Schönbrunn Palace", "Royal Palace of Madrid", "Sanssouci"], tier: "medium" },
  { id: "colognecathedral", wiki: "Cologne Cathedral", answer: "Cologne, Germany", cityDecoys: ["Strasbourg, France", "Milan, Italy", "Vienna, Austria"], landmark: "Cologne Cathedral", lmDecoys: ["Milan Cathedral", "Strasbourg Cathedral", "Notre-Dame de Paris"], tier: "medium" },
  { id: "florenceduomo", wiki: "Florence Cathedral", answer: "Florence, Italy", cityDecoys: ["Siena, Italy", "Bologna, Italy", "Pisa, Italy"], landmark: "Florence Cathedral (Duomo)", lmDecoys: ["Milan Cathedral", "St Peter's Basilica", "Siena Cathedral"], tier: "medium" },
  { id: "sanmarco", wiki: "Piazza San Marco", answer: "Venice, Italy", cityDecoys: ["Florence, Italy", "Verona, Italy", "Trieste, Italy"], landmark: "St Mark's Square", lmDecoys: ["Piazza Navona", "Piazza del Duomo", "St Peter's Square"], tier: "medium" },
  { id: "terracotta", wiki: "Terracotta Army", answer: "Xi'an, China", cityDecoys: ["Luoyang, China", "Nanjing, China", "Chengdu, China"], landmark: "Terracotta Army", lmDecoys: ["Forbidden City", "Mogao Caves", "Longmen Grottoes"], tier: "medium" },
  { id: "leshan", wiki: "Leshan Giant Buddha", answer: "Sichuan, China", cityDecoys: ["Yunnan, China", "Henan, China", "Gansu, China"], landmark: "Leshan Giant Buddha", lmDecoys: ["Tian Tan Buddha", "Spring Temple Buddha", "Ushiku Daibutsu"], tier: "hard" },
  { id: "zhangjiajie", wiki: "Zhangjiajie National Forest Park", answer: "Hunan, China", cityDecoys: ["Guilin, China", "Guizhou, China", "Sapa, Vietnam"], landmark: "Zhangjiajie", lmDecoys: ["Guilin Karsts", "Huangshan", "Halong Bay"], tier: "hard" },
  { id: "halongbay", wiki: "Hạ Long Bay", answer: "Quảng Ninh, Vietnam", cityDecoys: ["Krabi, Thailand", "Palawan, Philippines", "Guilin, China"], landmark: "Ha Long Bay", lmDecoys: ["Phang Nga Bay", "El Nido", "Guilin"], tier: "medium" },
  { id: "gyeongbokgung", wiki: "Gyeongbokgung", answer: "Seoul, South Korea", cityDecoys: ["Kyoto, Japan", "Beijing, China", "Busan, South Korea"], landmark: "Gyeongbokgung Palace", lmDecoys: ["Forbidden City", "Changdeokgung", "Nijō Castle"], tier: "hard" },
  { id: "pamukkale", wiki: "Pamukkale", answer: "Denizli, Turkey", cityDecoys: ["Antalya, Turkey", "Cappadocia, Turkey", "Yellowstone, USA"], landmark: "Pamukkale", lmDecoys: ["Mammoth Hot Springs", "Huanglong", "Badab-e Surt"], tier: "hard" },
  { id: "cappadocia", wiki: "Cappadocia", answer: "Nevşehir, Turkey", cityDecoys: ["Konya, Turkey", "Meteora, Greece", "Petra, Jordan"], landmark: "Cappadocia", lmDecoys: ["Meteora", "Bryce Canyon", "Göreme"], tier: "medium" },
  { id: "abusimbel", wiki: "Abu Simbel", answer: "Aswan, Egypt", cityDecoys: ["Luxor, Egypt", "Khartoum, Sudan", "Cairo, Egypt"], landmark: "Abu Simbel", lmDecoys: ["Karnak Temple", "Temple of Luxor", "Valley of the Kings"], tier: "hard" },
  { id: "registan", wiki: "Registan", answer: "Samarkand, Uzbekistan", cityDecoys: ["Bukhara, Uzbekistan", "Isfahan, Iran", "Mashhad, Iran"], landmark: "Registan", lmDecoys: ["Imam Square", "Bibi-Khanym Mosque", "Kalyan Minaret"], tier: "hard" },
  { id: "moraine", wiki: "Moraine Lake", answer: "Alberta, Canada", cityDecoys: ["British Columbia, Canada", "Montana, USA", "Patagonia, Argentina"], landmark: "Moraine Lake", lmDecoys: ["Lake Louise", "Peyto Lake", "Lake Bled"], tier: "hard" },
  { id: "plitvice", wiki: "Plitvice Lakes National Park", answer: "Plitvice, Croatia", cityDecoys: ["Bled, Slovenia", "Bohinj, Slovenia", "Bavaria, Germany"], landmark: "Plitvice Lakes", lmDecoys: ["Krka Falls", "Lake Bled", "Kravice Falls"], tier: "hard" },
  { id: "neuschwanstein2", wiki: "Hohenzollern Castle", answer: "Baden-Württemberg, Germany", cityDecoys: ["Bavaria, Germany", "Tyrol, Austria", "Bohemia, Czechia"], landmark: "Hohenzollern Castle", lmDecoys: ["Neuschwanstein", "Hohenwerfen Castle", "Eltz Castle"], tier: "hard" },
  // ── Batch 2: 200 more curated landmarks ───────────────────────────────────
  { id: "sagradafamilia", wiki: "Sagrada Família", answer: "Barcelona, Spain", cityDecoys: ["Madrid, Spain", "Valencia, Spain", "Lisbon, Portugal"], landmark: "Sagrada Família", lmDecoys: ["Cologne Cathedral", "Notre-Dame de Paris", "Milan Cathedral"], tier: "easy" },
  { id: "notre_dame", wiki: "Notre-Dame de Paris", answer: "Paris, France", cityDecoys: ["Lyon, France", "Brussels, Belgium", "Strasbourg, France"], landmark: "Notre-Dame de Paris", lmDecoys: ["Chartres Cathedral", "Cologne Cathedral", "Westminster Abbey"], tier: "easy" },
  { id: "westminster", wiki: "Palace of Westminster", answer: "London, UK", cityDecoys: ["Edinburgh, UK", "Dublin, Ireland", "Amsterdam, Netherlands"], landmark: "Palace of Westminster", lmDecoys: ["Buckingham Palace", "Windsor Castle", "Hampton Court"], tier: "easy" },
  { id: "buckingham", wiki: "Buckingham Palace", answer: "London, UK", cityDecoys: ["Windsor, UK", "Edinburgh, UK", "Oxford, UK"], landmark: "Buckingham Palace", lmDecoys: ["Windsor Castle", "Kensington Palace", "Hampton Court Palace"], tier: "easy" },
  { id: "louvre", wiki: "Louvre", answer: "Paris, France", cityDecoys: ["Brussels, Belgium", "Berlin, Germany", "Amsterdam, Netherlands"], landmark: "The Louvre", lmDecoys: ["Musée d'Orsay", "Pompidou Centre", "Palace of Versailles"], tier: "easy" },
  { id: "colosseum2", wiki: "Colosseum", answer: "Rome, Italy", cityDecoys: ["Athens, Greece", "Split, Croatia", "Pula, Croatia"], landmark: "Colosseum", lmDecoys: ["Roman Forum", "Circus Maximus", "Pantheon"], tier: "easy" },
  { id: "st_peters", wiki: "St._Peter's_Basilica", answer: "Vatican City", cityDecoys: ["Rome, Italy", "Florence, Italy", "Milan, Italy"], landmark: "St. Peter's Basilica", lmDecoys: ["Pantheon", "Sistine Chapel", "Florence Cathedral"], tier: "easy" },
  { id: "trevi_fountain", wiki: "Trevi_Fountain", answer: "Rome, Italy", cityDecoys: ["Naples, Italy", "Florence, Italy", "Venice, Italy"], landmark: "Trevi Fountain", lmDecoys: ["Fontana dei Quattro Fiumi", "Fountain of the Barcaccia", "Neptune Fountain Bologna"], tier: "medium" },
  { id: "parthenon", wiki: "Parthenon", answer: "Athens, Greece", cityDecoys: ["Rome, Italy", "Ephesus, Turkey", "Segesta, Italy"], landmark: "Parthenon", lmDecoys: ["Temple of Zeus", "Erechtheion", "Propylaea"], tier: "easy" },
  { id: "pompeii", wiki: "Pompeii", answer: "Campania, Italy", cityDecoys: ["Herculaneum, Italy", "Paestum, Italy", "Ostia Antica, Italy"], landmark: "Pompeii", lmDecoys: ["Herculaneum", "Paestum", "Ostia Antica"], tier: "medium" },
  { id: "alhambra2", wiki: "Alhambra", answer: "Granada, Spain", cityDecoys: ["Córdoba, Spain", "Seville, Spain", "Toledo, Spain"], landmark: "Alhambra", lmDecoys: ["Alcázar of Seville", "Medina Azahara", "Aljafería"], tier: "medium" },
  { id: "seville_cathedral", wiki: "Seville_Cathedral", answer: "Seville, Spain", cityDecoys: ["Córdoba, Spain", "Granada, Spain", "Valencia, Spain"], landmark: "Seville Cathedral", lmDecoys: ["Córdoba Mosque-Cathedral", "Toledo Cathedral", "Barcelona Cathedral"], tier: "hard" },
  { id: "lisbon_tram", wiki: "Lisbon", answer: "Lisbon, Portugal", cityDecoys: ["Porto, Portugal", "Braga, Portugal", "Évora, Portugal"], landmark: "Lisbon", lmDecoys: ["Porto", "Sintra", "Cascais"], tier: "medium" },
  { id: "belem_tower", wiki: "Belém_Tower", answer: "Lisbon, Portugal", cityDecoys: ["Porto, Portugal", "Seville, Spain", "Cádiz, Spain"], landmark: "Belém Tower", lmDecoys: ["Pena Palace", "Jerónimos Monastery", "Castle of São Jorge"], tier: "hard" },
  { id: "sintra", wiki: "Sintra", answer: "Sintra, Portugal", cityDecoys: ["Évora, Portugal", "Coimbra, Portugal", "Obidos, Portugal"], landmark: "Sintra", lmDecoys: ["Cascais", "Setúbal", "Torres Vedras"], tier: "hard" },
  { id: "rijksmuseum", wiki: "Rijksmuseum", answer: "Amsterdam, Netherlands", cityDecoys: ["Rotterdam, Netherlands", "Utrecht, Netherlands", "Brussels, Belgium"], landmark: "Rijksmuseum", lmDecoys: ["Van Gogh Museum", "Stedelijk Museum", "Hermitage Amsterdam"], tier: "hard" },
  { id: "windmills_zaan", wiki: "Zaanse_Schans", answer: "Zaandam, Netherlands", cityDecoys: ["Kinderdijk, Netherlands", "Delft, Netherlands", "Haarlem, Netherlands"], landmark: "Zaanse Schans", lmDecoys: ["Kinderdijk Windmills", "De Zwaan Windmill", "Molen de Roos"], tier: "medium" },
  { id: "bruges", wiki: "Bruges", answer: "Bruges, Belgium", cityDecoys: ["Ghent, Belgium", "Antwerp, Belgium", "Amsterdam, Netherlands"], landmark: "Bruges", lmDecoys: ["Ghent", "Dinant", "Leuven"], tier: "hard" },
  { id: "atomium2", wiki: "Atomium", answer: "Brussels, Belgium", cityDecoys: ["Antwerp, Belgium", "Luxembourg City", "Eindhoven, Netherlands"], landmark: "Atomium", lmDecoys: ["Expo 1958 Globe", "Atomium", "Brussels Town Hall"], tier: "hard" },
  { id: "sealife_sydney", wiki: "Sydney_Harbour_Bridge", answer: "Sydney, Australia", cityDecoys: ["Melbourne, Australia", "Brisbane, Australia", "Auckland, New Zealand"], landmark: "Sydney Harbour Bridge", lmDecoys: ["Sydney Opera House", "Story Bridge", "Anzac Bridge"], tier: "easy" },
  { id: "sydney_opera", wiki: "Sydney_Opera_House", answer: "Sydney, Australia", cityDecoys: ["Melbourne, Australia", "Auckland, New Zealand", "Perth, Australia"], landmark: "Sydney Opera House", lmDecoys: ["National Centre for the Performing Arts", "Sydney Harbour Bridge", "Vienna State Opera"], tier: "easy" },
  { id: "great_ocean", wiki: "Twelve_Apostles_(Victoria)", answer: "Victoria, Australia", cityDecoys: ["South Australia", "New South Wales", "Western Australia"], landmark: "Twelve Apostles", lmDecoys: ["Giant's Causeway", "Fingal's Cave", "Cliffs of Moher"], tier: "hard" },
  { id: "uluru2", wiki: "Uluru", answer: "Northern Territory, Australia", cityDecoys: ["Queensland, Australia", "South Australia", "New South Wales"], landmark: "Uluru (Ayers Rock)", lmDecoys: ["Kata Tjuta", "Kings Canyon", "Devil's Marbles"], tier: "medium" },
  { id: "hobbiton", wiki: "Hobbiton_Movie_Set", answer: "Matamata, New Zealand", cityDecoys: ["Queenstown, New Zealand", "Rotorua, New Zealand", "Wellington, New Zealand"], landmark: "Hobbiton", lmDecoys: ["Waitomo Caves", "Wai-O-Tapu", "Tongariro Alpine Crossing"], tier: "hard" },
  { id: "milford_sound", wiki: "Milford_Sound", answer: "Fiordland, New Zealand", cityDecoys: ["Queenstown, New Zealand", "Norwegian Fjords", "Patagonia, Chile"], landmark: "Milford Sound", lmDecoys: ["Doubtful Sound", "Fiordland", "Ha Long Bay"], tier: "hard" },
  { id: "mount_fuji", wiki: "Mount_Fuji", answer: "Honshu, Japan", cityDecoys: ["Kyoto, Japan", "Hokkaido, Japan", "Nagano, Japan"], landmark: "Mount Fuji", lmDecoys: ["Mount Kilimanjaro", "Mount Vesuvius", "Mount Rainier"], tier: "easy" },
  { id: "tokyo_tower", wiki: "Tokyo_Tower", answer: "Tokyo, Japan", cityDecoys: ["Osaka, Japan", "Shanghai, China", "Seoul, South Korea"], landmark: "Tokyo Tower", lmDecoys: ["Tokyo Skytree", "CN Tower", "Eiffel Tower"], tier: "medium" },
  { id: "fushimi_inari", wiki: "Fushimi_Inari-taisha", answer: "Kyoto, Japan", cityDecoys: ["Nara, Japan", "Osaka, Japan", "Hiroshima, Japan"], landmark: "Fushimi Inari Shrine", lmDecoys: ["Itsukushima Shrine", "Meiji Shrine", "Toshogu Shrine"], tier: "medium" },
  { id: "kinkakuji", wiki: "Kinkaku-ji", answer: "Kyoto, Japan", cityDecoys: ["Nara, Japan", "Osaka, Japan", "Tokyo, Japan"], landmark: "Kinkaku-ji (Golden Pavilion)", lmDecoys: ["Ginkaku-ji", "Ryoan-ji", "Nijo Castle"], tier: "medium" },
  { id: "nara_deer", wiki: "Tōdai-ji", answer: "Nara, Japan", cityDecoys: ["Kyoto, Japan", "Osaka, Japan", "Hiroshima, Japan"], landmark: "Tōdai-ji", lmDecoys: ["Horyuji Temple", "Kasuga Grand Shrine", "Kofuku-ji"], tier: "hard" },
  { id: "hiroshima_dome", wiki: "Hiroshima_Peace_Memorial", answer: "Hiroshima, Japan", cityDecoys: ["Nagasaki, Japan", "Osaka, Japan", "Kyoto, Japan"], landmark: "Hiroshima Peace Memorial", lmDecoys: ["Nagasaki Atomic Bomb Museum", "Auschwitz Memorial", "9/11 Memorial"], tier: "medium" },
  { id: "forbidden_city", wiki: "Forbidden_City", answer: "Beijing, China", cityDecoys: ["Shanghai, China", "Nanjing, China", "Xi'an, China"], landmark: "Forbidden City", lmDecoys: ["Summer Palace", "Temple of Heaven", "Ming Tombs"], tier: "easy" },
  { id: "temple_heaven", wiki: "Temple_of_Heaven", answer: "Beijing, China", cityDecoys: ["Shanghai, China", "Nanjing, China", "Suzhou, China"], landmark: "Temple of Heaven", lmDecoys: ["Summer Palace", "Forbidden City", "Lama Temple"], tier: "medium" },
  { id: "great_wall2", wiki: "Great_Wall_of_China", answer: "Northern China", cityDecoys: ["Mongolia", "South Korea", "Japan"], landmark: "Great Wall of China", lmDecoys: ["Hadrian's Wall", "Theodosian Walls", "Walls of Dubrovnik"], tier: "easy" },
  { id: "li_river", wiki: "Li_River", answer: "Guilin, China", cityDecoys: ["Zhangjiajie, China", "Yangshuo, China", "Guilin, China"], landmark: "Li River", lmDecoys: ["Ha Long Bay", "Phang Nga Bay", "Mekong River"], tier: "hard" },
  { id: "potala_palace", wiki: "Potala_Palace", answer: "Lhasa, Tibet", cityDecoys: ["Thimphu, Bhutan", "Kathmandu, Nepal", "Dharamshala, India"], landmark: "Potala Palace", lmDecoys: ["Tashilhunpo Monastery", "Jokhang Temple", "Tiger's Nest Monastery"], tier: "hard" },
  { id: "angkor_wat2", wiki: "Angkor_Wat", answer: "Siem Reap, Cambodia", cityDecoys: ["Phnom Penh, Cambodia", "Luang Prabang, Laos", "Bangkok, Thailand"], landmark: "Angkor Wat", lmDecoys: ["Borobudur", "Bagan", "Prambanan"], tier: "easy" },
  { id: "halong_bay", wiki: "Hạ_Long_Bay", answer: "Quảng Ninh, Vietnam", cityDecoys: ["Phang Nga Bay, Thailand", "Palawan, Philippines", "Krabi, Thailand"], landmark: "Ha Long Bay", lmDecoys: ["Phang Nga Bay", "Bai Tu Long Bay", "Lan Ha Bay"], tier: "medium" },
  { id: "hoi_an", wiki: "Hoi_An", answer: "Quảng Nam, Vietnam", cityDecoys: ["Hue, Vietnam", "Da Nang, Vietnam", "Vientiane, Laos"], landmark: "Hoi An Ancient Town", lmDecoys: ["Hue Imperial Citadel", "My Son Sanctuary", "Phong Nha Cave"], tier: "hard" },
  { id: "phang_nga", wiki: "Phang_Nga_Bay", answer: "Phang Nga, Thailand", cityDecoys: ["Krabi, Thailand", "Phuket, Thailand", "Ha Long Bay, Vietnam"], landmark: "Phang Nga Bay", lmDecoys: ["Ha Long Bay", "El Nido", "Biscayne Bay"], tier: "hard" },
  { id: "ayutthaya", wiki: "Ayutthaya_Historical_Park", answer: "Phra Nakhon Si Ayutthaya, Thailand", cityDecoys: ["Bangkok, Thailand", "Chiang Mai, Thailand", "Sukhothai, Thailand"], landmark: "Ayutthaya Historical Park", lmDecoys: ["Sukhothai Historical Park", "Angkor Wat", "Borobudur"], tier: "hard" },
  { id: "bali_tanah", wiki: "Tanah_Lot", answer: "Bali, Indonesia", cityDecoys: ["Lombok, Indonesia", "Java, Indonesia", "Sri Lanka"], landmark: "Tanah Lot Temple", lmDecoys: ["Uluwatu Temple", "Pura Besakih", "Prambanan"], tier: "hard" },
  { id: "borobudur2", wiki: "Borobudur", answer: "Central Java, Indonesia", cityDecoys: ["Bali, Indonesia", "Siem Reap, Cambodia", "Pagan, Myanmar"], landmark: "Borobudur", lmDecoys: ["Prambanan", "Angkor Wat", "Bagan"], tier: "medium" },
  { id: "tiger_nest", wiki: "Tiger's_Nest", answer: "Paro, Bhutan", cityDecoys: ["Lhasa, Tibet", "Kathmandu, Nepal", "Dharamshala, India"], landmark: "Tiger's Nest Monastery", lmDecoys: ["Potala Palace", "Tashilhunpo Monastery", "Jokhang Temple"], tier: "hard" },
  { id: "taj_mahal2", wiki: "Taj_Mahal", answer: "Agra, India", cityDecoys: ["Delhi, India", "Jaipur, India", "Lucknow, India"], landmark: "Taj Mahal", lmDecoys: ["Humayun's Tomb", "Bibi Ka Maqbara", "Itimad-ud-Daulah"], tier: "easy" },
  { id: "amber_fort", wiki: "Amber_Fort", answer: "Jaipur, India", cityDecoys: ["Jodhpur, India", "Udaipur, India", "Agra, India"], landmark: "Amber Fort", lmDecoys: ["Mehrangarh Fort", "Red Fort", "Gwalior Fort"], tier: "hard" },
  { id: "golden_temple", wiki: "Harmandir_Sahib", answer: "Amritsar, India", cityDecoys: ["Delhi, India", "Chandigarh, India", "Jalandhar, India"], landmark: "Golden Temple (Harmandir Sahib)", lmDecoys: ["Jama Masjid", "Red Fort", "Fatehpur Sikri"], tier: "medium" },
  { id: "hampi", wiki: "Hampi", answer: "Karnataka, India", cityDecoys: ["Goa, India", "Hyderabad, India", "Chennai, India"], landmark: "Hampi", lmDecoys: ["Mysore Palace", "Badami Caves", "Belur Temple"], tier: "extreme" },
  { id: "sigiriya", wiki: "Sigiriya", answer: "Central Province, Sri Lanka", cityDecoys: ["Kandy, Sri Lanka", "Galle, Sri Lanka", "Polonnaruwa, Sri Lanka"], landmark: "Sigiriya Rock Fortress", lmDecoys: ["Polonnaruwa", "Anuradhapura", "Dambulla Cave Temple"], tier: "hard" },
  { id: "petra2", wiki: "Petra", answer: "Ma'an, Jordan", cityDecoys: ["Wadi Rum, Jordan", "Jerash, Jordan", "Cairo, Egypt"], landmark: "Petra", lmDecoys: ["Palmyra", "Leptis Magna", "Jerash"], tier: "medium" },
  { id: "wadi_rum", wiki: "Wadi_Rum", answer: "Aqaba, Jordan", cityDecoys: ["Sinai, Egypt", "Atacama, Chile", "Monument Valley, USA"], landmark: "Wadi Rum", lmDecoys: ["Sahara Desert", "Namib Desert", "White Desert"], tier: "hard" },
  { id: "pyramids_giza", wiki: "Giza_pyramid_complex", answer: "Giza, Egypt", cityDecoys: ["Luxor, Egypt", "Saqqara, Egypt", "Dahshur, Egypt"], landmark: "Pyramids of Giza", lmDecoys: ["Pyramid of Djoser", "Red Pyramid", "Pyramid of Meidum"], tier: "easy" },
  { id: "valley_kings", wiki: "Valley_of_the_Kings", answer: "Luxor, Egypt", cityDecoys: ["Aswan, Egypt", "Cairo, Egypt", "Alexandria, Egypt"], landmark: "Valley of the Kings", lmDecoys: ["Valley of the Queens", "Karnak Temple", "Temple of Hatshepsut"], tier: "medium" },
  { id: "karnak", wiki: "Karnak", answer: "Luxor, Egypt", cityDecoys: ["Aswan, Egypt", "Cairo, Egypt", "Dendera, Egypt"], landmark: "Karnak Temple Complex", lmDecoys: ["Temple of Luxor", "Abu Simbel", "Edfu Temple"], tier: "hard" },
  { id: "abu_simbel", wiki: "Abu_Simbel", answer: "Aswan Governorate, Egypt", cityDecoys: ["Luxor, Egypt", "Khartoum, Sudan", "Cairo, Egypt"], landmark: "Abu Simbel", lmDecoys: ["Karnak Temple", "Temple of Philae", "Meroe Pyramids"], tier: "hard" },
  { id: "mount_kilimanjaro", wiki: "Mount_Kilimanjaro", answer: "Tanzania", cityDecoys: ["Kenya", "Rwanda", "Uganda"], landmark: "Mount Kilimanjaro", lmDecoys: ["Mount Kenya", "Mount Cameroon", "Mount Stanley"], tier: "medium" },
  { id: "serengeti", wiki: "Serengeti", answer: "Tanzania", cityDecoys: ["Kenya", "Botswana", "Zimbabwe"], landmark: "Serengeti National Park", lmDecoys: ["Maasai Mara", "Okavango Delta", "Chobe National Park"], tier: "medium" },
  { id: "victoria_falls", wiki: "Victoria_Falls", answer: "Livingstone, Zambia", cityDecoys: ["Harare, Zimbabwe", "Windhoek, Namibia", "Gaborone, Botswana"], landmark: "Victoria Falls", lmDecoys: ["Niagara Falls", "Iguazu Falls", "Angel Falls"], tier: "medium" },
  { id: "table_mountain", wiki: "Table_Mountain", answer: "Cape Town, South Africa", cityDecoys: ["Johannesburg, South Africa", "Durban, South Africa", "Nairobi, Kenya"], landmark: "Table Mountain", lmDecoys: ["Signal Hill", "Lion's Head", "Devil's Peak"], tier: "medium" },
  { id: "cape_of_hope", wiki: "Cape_of_Good_Hope", answer: "Western Cape, South Africa", cityDecoys: ["Namibia", "Cape Agulhas", "Cape Verde"], landmark: "Cape of Good Hope", lmDecoys: ["Cape Agulhas", "Cape Point", "Cape Hangklip"], tier: "hard" },
  { id: "sossusvlei", wiki: "Sossusvlei", answer: "Namib-Naukluft, Namibia", cityDecoys: ["Atacama, Chile", "Sahara, Algeria", "Danakil, Ethiopia"], landmark: "Sossusvlei", lmDecoys: ["Dead Vlei", "Deadvlei", "Skeleton Coast"], tier: "extreme" },
  { id: "iguazu", wiki: "Iguazu_Falls", answer: "Paraná, Brazil / Misiones, Argentina", cityDecoys: ["Niagara, Canada/USA", "Victoria Falls, Zambia/Zimbabwe", "Angel Falls, Venezuela"], landmark: "Iguazu Falls", lmDecoys: ["Victoria Falls", "Niagara Falls", "Angel Falls"], tier: "medium" },
  { id: "machu_picchu", wiki: "Machu_Picchu", answer: "Cusco Region, Peru", cityDecoys: ["La Paz, Bolivia", "Quito, Ecuador", "Santiago, Chile"], landmark: "Machu Picchu", lmDecoys: ["Chichen Itza", "Tikal", "Ciudad Perdida"], tier: "medium" },
  { id: "angel_falls", wiki: "Angel_Falls", answer: "Bolívar State, Venezuela", cityDecoys: ["Guyana", "Suriname", "Colombia"], landmark: "Angel Falls", lmDecoys: ["Iguazu Falls", "Victoria Falls", "Kaieteur Falls"], tier: "hard" },
  { id: "salar_uyuni", wiki: "Salar_de_Uyuni", answer: "Potosí, Bolivia", cityDecoys: ["Atacama, Chile", "Patagonia, Argentina", "Altiplano, Peru"], landmark: "Salar de Uyuni", lmDecoys: ["Salinas Grandes", "Lake Assal", "Bonneville Salt Flats"], tier: "hard" },
  { id: "atacama", wiki: "Atacama_Desert", answer: "Atacama, Chile", cityDecoys: ["Namib, Namibia", "Patagonia, Argentina", "Sonoran, Mexico"], landmark: "Atacama Desert", lmDecoys: ["Namib Desert", "Salar de Uyuni", "Altiplano"], tier: "hard" },
  { id: "easter_island", wiki: "Easter_Island", answer: "Easter Island, Chile", cityDecoys: ["Galapagos, Ecuador", "Pitcairn Island", "French Polynesia"], landmark: "Easter Island Moai", lmDecoys: ["Stonehenge", "Olmec heads", "Tonga stone trilithon"], tier: "medium" },
  { id: "patagonia", wiki: "Torres_del_Paine_National_Park", answer: "Patagonia, Chile", cityDecoys: ["Ushuaia, Argentina", "Bariloche, Argentina", "El Calafate, Argentina"], landmark: "Torres del Paine", lmDecoys: ["Fitz Roy", "Perito Moreno", "Los Glaciares"], tier: "hard" },
  { id: "galapagos", wiki: "Galápagos_Islands", answer: "Galápagos, Ecuador", cityDecoys: ["Fernando de Noronha, Brazil", "Cocos Island, Costa Rica", "Malpelo, Colombia"], landmark: "Galápagos Islands", lmDecoys: ["Fernando de Noronha", "Cocos Island", "Komodo Island"], tier: "medium" },
  { id: "glacier_np", wiki: "Glacier_National_Park_(U.S.)", answer: "Montana, USA", cityDecoys: ["Wyoming, USA", "Idaho, USA", "Alberta, Canada"], landmark: "Glacier National Park", lmDecoys: ["Yellowstone", "Rocky Mountain NP", "Banff NP"], tier: "hard" },
  { id: "antelope_canyon", wiki: "Antelope_Canyon", answer: "Arizona, USA", cityDecoys: ["Utah, USA", "Nevada, USA", "New Mexico, USA"], landmark: "Antelope Canyon", lmDecoys: ["Bryce Canyon", "Coyote Buttes", "Canyon de Chelly"], tier: "medium" },
  { id: "yellowstone", wiki: "Yellowstone_National_Park", answer: "Wyoming, USA", cityDecoys: ["Yellowstone, Montana", "Yellowstone, Idaho", "Glacier, Montana"], landmark: "Yellowstone National Park", lmDecoys: ["Grand Teton", "Glacier NP", "Rocky Mountain NP"], tier: "medium" },
  { id: "zion_canyon", wiki: "Zion_National_Park", answer: "Utah, USA", cityDecoys: ["Arizona, USA", "Nevada, USA", "Colorado, USA"], landmark: "Zion National Park", lmDecoys: ["Bryce Canyon", "Arches NP", "Canyonlands"], tier: "medium" },
  { id: "bryce_canyon", wiki: "Bryce_Canyon_National_Park", answer: "Utah, USA", cityDecoys: ["Arizona, USA", "Nevada, USA", "Colorado, USA"], landmark: "Bryce Canyon", lmDecoys: ["Zion Canyon", "Arches NP", "Grand Canyon"], tier: "hard" },
  { id: "arches_np", wiki: "Arches_National_Park", answer: "Utah, USA", cityDecoys: ["Arizona, USA", "Colorado, USA", "New Mexico, USA"], landmark: "Arches National Park", lmDecoys: ["Canyonlands", "Zion NP", "Bryce Canyon"], tier: "hard" },
  { id: "wave_arizona", wiki: "The_Wave,_Arizona", answer: "Arizona, USA", cityDecoys: ["Utah, USA", "Nevada, USA", "New Mexico, USA"], landmark: "The Wave", lmDecoys: ["Antelope Canyon", "Coyote Buttes", "Horseshoe Bend"], tier: "extreme" },
  { id: "statue_liberty", wiki: "Statue_of_Liberty", answer: "New York, USA", cityDecoys: ["Boston, USA", "Philadelphia, USA", "Washington D.C., USA"], landmark: "Statue of Liberty", lmDecoys: ["Statue of Freedom", "Christ the Redeemer", "Lady Justice"], tier: "easy" },
  { id: "times_square", wiki: "Times_Square", answer: "New York, USA", cityDecoys: ["Las Vegas, USA", "Chicago, USA", "Los Angeles, USA"], landmark: "Times Square", lmDecoys: ["Piccadilly Circus", "Shibuya Crossing", "Las Vegas Strip"], tier: "easy" },
  { id: "empire_state", wiki: "Empire_State_Building", answer: "New York, USA", cityDecoys: ["Chicago, USA", "Las Vegas, USA", "Miami, USA"], landmark: "Empire State Building", lmDecoys: ["One World Trade Center", "Chrysler Building", "Willis Tower"], tier: "easy" },
  { id: "golden_gate", wiki: "Golden_Gate_Bridge", answer: "San Francisco, USA", cityDecoys: ["Seattle, USA", "Portland, USA", "Los Angeles, USA"], landmark: "Golden Gate Bridge", lmDecoys: ["Bay Bridge", "Brooklyn Bridge", "Mackinac Bridge"], tier: "easy" },
  { id: "las_vegas_strip", wiki: "Las_Vegas_Strip", answer: "Las Vegas, USA", cityDecoys: ["Reno, USA", "Atlantic City, USA", "Macau, China"], landmark: "Las Vegas Strip", lmDecoys: ["Atlantic City Boardwalk", "Fremont Street", "Macau Cotai Strip"], tier: "easy" },
  { id: "niagara_falls", wiki: "Niagara_Falls", answer: "Ontario, Canada / New York, USA", cityDecoys: ["Montreal, Canada", "Toronto, Canada", "Buffalo, USA"], landmark: "Niagara Falls", lmDecoys: ["Victoria Falls", "Iguazu Falls", "Angel Falls"], tier: "easy" },
  { id: "banff", wiki: "Banff_National_Park", answer: "Alberta, Canada", cityDecoys: ["British Columbia, Canada", "Montana, USA", "Yukon, Canada"], landmark: "Banff National Park", lmDecoys: ["Jasper NP", "Glacier NP", "Kootenay NP"], tier: "medium" },
  { id: "north_lights", wiki: "Aurora_borealis", answer: "Northern Norway", cityDecoys: ["Iceland", "Northern Finland", "Northern Canada"], landmark: "Aurora Borealis", lmDecoys: ["Aurora Australis", "Noctilucent Clouds", "St Elmo's Fire"], tier: "medium" },
  { id: "lofoten", wiki: "Lofoten", answer: "Nordland, Norway", cityDecoys: ["Faroe Islands", "Iceland", "Northern Finland"], landmark: "Lofoten Islands", lmDecoys: ["Faroe Islands", "Senja Island", "Vesterålen"], tier: "hard" },
  { id: "preikestolen", wiki: "Preikestolen", answer: "Ryfylke, Norway", cityDecoys: ["Geiranger, Norway", "Bergen, Norway", "Ålesund, Norway"], landmark: "Preikestolen (Pulpit Rock)", lmDecoys: ["Trolltunga", "Kjeragbolten", "Nærøyfjord"], tier: "hard" },
  { id: "trolltunga", wiki: "Trolltunga", answer: "Hordaland, Norway", cityDecoys: ["Oppland, Norway", "Rogaland, Norway", "Sogne og Fjordane, Norway"], landmark: "Trolltunga", lmDecoys: ["Preikestolen", "Kjeragbolten", "Romsdalseggen"], tier: "hard" },
  { id: "thingvellir", wiki: "Þingvellir", answer: "Southwest Iceland", cityDecoys: ["Reykjavik, Iceland", "Northern Iceland", "East Iceland"], landmark: "Þingvellir National Park", lmDecoys: ["Geysir", "Gullfoss", "Seljalandsfoss"], tier: "extreme" },
  { id: "geysir", wiki: "Geysir", answer: "Haukadalur, Iceland", cityDecoys: ["Yellowstone, USA", "Kamchatka, Russia", "New Zealand"], landmark: "Geysir", lmDecoys: ["Old Faithful", "Strokkur", "Great Fountain Geyser"], tier: "hard" },
  { id: "hallgrimskirkja", wiki: "Hallgrímskirkja", answer: "Reykjavík, Iceland", cityDecoys: ["Akureyri, Iceland", "Vik, Iceland", "Selfoss, Iceland"], landmark: "Hallgrímskirkja", lmDecoys: ["Skálholt Cathedral", "Domkirkjan Cathedral", "Church of Christ"], tier: "extreme" },
  { id: "giant_causeway", wiki: "Giant's_Causeway", answer: "County Antrim, Northern Ireland", cityDecoys: ["Staffa, Scotland", "County Donegal, Ireland", "Cornwall, England"], landmark: "Giant's Causeway", lmDecoys: ["Fingal's Cave", "Benmore Organ Pipes", "Cliffs of Moher"], tier: "medium" },
  { id: "cliffs_moher", wiki: "Cliffs_of_Moher", answer: "County Clare, Ireland", cityDecoys: ["County Antrim, Northern Ireland", "Cornwall, England", "Brittany, France"], landmark: "Cliffs of Moher", lmDecoys: ["Giant's Causeway", "Slieve League", "Croaghaun"], tier: "medium" },
  { id: "blarney_castle", wiki: "Blarney_Castle", answer: "County Cork, Ireland", cityDecoys: ["Dublin, Ireland", "Galway, Ireland", "Kerry, Ireland"], landmark: "Blarney Castle", lmDecoys: ["Rock of Cashel", "Trim Castle", "Kilkenny Castle"], tier: "hard" },
  { id: "stonehenge2", wiki: "Stonehenge", answer: "Wiltshire, England", cityDecoys: ["Orkney, Scotland", "County Meath, Ireland", "Cornwall, England"], landmark: "Stonehenge", lmDecoys: ["Avebury", "Carnac Stones", "Newgrange"], tier: "easy" },
  { id: "windermere", wiki: "Lake_District", answer: "Cumbria, England", cityDecoys: ["Yorkshire Dales, England", "Peak District, England", "Snowdonia, Wales"], landmark: "Lake District", lmDecoys: ["Yorkshire Dales", "Cairngorms", "Brecon Beacons"], tier: "hard" },
  { id: "benmore_finger", wiki: "Ben_Nevis", answer: "Highland, Scotland", cityDecoys: ["Snowdonia, Wales", "Wicklow, Ireland", "Peak District, England"], landmark: "Ben Nevis", lmDecoys: ["Snowdon", "Scafell Pike", "Slieve Donard"], tier: "hard" },
  { id: "loch_ness", wiki: "Loch_Ness", answer: "Highland, Scotland", cityDecoys: ["Loch Lomond, Scotland", "Lake Windermere, England", "Lough Corrib, Ireland"], landmark: "Loch Ness", lmDecoys: ["Loch Lomond", "Loch Tay", "Loch Morar"], tier: "medium" },
  { id: "schoenbrunn", wiki: "Schönbrunn_Palace", answer: "Vienna, Austria", cityDecoys: ["Salzburg, Austria", "Budapest, Hungary", "Prague, Czechia"], landmark: "Schönbrunn Palace", lmDecoys: ["Belvedere Palace", "Hofburg Palace", "Palace of Versailles"], tier: "medium" },
  { id: "hallstatt", wiki: "Hallstatt", answer: "Upper Austria, Austria", cityDecoys: ["Berchtesgaden, Germany", "Lucerne, Switzerland", "Bled, Slovenia"], landmark: "Hallstatt", lmDecoys: ["Lake Bled", "Hallstatt Lake", "Alpsee"], tier: "hard" },
  { id: "bled", wiki: "Lake_Bled", answer: "Upper Carniola, Slovenia", cityDecoys: ["Hallstatt, Austria", "Lucerne, Switzerland", "Plitvice, Croatia"], landmark: "Lake Bled", lmDecoys: ["Lake Bohinj", "Lake Bled", "Plitvice Lakes"], tier: "hard" },
  { id: "neuschwanstein3", wiki: "Neuschwanstein_Castle", answer: "Bavaria, Germany", cityDecoys: ["Austria", "Switzerland", "Baden-Württemberg, Germany"], landmark: "Neuschwanstein Castle", lmDecoys: ["Hohenschwangau Castle", "Linderhof Palace", "Herrenchiemsee"], tier: "easy" },
  { id: "rothenburg", wiki: "Rothenburg_ob_der_Tauber", answer: "Bavaria, Germany", cityDecoys: ["Nuremberg, Germany", "Heidelberg, Germany", "Bamberg, Germany"], landmark: "Rothenburg ob der Tauber", lmDecoys: ["Bamberg", "Dinkelsbühl", "Nördlingen"], tier: "extreme" },
  { id: "berlin_wall", wiki: "Berlin_Wall", answer: "Berlin, Germany", cityDecoys: ["Potsdam, Germany", "Hamburg, Germany", "Dresden, Germany"], landmark: "Berlin Wall", lmDecoys: ["Checkpoint Charlie", "East Side Gallery", "Brandenburg Gate"], tier: "medium" },
  { id: "checkpoint_charlie", wiki: "Checkpoint_Charlie", answer: "Berlin, Germany", cityDecoys: ["Vienna, Austria", "Prague, Czechia", "Warsaw, Poland"], landmark: "Checkpoint Charlie", lmDecoys: ["Brandenburg Gate", "Berlin Wall", "Holocaust Memorial"], tier: "hard" },
  { id: "prague_castle", wiki: "Prague_Castle", answer: "Prague, Czechia", cityDecoys: ["Bratislava, Slovakia", "Vienna, Austria", "Kraków, Poland"], landmark: "Prague Castle", lmDecoys: ["Vyšehrad", "Karlštejn Castle", "Křivoklát Castle"], tier: "medium" },
  { id: "old_town_tallinn", wiki: "Tallinn_Old_Town", answer: "Tallinn, Estonia", cityDecoys: ["Riga, Latvia", "Vilnius, Lithuania", "Helsinki, Finland"], landmark: "Tallinn Old Town", lmDecoys: ["Riga Old Town", "Vilnius Old Town", "Warsaw Old Town"], tier: "hard" },
  { id: "krakow_main", wiki: "Main_Market_Square,_Kraków", answer: "Kraków, Poland", cityDecoys: ["Warsaw, Poland", "Wrocław, Poland", "Gdańsk, Poland"], landmark: "Kraków Main Market Square", lmDecoys: ["Warsaw Old Town", "Wrocław Market Square", "Prague Old Town Square"], tier: "hard" },
  { id: "auschwitz", wiki: "Auschwitz_concentration_camp", answer: "Oświęcim, Poland", cityDecoys: ["Kraków, Poland", "Warsaw, Poland", "Majdanek, Poland"], landmark: "Auschwitz-Birkenau", lmDecoys: ["Treblinka extermination camp", "Majdanek", "Sobibór"], tier: "medium" },
  { id: "red_square", wiki: "Red_Square", answer: "Moscow, Russia", cityDecoys: ["Saint Petersburg, Russia", "Kyiv, Ukraine", "Warsaw, Poland"], landmark: "Red Square", lmDecoys: ["Tiananmen Square", "Saint Peter's Square", "Trafalgar Square"], tier: "easy" },
  { id: "hermitage", wiki: "Hermitage_Museum", answer: "Saint Petersburg, Russia", cityDecoys: ["Moscow, Russia", "Vienna, Austria", "Amsterdam, Netherlands"], landmark: "Hermitage Museum", lmDecoys: ["Louvre", "Prado Museum", "Metropolitan Museum of Art"], tier: "medium" },
  { id: "peterhof", wiki: "Peterhof_Palace", answer: "Peterhof, Russia", cityDecoys: ["Saint Petersburg, Russia", "Stockholm, Sweden", "Copenhagen, Denmark"], landmark: "Peterhof Palace", lmDecoys: ["Palace of Versailles", "Schönbrunn Palace", "Sanssouci"], tier: "hard" },
  { id: "istanbul_bosphorus", wiki: "Bosphorus", answer: "Istanbul, Turkey", cityDecoys: ["Athens, Greece", "Thessaloniki, Greece", "Sofia, Bulgaria"], landmark: "Bosphorus Bridge", lmDecoys: ["Golden Gate Bridge", "Öresund Bridge", "Tower Bridge"], tier: "hard" },
  { id: "hagia_sophia", wiki: "Hagia_Sophia", answer: "Istanbul, Turkey", cityDecoys: ["Athens, Greece", "Cairo, Egypt", "Tehran, Iran"], landmark: "Hagia Sophia", lmDecoys: ["Blue Mosque", "Dome of the Rock", "Sheikh Zayed Mosque"], tier: "medium" },
  { id: "cappadocia2", wiki: "Cappadocia", answer: "Nevşehir, Turkey", cityDecoys: ["Meteora, Greece", "Pamukkale, Turkey", "Wadi Rum, Jordan"], landmark: "Cappadocia", lmDecoys: ["Pamukkale", "Meteora", "Bryce Canyon"], tier: "medium" },
  { id: "dome_rock", wiki: "Dome_of_the_Rock", answer: "Jerusalem", cityDecoys: ["Mecca, Saudi Arabia", "Medina, Saudi Arabia", "Cairo, Egypt"], landmark: "Dome of the Rock", lmDecoys: ["Al-Aqsa Mosque", "Western Wall", "Church of the Holy Sepulchre"], tier: "medium" },
  { id: "sheikh_zayed", wiki: "Sheikh_Zayed_Grand_Mosque", answer: "Abu Dhabi, UAE", cityDecoys: ["Dubai, UAE", "Doha, Qatar", "Manama, Bahrain"], landmark: "Sheikh Zayed Grand Mosque", lmDecoys: ["Blue Mosque", "Faisal Mosque", "Sultan Omar Ali Saifuddin Mosque"], tier: "medium" },
  { id: "burj_khalifa", wiki: "Burj_Khalifa", answer: "Dubai, UAE", cityDecoys: ["Abu Dhabi, UAE", "Doha, Qatar", "Manama, Bahrain"], landmark: "Burj Khalifa", lmDecoys: ["Petronas Towers", "CN Tower", "Shanghai Tower"], tier: "easy" },
  { id: "palm_dubai", wiki: "Palm_Islands", answer: "Dubai, UAE", cityDecoys: ["Abu Dhabi, UAE", "Doha, Qatar", "Muscat, Oman"], landmark: "Palm Jumeirah", lmDecoys: ["The World islands", "Nakheel", "Jumeirah"], tier: "medium" },
  { id: "chichen_itza2", wiki: "Chichen_Itza", answer: "Yucatán, Mexico", cityDecoys: ["Oaxaca, Mexico", "Chiapas, Mexico", "Campeche, Mexico"], landmark: "El Castillo (Chichen Itza)", lmDecoys: ["Tikal", "Uxmal", "Teotihuacan"], tier: "medium" },
  { id: "mexico_city", wiki: "Zócalo", answer: "Mexico City, Mexico", cityDecoys: ["Guadalajara, Mexico", "Monterrey, Mexico", "Puebla, Mexico"], landmark: "Zócalo", lmDecoys: ["Plaza Mayor", "Tiananmen Square", "Red Square"], tier: "hard" },
  { id: "havana", wiki: "Old_Havana", answer: "Havana, Cuba", cityDecoys: ["Santo Domingo, Dominican Republic", "San Juan, Puerto Rico", "Kingston, Jamaica"], landmark: "Old Havana", lmDecoys: ["Cartagena Old Town", "Old San Juan", "Santo Domingo Colonial Zone"], tier: "hard" },
  { id: "cartagena", wiki: "Cartagena,_Colombia", answer: "Cartagena, Colombia", cityDecoys: ["Barranquilla, Colombia", "Santa Marta, Colombia", "Havana, Cuba"], landmark: "Cartagena Old City", lmDecoys: ["Old Havana", "Old San Juan", "Casco Viejo Panama"], tier: "hard" },
  { id: "rio_carnival", wiki: "Christ_the_Redeemer_(statue)", answer: "Rio de Janeiro, Brazil", cityDecoys: ["São Paulo, Brazil", "Belo Horizonte, Brazil", "Salvador, Brazil"], landmark: "Christ the Redeemer", lmDecoys: ["Statue of Liberty", "Statue of Unity", "Cristo de la Concordia"], tier: "easy" },
  { id: "sugarloaf", wiki: "Sugarloaf_Mountain", answer: "Rio de Janeiro, Brazil", cityDecoys: ["São Paulo, Brazil", "Salvador, Brazil", "Buenos Aires, Argentina"], landmark: "Sugarloaf Mountain", lmDecoys: ["Table Mountain", "Corcovado", "Pão de Açúcar"], tier: "hard" },
  { id: "colca_canyon", wiki: "Colca_Canyon", answer: "Arequipa, Peru", cityDecoys: ["Cusco, Peru", "Bolivia", "Ecuador"], landmark: "Colca Canyon", lmDecoys: ["Grand Canyon", "Cotahuasi Canyon", "Tiger Leaping Gorge"], tier: "extreme" },
  { id: "lake_titicaca", wiki: "Lake_Titicaca", answer: "Peru / Bolivia", cityDecoys: ["Ecuador", "Colombia", "Chile"], landmark: "Lake Titicaca", lmDecoys: ["Lake Baikal", "Lake Malawi", "Caspian Sea"], tier: "medium" },
  { id: "buenos_aires_obelisk", wiki: "Obelisco_de_Buenos_Aires", answer: "Buenos Aires, Argentina", cityDecoys: ["Montevideo, Uruguay", "Santiago, Chile", "Lima, Peru"], landmark: "Obelisco de Buenos Aires", lmDecoys: ["Washington Monument", "Place de la Concorde obelisk", "Luxor Obelisk"], tier: "hard" },
  { id: "perito_moreno", wiki: "Perito_Moreno_Glacier", answer: "Patagonia, Argentina", cityDecoys: ["Alaska, USA", "Iceland", "Greenland"], landmark: "Perito Moreno Glacier", lmDecoys: ["Athabasca Glacier", "Franz Josef Glacier", "Glacier Bay"], tier: "hard" },
  { id: "marrakech", wiki: "Djemaa_el-Fna", answer: "Marrakech, Morocco", cityDecoys: ["Fez, Morocco", "Casablanca, Morocco", "Tunis, Tunisia"], landmark: "Djemaa el-Fna", lmDecoys: ["Place Jemaa el-Fnaa", "Grand Socco", "Medina of Fez"], tier: "hard" },
  { id: "chefchaouen", wiki: "Chefchaouen", answer: "Chefchaouen, Morocco", cityDecoys: ["Fez, Morocco", "Tangier, Morocco", "Essaouira, Morocco"], landmark: "Chefchaouen", lmDecoys: ["Jodhpur", "Santorini", "Óbidos"], tier: "hard" },
  { id: "lalibela", wiki: "Lalibela", answer: "Amhara, Ethiopia", cityDecoys: ["Gondar, Ethiopia", "Axum, Ethiopia", "Addis Ababa, Ethiopia"], landmark: "Lalibela Rock-hewn Churches", lmDecoys: ["Axum", "Gondar Castles", "Tiya Stelae"], tier: "extreme" },
  { id: "zanzibar", wiki: "Stone_Town", answer: "Stone Town, Zanzibar", cityDecoys: ["Mombasa, Kenya", "Dar es Salaam, Tanzania", "Pemba, Tanzania"], landmark: "Stone Town", lmDecoys: ["Lamu Old Town", "Fort Jesus", "Kilwa Kisiwani"], tier: "extreme" },
  { id: "okavango", wiki: "Okavango_Delta", answer: "Ngamiland, Botswana", cityDecoys: ["Maun, Botswana", "Windhoek, Namibia", "Harare, Zimbabwe"], landmark: "Okavango Delta", lmDecoys: ["Sudd", "Amazon River delta", "Nile Delta"], tier: "extreme" },
  // ── Batch 3: Additional 60+ entries to reach 300 ──────────────────────────
  { id: "knossos", wiki: "Knossos", answer: "Crete, Greece", cityDecoys: ["Santorini, Greece", "Rhodes, Greece", "Corfu, Greece"], landmark: "Palace of Knossos", lmDecoys: ["Akrotiri", "Phaistos", "Palace of Zakros"], tier: "extreme" },
  { id: "olympia", wiki: "Olympia,_Greece", answer: "Elis, Greece", cityDecoys: ["Athens, Greece", "Delphi, Greece", "Corinth, Greece"], landmark: "Ancient Olympia", lmDecoys: ["Ancient Delphi", "Epidaurus", "Corinth"], tier: "hard" },
  { id: "delphi", wiki: "Delphi", answer: "Phocis, Greece", cityDecoys: ["Athens, Greece", "Olympia, Greece", "Corinth, Greece"], landmark: "Ancient Delphi", lmDecoys: ["Ancient Olympia", "Epidaurus", "Mycenae"], tier: "hard" },
  { id: "ephesus", wiki: "Ephesus", answer: "İzmir, Turkey", cityDecoys: ["Antalya, Turkey", "Bodrum, Turkey", "Izmir, Turkey"], landmark: "Ancient Ephesus", lmDecoys: ["Pergamon", "Hierapolis", "Miletus"], tier: "hard" },
  { id: "hierapolis", wiki: "Hierapolis", answer: "Denizli, Turkey", cityDecoys: ["Antalya, Turkey", "Ephesus, Turkey", "Aphrodisias, Turkey"], landmark: "Hierapolis", lmDecoys: ["Ephesus", "Aphrodisias", "Priene"], tier: "extreme" },
  { id: "mount_athos", wiki: "Mount_Athos", answer: "Chalkidiki, Greece", cityDecoys: ["Thessaloniki, Greece", "Mount Olympus, Greece", "Pelion, Greece"], landmark: "Mount Athos", lmDecoys: ["Meteora", "Mount Olympus", "Zagori"], tier: "extreme" },
  { id: "meteora2", wiki: "Meteora", answer: "Thessaly, Greece", cityDecoys: ["Epirus, Greece", "Cappadocia, Turkey", "Hoodoos, USA"], landmark: "Meteora", lmDecoys: ["Mount Athos", "Cappadocia", "Sümela Monastery"], tier: "hard" },
  { id: "colmar", wiki: "Colmar", answer: "Alsace, France", cityDecoys: ["Strasbourg, France", "Mulhouse, France", "Basel, Switzerland"], landmark: "Colmar", lmDecoys: ["Strasbourg", "Eguisheim", "Riquewihr"], tier: "extreme" },
  { id: "mont_st_michel", wiki: "Mont-Saint-Michel", answer: "Normandy, France", cityDecoys: ["Brittany, France", "Cornwall, England", "Saint Malo, France"], landmark: "Mont-Saint-Michel", lmDecoys: ["St Michael's Mount", "Rocamadour", "Le Puy-en-Velay"], tier: "medium" },
  { id: "chateau_de_chambord", wiki: "Château_de_Chambord", answer: "Loire Valley, France", cityDecoys: ["Bordeaux, France", "Tours, France", "Blois, France"], landmark: "Château de Chambord", lmDecoys: ["Château de Chenonceau", "Château de Cheverny", "Château d'Azay-le-Rideau"], tier: "hard" },
  { id: "chenonceau", wiki: "Château_de_Chenonceau", answer: "Loire Valley, France", cityDecoys: ["Paris, France", "Blois, France", "Amboise, France"], landmark: "Château de Chenonceau", lmDecoys: ["Château de Chambord", "Château de Villandry", "Château de Cheverny"], tier: "extreme" },
  { id: "carcassonne", wiki: "Carcassonne", answer: "Aude, France", cityDecoys: ["Nîmes, France", "Montpellier, France", "Avignon, France"], landmark: "Carcassonne", lmDecoys: ["Avignon Ramparts", "Aigues-Mortes", "Provins"], tier: "hard" },
  { id: "avignon_bridge", wiki: "Pont_Saint-Bénézet", answer: "Avignon, France", cityDecoys: ["Lyon, France", "Nîmes, France", "Montpellier, France"], landmark: "Pont d'Avignon", lmDecoys: ["Pont du Gard", "Pont de Valentré", "Vieux Pont Entrevaux"], tier: "extreme" },
  { id: "mont_blanc", wiki: "Mont_Blanc", answer: "Chamonix, France/Italy", cityDecoys: ["Matterhorn, Switzerland", "Jungfrau, Switzerland", "Monte Rosa, Switzerland"], landmark: "Mont Blanc", lmDecoys: ["Matterhorn", "Eiger", "Monte Rosa"], tier: "medium" },
  { id: "cinque_terre", wiki: "Cinque_Terre", answer: "Liguria, Italy", cityDecoys: ["Amalfi Coast, Italy", "Positano, Italy", "Portofino, Italy"], landmark: "Cinque Terre", lmDecoys: ["Amalfi Coast", "Portofino", "Manarola"], tier: "medium" },
  { id: "amalfi_coast", wiki: "Amalfi_Coast", answer: "Campania, Italy", cityDecoys: ["Cinque Terre, Italy", "Sardinia, Italy", "Sorrento, Italy"], landmark: "Amalfi Coast", lmDecoys: ["Cinque Terre", "Costiera Cilentana", "Capo Vaticano"], tier: "medium" },
  { id: "positano", wiki: "Positano", answer: "Campania, Italy", cityDecoys: ["Amalfi, Italy", "Ravello, Italy", "Sorrento, Italy"], landmark: "Positano", lmDecoys: ["Manarola", "Riomaggiore", "Vernazza"], tier: "hard" },
  { id: "dolomites", wiki: "Dolomites", answer: "South Tyrol, Italy", cityDecoys: ["Austrian Alps", "Swiss Alps", "Tatra Mountains, Poland"], landmark: "Dolomites", lmDecoys: ["Austrian Alps", "Bernese Alps", "Pyrenees"], tier: "medium" },
  { id: "milan_cathedral", wiki: "Milan_Cathedral", answer: "Milan, Italy", cityDecoys: ["Turin, Italy", "Bologna, Italy", "Genoa, Italy"], landmark: "Milan Cathedral (Duomo)", lmDecoys: ["Florence Cathedral", "Cologne Cathedral", "Sagrada Família"], tier: "medium" },
  { id: "piazza_navona", wiki: "Piazza_Navona", answer: "Rome, Italy", cityDecoys: ["Florence, Italy", "Naples, Italy", "Venice, Italy"], landmark: "Piazza Navona", lmDecoys: ["Piazza di Spagna", "Piazza Venezia", "Campo de' Fiori"], tier: "hard" },
  { id: "palermo", wiki: "Palermo_Cathedral", answer: "Palermo, Sicily", cityDecoys: ["Catania, Sicily", "Syracuse, Sicily", "Agrigento, Sicily"], landmark: "Palermo Cathedral", lmDecoys: ["Monreale Cathedral", "Cefalù Cathedral", "Agrigento Temples"], tier: "extreme" },
  { id: "agrigento", wiki: "Valley_of_the_Temples", answer: "Agrigento, Sicily", cityDecoys: ["Paestum, Italy", "Syracuse, Sicily", "Selinunte, Sicily"], landmark: "Valley of the Temples", lmDecoys: ["Paestum", "Selinunte", "Segesta"], tier: "hard" },
  { id: "kotor", wiki: "Kotor", answer: "Kotor, Montenegro", cityDecoys: ["Dubrovnik, Croatia", "Split, Croatia", "Budva, Montenegro"], landmark: "Kotor Old Town", lmDecoys: ["Dubrovnik Old Town", "Budva Old Town", "Perast"], tier: "hard" },
  { id: "budapest_parliament", wiki: "Hungarian_Parliament_Building", answer: "Budapest, Hungary", cityDecoys: ["Vienna, Austria", "Prague, Czechia", "Warsaw, Poland"], landmark: "Hungarian Parliament Building", lmDecoys: ["Westminster Palace", "Vienna State Opera", "Berlin Reichstag"], tier: "medium" },
  { id: "buda_castle", wiki: "Buda_Castle", answer: "Budapest, Hungary", cityDecoys: ["Vienna, Austria", "Prague, Czechia", "Bratislava, Slovakia"], landmark: "Buda Castle", lmDecoys: ["Prague Castle", "Vienna Hofburg", "Bratislava Castle"], tier: "hard" },
  { id: "szechenyi_bath", wiki: "Széchenyi_thermal_bath", answer: "Budapest, Hungary", cityDecoys: ["Vienna, Austria", "Baden-Baden, Germany", "Karlovy Vary, Czechia"], landmark: "Széchenyi Thermal Bath", lmDecoys: ["Gellért Thermal Bath", "Rudas Baths", "Lukács Thermal Bath"], tier: "extreme" },
  { id: "monastiraki", wiki: "Monastiraki", answer: "Athens, Greece", cityDecoys: ["Thessaloniki, Greece", "Istanbul, Turkey", "Rome, Italy"], landmark: "Monastiraki Square", lmDecoys: ["Syntagma Square", "Omonia Square", "Grand Bazaar"], tier: "extreme" },
  { id: "mykonos", wiki: "Mykonos", answer: "Mykonos, Greece", cityDecoys: ["Santorini, Greece", "Naxos, Greece", "Paros, Greece"], landmark: "Mykonos Town", lmDecoys: ["Santorini", "Ios", "Skiathos"], tier: "medium" },
  { id: "corfu_town", wiki: "Corfu_town", answer: "Corfu, Greece", cityDecoys: ["Kefalonia, Greece", "Lefkada, Greece", "Zakynthos, Greece"], landmark: "Corfu Old Town", lmDecoys: ["Paxos", "Ithaca", "Lefkada"], tier: "extreme" },
  { id: "mount_olympus", wiki: "Mount_Olympus", answer: "Thessaly, Greece", cityDecoys: ["Mount Parnassus, Greece", "Mount Ida, Crete", "Mount Athos, Greece"], landmark: "Mount Olympus", lmDecoys: ["Mount Parnassus", "Mount Taygetos", "Mount Athos"], tier: "hard" },
  { id: "marrakech_medina", wiki: "Medina_of_Marrakesh", answer: "Marrakech, Morocco", cityDecoys: ["Fez, Morocco", "Casablanca, Morocco", "Tunis, Tunisia"], landmark: "Marrakech Medina", lmDecoys: ["Medina of Fez", "Medina of Tunis", "Grand Socco Tangier"], tier: "hard" },
  { id: "sahara_dunes", wiki: "Erg_Chebbi", answer: "Merzouga, Morocco", cityDecoys: ["Sossusvlei, Namibia", "Sahara, Algeria", "Rub al-Khali, Saudi Arabia"], landmark: "Erg Chebbi Sand Dunes", lmDecoys: ["Sossusvlei", "Wahiba Sands", "Erg Iguidi"], tier: "hard" },
  { id: "volubilis", wiki: "Volubilis", answer: "Meknes, Morocco", cityDecoys: ["Carthage, Tunisia", "Leptis Magna, Libya", "Timgad, Algeria"], landmark: "Volubilis", lmDecoys: ["Timgad", "Dougga", "Leptis Magna"], tier: "extreme" },
  { id: "carthage", wiki: "Carthage", answer: "Tunis, Tunisia", cityDecoys: ["Tripoli, Libya", "Algiers, Algeria", "Casablanca, Morocco"], landmark: "Ruins of Carthage", lmDecoys: ["Volubilis", "Timgad", "Dougga"], tier: "extreme" },
  { id: "namib_desert", wiki: "Namib", answer: "Namib Desert, Namibia", cityDecoys: ["Kalahari, Botswana", "Sahara, Algeria", "Atacama, Chile"], landmark: "Namib Desert", lmDecoys: ["Kalahari", "Sahara", "Sonoran Desert"], tier: "hard" },
  { id: "bwindi", wiki: "Bwindi_Impenetrable_Forest", answer: "Southwestern Uganda", cityDecoys: ["Rwanda", "Congo", "Kenya"], landmark: "Bwindi Impenetrable Forest", lmDecoys: ["Volcanoes NP", "Nyungwe Forest", "Kibale Forest"], tier: "extreme" },
  { id: "virunga", wiki: "Virunga_Mountains", answer: "Rwanda/Congo/Uganda", cityDecoys: ["Tanzania", "Burundi", "Ethiopia"], landmark: "Virunga Mountains", lmDecoys: ["Ruwenzori Mountains", "Aberdare Range", "Drakensberg"], tier: "extreme" },
  { id: "dubai_frame", wiki: "Dubai_Frame", answer: "Dubai, UAE", cityDecoys: ["Abu Dhabi, UAE", "Doha, Qatar", "Manama, Bahrain"], landmark: "Dubai Frame", lmDecoys: ["Burj Khalifa", "Emirates Towers", "Cayan Tower"], tier: "hard" },
  { id: "mecca", wiki: "Masjid_al-Haram", answer: "Mecca, Saudi Arabia", cityDecoys: ["Medina, Saudi Arabia", "Jeddah, Saudi Arabia", "Riyadh, Saudi Arabia"], landmark: "Masjid al-Haram", lmDecoys: ["Masjid an-Nabawi", "Al-Aqsa Mosque", "Badshahi Mosque"], tier: "medium" },
  { id: "jerusalem_walls", wiki: "Jerusalem", answer: "Jerusalem", cityDecoys: ["Tel Aviv, Israel", "Bethlehem, Palestine", "Jericho, Palestine"], landmark: "Old City of Jerusalem", lmDecoys: ["Bethlehem", "Jericho", "Hebron"], tier: "medium" },
  { id: "palmyra", wiki: "Palmyra", answer: "Homs Governorate, Syria", cityDecoys: ["Bosra, Syria", "Apamea, Syria", "Petra, Jordan"], landmark: "Ancient Palmyra", lmDecoys: ["Petra", "Leptis Magna", "Jerash"], tier: "extreme" },
  { id: "persepolis2", wiki: "Persepolis", answer: "Fars Province, Iran", cityDecoys: ["Isfahan, Iran", "Shiraz, Iran", "Tehran, Iran"], landmark: "Persepolis", lmDecoys: ["Naqsh-e Rostam", "Pasargadae", "Susa"], tier: "extreme" },
  { id: "isfahan", wiki: "Naghsh-e_Jahan_Square", answer: "Isfahan, Iran", cityDecoys: ["Tehran, Iran", "Shiraz, Iran", "Mashhad, Iran"], landmark: "Naghsh-e Jahan Square", lmDecoys: ["Imam Ali Square", "Blue Mosque", "Sultan Qaboos Mosque"], tier: "hard" },
  { id: "khajuraho", wiki: "Khajuraho_Group_of_Monuments", answer: "Madhya Pradesh, India", cityDecoys: ["Rajasthan, India", "Uttar Pradesh, India", "Odisha, India"], landmark: "Khajuraho Temples", lmDecoys: ["Ajanta Caves", "Ellora Caves", "Konark Sun Temple"], tier: "extreme" },
  { id: "ajanta", wiki: "Ajanta_Caves", answer: "Maharashtra, India", cityDecoys: ["Madhya Pradesh, India", "Karnataka, India", "Rajasthan, India"], landmark: "Ajanta Caves", lmDecoys: ["Ellora Caves", "Elephanta Caves", "Bhimbetka"], tier: "extreme" },
  { id: "varanasi", wiki: "Varanasi", answer: "Uttar Pradesh, India", cityDecoys: ["Ayodhya, India", "Mathura, India", "Allahabad, India"], landmark: "Varanasi Ghats", lmDecoys: ["Haridwar Ghats", "Prayagraj Ghats", "Nashik Ghats"], tier: "hard" },
  { id: "mysore_palace", wiki: "Mysore_Palace", answer: "Mysore, India", cityDecoys: ["Jaipur, India", "Udaipur, India", "Hyderabad, India"], landmark: "Mysore Palace", lmDecoys: ["Jal Mahal", "City Palace Jaipur", "Umaid Bhawan"], tier: "hard" },
  { id: "meenakshi", wiki: "Meenakshi_Amman_Temple", answer: "Madurai, India", cityDecoys: ["Chennai, India", "Bangalore, India", "Thanjavur, India"], landmark: "Meenakshi Amman Temple", lmDecoys: ["Brihadeeswarar Temple", "Rameshwaram Temple", "Nataraja Temple"], tier: "extreme" },
  { id: "yangon_shwedagon", wiki: "Shwedagon_Pagoda", answer: "Yangon, Myanmar", cityDecoys: ["Mandalay, Myanmar", "Bagan, Myanmar", "Naypyidaw, Myanmar"], landmark: "Shwedagon Pagoda", lmDecoys: ["Wat Phra Kaew", "Temple of the Tooth", "Naung Daw Gyi Mya Tha Lyaung"], tier: "hard" },
  { id: "luang_prabang", wiki: "Luang_Prabang", answer: "Luang Prabang, Laos", cityDecoys: ["Vientiane, Laos", "Chiang Mai, Thailand", "Siem Reap, Cambodia"], landmark: "Luang Prabang", lmDecoys: ["Vientiane", "Plain of Jars", "Vang Vieng"], tier: "hard" },
  { id: "shwezigon", wiki: "Shwezigon_Pagoda", answer: "Bagan, Myanmar", cityDecoys: ["Mandalay, Myanmar", "Yangon, Myanmar", "Pagan, Sri Lanka"], landmark: "Shwezigon Pagoda", lmDecoys: ["Shwedagon Pagoda", "Sulamani Temple", "Htilominlo Temple"], tier: "extreme" },
  { id: "wat_phra_kaew", wiki: "Temple_of_the_Emerald_Buddha", answer: "Bangkok, Thailand", cityDecoys: ["Chiang Mai, Thailand", "Ayutthaya, Thailand", "Sukhothai, Thailand"], landmark: "Temple of the Emerald Buddha", lmDecoys: ["Wat Arun", "Wat Pho", "Wat Mahathat"], tier: "medium" },
  { id: "uluwatu", wiki: "Pura_Luhur_Uluwatu", answer: "Bali, Indonesia", cityDecoys: ["Lombok, Indonesia", "Nusa Penida, Indonesia", "Gili Islands, Indonesia"], landmark: "Uluwatu Temple", lmDecoys: ["Tanah Lot", "Pura Besakih", "Pura Lempuyang"], tier: "hard" },
  { id: "komodo", wiki: "Komodo_National_Park", answer: "East Nusa Tenggara, Indonesia", cityDecoys: ["Rinca, Indonesia", "Flores, Indonesia", "Lombok, Indonesia"], landmark: "Komodo National Park", lmDecoys: ["Galápagos Islands", "Raja Ampat", "Bunaken Marine Park"], tier: "hard" },
  { id: "raja_ampat", wiki: "Raja_Ampat_Islands", answer: "West Papua, Indonesia", cityDecoys: ["Sulawesi, Indonesia", "Komodo, Indonesia", "Palawan, Philippines"], landmark: "Raja Ampat Islands", lmDecoys: ["Palawan", "Komodo", "Togean Islands"], tier: "extreme" },
  { id: "palawan", wiki: "Palawan", answer: "Palawan, Philippines", cityDecoys: ["Coron, Philippines", "Boracay, Philippines", "Cebu, Philippines"], landmark: "Palawan Underground River", lmDecoys: ["Ha Long Bay", "Phang Nga Bay", "Komodo"], tier: "medium" },
  { id: "chocolate_hills", wiki: "Chocolate_Hills", answer: "Bohol, Philippines", cityDecoys: ["Cebu, Philippines", "Mindanao, Philippines", "Leyte, Philippines"], landmark: "Chocolate Hills", lmDecoys: ["Taal Volcano", "Mayon Volcano", "Pinatubo"], tier: "hard" },
  { id: "mount_bromo", wiki: "Mount_Bromo", answer: "East Java, Indonesia", cityDecoys: ["Central Java, Indonesia", "Bali, Indonesia", "Lombok, Indonesia"], landmark: "Mount Bromo", lmDecoys: ["Mount Merapi", "Mount Semeru", "Mount Rinjani"], tier: "hard" },
  { id: "banaue", wiki: "Banaue_Rice_Terraces", answer: "Ifugao, Philippines", cityDecoys: ["Batad, Philippines", "Sagada, Philippines", "Benguet, Philippines"], landmark: "Banaue Rice Terraces", lmDecoys: ["Tegallalang Rice Terrace", "Yuanyang Rice Terraces", "Longsheng Rice Terraces"], tier: "extreme" },
  { id: "guilin_karst", wiki: "Guilin", answer: "Guilin, China", cityDecoys: ["Zhangjiajie, China", "Yangshuo, China", "Guizhou, China"], landmark: "Guilin Karst Mountains", lmDecoys: ["Ha Long Bay", "Phang Nga Bay", "Zhangjiajie"], tier: "hard" },
  { id: "zhangjiajie2", wiki: "Zhangjiajie_National_Forest_Park", answer: "Hunan, China", cityDecoys: ["Guilin, China", "Guizhou, China", "Chongqing, China"], landmark: "Zhangjiajie Avatar Mountains", lmDecoys: ["Guilin Karsts", "Huangshan", "Lushan"], tier: "hard" },
  { id: "jiuzhaigou", wiki: "Jiuzhaigou", answer: "Sichuan, China", cityDecoys: ["Yunnan, China", "Guizhou, China", "Gansu, China"], landmark: "Jiuzhaigou Valley", lmDecoys: ["Plitvice Lakes", "Huanglong", "Longsheng"], tier: "extreme" },
  { id: "huangshan", wiki: "Huangshan", answer: "Anhui, China", cityDecoys: ["Guilin, China", "Zhangjiajie, China", "Sichuan, China"], landmark: "Huangshan (Yellow Mountain)", lmDecoys: ["Taishan", "Emei Shan", "Wuyi Mountains"], tier: "hard" },
  { id: "the_bund", wiki: "The_Bund", answer: "Shanghai, China", cityDecoys: ["Hong Kong", "Guangzhou, China", "Nanjing, China"], landmark: "The Bund", lmDecoys: ["Victoria Harbour", "Yokohama Harbor", "Marina Bay"], tier: "medium" },
];

// Use the MediaWiki pageimages API (not the REST summary): it returns a pre-rendered, guaranteed-valid
// thumbnail URL near the requested size. Arbitrary upload.wikimedia.org thumb widths 400 unpredictably
// because only certain bucket sizes are allowed per file. `redirects=1` resolves title redirects.
async function fetchImageUrl(wiki) {
  const api =
    `https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1` +
    `&prop=pageimages&piprop=thumbnail&pithumbsize=1024&titles=${encodeURIComponent(wiki)}`;
  const res = await fetch(api, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`api ${res.status}`);
  const j = await res.json();
  const pages = j.query?.pages ?? {};
  const page = pages[Object.keys(pages)[0]];
  const src = page?.thumbnail?.source;
  if (!src) throw new Error("no thumbnail");
  return src;
}

async function download(url, dest) {
  // Wikimedia rate-limits bursts (429). Retry with backoff so a fast loop doesn't drop entries.
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`img ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
    return;
  }
  throw new Error("img 429 (rate-limited after retries)");
}

function isValidImage(path) {
  if (!existsSync(path)) return false;
  if (statSync(path).size < 8000) return false; // reject tiny/error bodies
  const buf = readFileSync(path).subarray(0, 4);
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  return jpeg || png;
}

async function main() {
  const geo = JSON.parse(readFileSync(GEO_JSON, "utf8"));
  const landmarks = JSON.parse(readFileSync(LM_JSON, "utf8"));
  const geoIds = new Set(geo.map((e) => e.id));
  const lmById = new Map(landmarks.map((l) => [l.id, l]));

  // 1) Tier the existing entries (in place).
  for (const e of geo) e.tier = EXISTING_TIERS[e.id] ?? e.tier ?? "medium";
  for (const l of landmarks) l.tier = EXISTING_TIERS[l.id] ?? l.tier ?? "medium";

  // 2) Fetch + append the new entries.
  const added = [];
  const failed = [];
  for (const n of NEW) {
    if (geoIds.has(n.id)) { console.log(`skip (exists): ${n.id}`); continue; }
    const dest = join(IMG_DIR, `${n.id}.jpg`);
    try {
      const url = await fetchImageUrl(n.wiki);
      await download(url, dest);
      if (!isValidImage(dest)) throw new Error("invalid image body");
      geo.push({
        id: n.id, answer: n.answer, decoys: n.cityDecoys,
        image: `/geo/${n.id}.jpg`, source: url, tier: n.tier,
      });
      if (!lmById.has(n.id)) {
        landmarks.push({ id: n.id, landmark: n.landmark, decoys: n.lmDecoys, tier: n.tier });
      }
      added.push(n.id);
      console.log(`ok: ${n.id}  (${n.tier})`);
    } catch (err) {
      failed.push(`${n.id}: ${err.message}`);
      console.log(`FAIL: ${n.id} -> ${err.message}`);
    }
    await sleep(400); // be polite to Wikimedia; avoids 429 bursts
  }

  writeFileSync(GEO_JSON, JSON.stringify(geo, null, 2) + "\n");
  writeFileSync(LM_JSON, JSON.stringify(landmarks, null, 2) + "\n");

  console.log(`\nAdded ${added.length} new locations. geo.json now ${geo.length}, landmarks ${landmarks.length}.`);
  if (failed.length) console.log(`Failed (${failed.length}):\n  ${failed.join("\n  ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
