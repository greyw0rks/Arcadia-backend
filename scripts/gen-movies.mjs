// Generates the movie quiz dataset using Wikipedia REST API to get poster/still thumbnails.
// Downloads images into public/movies/ and writes data/movies.json.
// Idempotent: skips entries already downloaded.
// Run from arcadia-backend: node scripts/gen-movies.mjs
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "ArcadiaGame/1.0 (https://github.com/greyw0rks/arcadia; quiz@arcadia.game)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 310 famous movies: [id, wikipedia_title, answer, decoys, tier]
const MOVIES = [
  // ── All-time classics (easy) ────────────────────────────────────────────────
  ["godfather",       "The_Godfather",                 "The Godfather",              ["Goodfellas","Scarface","The Departed"],                        "easy"],
  ["matrix",          "The_Matrix",                    "The Matrix",                 ["Inception","Blade Runner","Tron"],                             "easy"],
  ["pulpfiction",     "Pulp_Fiction",                  "Pulp Fiction",               ["Reservoir Dogs","Kill Bill","Goodfellas"],                     "easy"],
  ["jurassicpark",    "Jurassic_Park_(film)",          "Jurassic Park",              ["Godzilla","The Lost World","Jaws"],                            "easy"],
  ["starwars",        "Star_Wars_(film)",              "Star Wars",                  ["Star Trek","Dune","The Empire Strikes Back"],                  "easy"],
  ["titanic",         "Titanic_(1997_film)",           "Titanic",                    ["Poseidon","The Abyss","Deepwater Horizon"],                    "easy"],
  ["forrest_gump",    "Forrest_Gump",                  "Forrest Gump",               ["Cast Away","The Terminal","Philadelphia"],                     "easy"],
  ["dark_knight",     "The_Dark_Knight",               "The Dark Knight",            ["Batman Begins","Batman v Superman","The Dark Knight Rises"],   "easy"],
  ["avengers_end",    "Avengers:_Endgame",             "Avengers: Endgame",          ["Avengers: Infinity War","Captain America","Thor"],             "easy"],
  ["avatar",          "Avatar_(2009_film)",            "Avatar",                     ["Dune","Interstellar","Gravity"],                               "easy"],
  ["jaws",            "Jaws_(film)",                   "Jaws",                       ["The Shallows","Deep Blue Sea","Piranha"],                      "easy"],
  ["et",              "E.T._the_Extra-Terrestrial",    "E.T. the Extra-Terrestrial", ["Close Encounters","Alien","The Day the Earth Stood Still"],    "easy"],
  ["lion_king",       "The_Lion_King",                 "The Lion King",              ["Bambi","Jungle Book","Tarzan"],                                "easy"],
  ["toy_story",       "Toy_Story",                     "Toy Story",                  ["A Bug's Life","Antz","Small Soldiers"],                        "easy"],
  ["shrek",           "Shrek_(film)",                  "Shrek",                      ["Antz","Bee Movie","Shark Tale"],                               "easy"],
  ["frozen",          "Frozen_(2013_film)",            "Frozen",                     ["Brave","Tangled","Moana"],                                     "easy"],
  ["harry_potter",    "Harry_Potter_and_the_Philosopher's_Stone_(film)", "Harry Potter and the Philosopher's Stone", ["The Chronicles of Narnia","Eragon","The Spiderwick Chronicles"], "easy"],
  ["hunger_games",    "The_Hunger_Games_(film)",       "The Hunger Games",           ["Divergent","The Maze Runner","Ender's Game"],                  "easy"],
  ["inception",       "Inception",                     "Inception",                  ["Tenet","Interstellar","The Matrix"],                           "easy"],
  ["interstellar",    "Interstellar_(film)",           "Interstellar",               ["Gravity","The Martian","Contact"],                             "easy"],
  ["gladiator",       "Gladiator_(2000_film)",         "Gladiator",                  ["Troy","300","Kingdom of Heaven"],                              "easy"],
  ["iron_man",        "Iron_Man_(film)",               "Iron Man",                   ["Thor","Captain America","Black Panther"],                      "easy"],
  ["black_panther",   "Black_Panther_(film)",          "Black Panther",              ["Iron Man","Thor","Captain Marvel"],                            "easy"],
  ["spider_man",      "Spider-Man_(2002_film)",        "Spider-Man",                 ["Batman","Superman","The Incredible Hulk"],                     "easy"],
  ["top_gun",         "Top_Gun",                       "Top Gun",                    ["An Officer and a Gentleman","Flight","Behind Enemy Lines"],    "easy"],
  ["rocky",           "Rocky_(film)",                  "Rocky",                      ["Raging Bull","Ali","The Fighter"],                            "easy"],
  ["home_alone",      "Home_Alone",                    "Home Alone",                 ["Macaulay Culkin","Richie Rich","Uncle Buck"],                  "easy"],
  ["the_social_network", "The_Social_Network",         "The Social Network",         ["The Big Short","Moneyball","Jobs"],                            "easy"],
  ["la_la_land",      "La_La_Land",                    "La La Land",                 ["Whiplash","Birdman","Mamma Mia"],                             "easy"],
  ["parasite",        "Parasite_(2019_film)",          "Parasite",                   ["Snowpiercer","Okja","The Handmaiden"],                         "easy"],
  // ── Well-known films (medium) ────────────────────────────────────────────────
  ["shawshank",       "The_Shawshank_Redemption",      "The Shawshank Redemption",   ["The Green Mile","The Shining","Misery"],                       "medium"],
  ["schindlers_list", "Schindler's_List",              "Schindler's List",           ["The Pianist","Life Is Beautiful","Sophie's Choice"],           "medium"],
  ["silence_lambs",   "The_Silence_of_the_Lambs_(film)", "The Silence of the Lambs", ["Se7en","Mindhunter","Hannibal"],                              "medium"],
  ["fight_club",      "Fight_Club",                    "Fight Club",                 ["American History X","Requiem for a Dream","American Psycho"],  "medium"],
  ["goodfellas",      "Goodfellas",                    "Goodfellas",                 ["Casino","The Irishman","Donnie Brasco"],                       "medium"],
  ["blade_runner",    "Blade_Runner",                  "Blade Runner",               ["Total Recall","Minority Report","Ghost in the Shell"],         "medium"],
  ["alien",           "Alien_(film)",                  "Alien",                      ["Predator","The Thing","Event Horizon"],                        "medium"],
  ["terminator",      "The_Terminator",                "The Terminator",             ["RoboCop","Judge Dredd","Universal Soldier"],                   "medium"],
  ["die_hard",        "Die_Hard",                      "Die Hard",                   ["Lethal Weapon","Beverly Hills Cop","Speed"],                   "medium"],
  ["raiders_ark",     "Raiders_of_the_Lost_Ark",       "Raiders of the Lost Ark",    ["Indiana Jones and the Temple of Doom","The Mummy","National Treasure"], "medium"],
  ["braveheart",      "Braveheart",                    "Braveheart",                 ["Rob Roy","The Last of the Mohicans","Patriot Games"],          "medium"],
  ["saving_ryan",     "Saving_Private_Ryan",           "Saving Private Ryan",        ["Hacksaw Ridge","Dunkirk","1917"],                             "medium"],
  ["leon",            "Léon:_The_Professional",        "Léon: The Professional",     ["La Femme Nikita","Columbiana","Hanna"],                       "medium"],
  ["no_country",      "No_Country_for_Old_Men",        "No Country for Old Men",     ["There Will Be Blood","Blood Simple","Fargo"],                  "medium"],
  ["lotr_return",     "The_Lord_of_the_Rings:_The_Return_of_the_King", "The Lord of the Rings: The Return of the King", ["The Hobbit","Excalibur","Conan the Barbarian"], "medium"],
  ["lotr_fellowship", "The_Lord_of_the_Rings:_The_Fellowship_of_the_Ring", "The Lord of the Rings: The Fellowship of the Ring", ["Willow","Eragon","The Hobbit"], "medium"],
  ["joker",           "Joker_(2019_film)",             "Joker",                      ["The Dark Knight","Taxi Driver","American Psycho"],             "medium"],
  ["1917",            "1917_(film)",                   "1917",                       ["Dunkirk","Hacksaw Ridge","Saving Private Ryan"],               "medium"],
  ["everything_all",  "Everything_Everywhere_All_at_Once", "Everything Everywhere All at Once", ["Multiverse of Madness","Coherence","Primer"],      "medium"],
  ["oppenheimer",     "Oppenheimer_(film)",            "Oppenheimer",                ["The Imitation Game","A Beautiful Mind","The Theory of Everything"], "medium"],
  ["dunkirk",         "Dunkirk_(2017_film)",           "Dunkirk",                    ["1917","Hacksaw Ridge","The Longest Day"],                      "medium"],
  ["wolf_wall_st",    "The_Wolf_of_Wall_Street_(2013_film)", "The Wolf of Wall Street", ["Boiler Room","Margin Call","American Made"],              "medium"],
  ["django",          "Django_Unchained",              "Django Unchained",           ["Inglourious Basterds","Lincoln","12 Years a Slave"],           "medium"],
  ["inglourious",     "Inglourious_Basterds",          "Inglourious Basterds",       ["Django Unchained","The Hateful Eight","Valkyrie"],             "medium"],
  ["reservoir_dogs",  "Reservoir_Dogs",                "Reservoir Dogs",             ["Pulp Fiction","Kill Bill","Natural Born Killers"],             "medium"],
  ["kill_bill",       "Kill_Bill:_Volume_1",           "Kill Bill",                  ["Ninja Assassin","The Raid","John Wick"],                       "medium"],
  ["memento",         "Memento_(film)",                "Memento",                    ["Inception","Shutter Island","Gone Girl"],                      "medium"],
  ["eternal_sunshine","Eternal_Sunshine_of_the_Spotless_Mind", "Eternal Sunshine of the Spotless Mind", ["The Science of Sleep","Adaptation","Being John Malkovich"], "medium"],
  ["spirited_away",   "Spirited_Away",                 "Spirited Away",              ["My Neighbor Totoro","Princess Mononoke","Howl's Moving Castle"], "medium"],
  ["wall_e",          "WALL-E",                        "WALL-E",                     ["Up","Ratatouille","Finding Nemo"],                             "medium"],
  ["up_movie",        "Up_(2009_film)",                "Up",                         ["WALL-E","Ratatouille","Inside Out"],                           "medium"],
  ["inside_out",      "Inside_Out_(2015_film)",        "Inside Out",                 ["Soul","Luca","Turning Red"],                                   "medium"],
  ["finding_nemo",    "Finding_Nemo",                  "Finding Nemo",               ["Shark Tale","Surf's Up","Happy Feet"],                         "medium"],
  ["gravity",         "Gravity_(2013_film)",           "Gravity",                    ["Interstellar","The Martian","Life"],                           "medium"],
  ["mad_max_fury",    "Mad_Max:_Fury_Road",            "Mad Max: Fury Road",         ["Waterworld","Judge Dredd","A Boy and His Dog"],                "medium"],
  ["get_out",         "Get_Out",                       "Get Out",                    ["Us","Hereditary","Nope"],                                      "medium"],
  ["arrival",         "Arrival_(film)",                "Arrival",                    ["Contact","Interstellar","Midnight Special"],                   "medium"],
  ["moonlight",       "Moonlight_(2016_film)",         "Moonlight",                  ["Green Book","Beale Street","Waves"],                           "medium"],
  ["green_book",      "Green_Book_(film)",             "Green Book",                 ["Driving Miss Daisy","The Help","Hidden Figures"],              "medium"],
  ["argo",            "Argo_(film)",                   "Argo",                       ["Zero Dark Thirty","Bridge of Spies","Munich"],                 "medium"],
  ["big_short",       "The_Big_Short_(film)",          "The Big Short",              ["Margin Call","Too Big to Fail","The Social Network"],          "medium"],
  ["spotlight",       "Spotlight_(film)",              "Spotlight",                  ["All the President's Men","The Post","Zodiac"],                 "medium"],
  ["revenant",        "The_Revenant_(film)",           "The Revenant",               ["Dances with Wolves","The Last of the Mohicans","Bone Tomahawk"], "medium"],
  ["her",             "Her_(film)",                    "Her",                        ["Ex Machina","A.I. Artificial Intelligence","Blade Runner 2049"], "medium"],
  ["birdman",         "Birdman_(film)",                "Birdman",                    ["Whiplash","La La Land","The Artist"],                          "medium"],
  ["whiplash",        "Whiplash_(film)",               "Whiplash",                   ["Black Swan","La La Land","Birdman"],                           "medium"],
  ["dune_2021",       "Dune_(2021_film)",              "Dune",                       ["Star Wars","Lawrence of Arabia","Avatar"],                     "medium"],
  ["shape_water",     "The_Shape_of_Water",            "The Shape of Water",         ["Guillermo del Toro film","Pan's Labyrinth","Splice"],          "medium"],
  ["hereditary",      "Hereditary_(film)",             "Hereditary",                 ["Midsommar","The Witch","Suspiria"],                            "medium"],
  ["midsommar",       "Midsommar",                     "Midsommar",                  ["Hereditary","The Wicker Man","Annihilation"],                  "medium"],
  ["12_years",        "12_Years_a_Slave_(film)",       "12 Years a Slave",           ["Selma","The Birth of a Nation","Belle"],                       "medium"],
  // ── Classic/arthouse (hard) ──────────────────────────────────────────────────
  ["casablanca",      "Casablanca_(film)",             "Casablanca",                 ["Notorious","The Third Man","Roman Holiday"],                   "hard"],
  ["citizen_kane",    "Citizen_Kane",                  "Citizen Kane",               ["Sunset Boulevard","All About Eve","Rebecca"],                  "hard"],
  ["vertigo",         "Vertigo_(film)",                "Vertigo",                    ["Rear Window","North by Northwest","Psycho"],                   "hard"],
  ["psycho",          "Psycho_(1960_film)",            "Psycho",                     ["The Birds","Rear Window","Rope"],                              "hard"],
  ["2001",            "2001:_A_Space_Odyssey_(film)",  "2001: A Space Odyssey",      ["Interstellar","Contact","Solaris"],                            "hard"],
  ["apocalypse_now",  "Apocalypse_Now",                "Apocalypse Now",             ["Full Metal Jacket","Platoon","The Deer Hunter"],               "hard"],
  ["taxi_driver",     "Taxi_Driver",                   "Taxi Driver",                ["Joker","American History X","Falling Down"],                   "hard"],
  ["raging_bull",     "Raging_Bull",                   "Raging Bull",                ["Rocky","Ali","The Fighter"],                                   "hard"],
  ["lawrence_arabia", "Lawrence_of_Arabia_(film)",     "Lawrence of Arabia",         ["Bridge on the River Kwai","The English Patient","Dune"],       "hard"],
  ["gone_wind",       "Gone_with_the_Wind_(film)",     "Gone with the Wind",         ["The English Patient","Casablanca","Doctor Zhivago"],           "hard"],
  ["singin_rain",     "Singin'_in_the_Rain",           "Singin' in the Rain",        ["An American in Paris","The Band Wagon","Oklahoma!"],           "hard"],
  ["wizard_oz",       "The_Wizard_of_Oz_(1939_film)",  "The Wizard of Oz",           ["Alice in Wonderland","Willy Wonka","The NeverEnding Story"],   "hard"],
  ["godfather2",      "The_Godfather_Part_II",         "The Godfather Part II",      ["The Godfather","Once Upon a Time in America","Goodfellas"],    "hard"],
  ["once_upon_time_amer","Once_Upon_a_Time_in_America","Once Upon a Time in America",["The Godfather","Goodfellas","Scarface"],                       "hard"],
  ["mulholland_dr",   "Mulholland_Drive_(film)",       "Mulholland Drive",           ["Blue Velvet","Lost Highway","Twin Peaks Fire Walk with Me"],   "hard"],
  ["lost_translation","Lost_in_Translation",           "Lost in Translation",        ["Somewhere","Broken Flowers","A Very Long Engagement"],         "hard"],
  ["seven_samurai",   "Seven_Samurai",                 "Seven Samurai",              ["Rashomon","Yojimbo","Harakiri"],                               "hard"],
  ["city_god",        "City_of_God_(film)",            "City of God",                ["Elite Squad","Bus 174","Central Station"],                     "hard"],
  ["pan_labyrinth",   "Pan's_Labyrinth",               "Pan's Labyrinth",            ["The Devil's Backbone","Splice","A Monster Calls"],             "hard"],
  ["pianist",         "The_Pianist_(2002_film)",       "The Pianist",                ["Schindler's List","Ida","The Zone of Interest"],               "hard"],
  ["amour",           "Amour_(film)",                  "Amour",                      ["45 Years","The Wife","Caché"],                                 "hard"],
  ["das_boot",        "Das_Boot",                      "Das Boot",                   ["U-571","Crimson Tide","The Enemy Below"],                      "hard"],
  ["life_beautiful",  "Life_Is_Beautiful",             "Life Is Beautiful",          ["The Pianist","Train to Busan","Cinema Paradiso"],              "hard"],
  ["cinema_paradiso", "Cinema_Paradiso",               "Cinema Paradiso",            ["8½","Amarcord","Nuovo Cinema Paradiso"],                       "hard"],
  ["oldboy",          "Oldboy_(2003_film)",            "Oldboy",                     ["I Saw the Devil","The Handmaiden","A Bittersweet Life"],       "hard"],
  ["handmaiden",      "The_Handmaiden",                "The Handmaiden",             ["Oldboy","Poetry","Mother"],                                    "hard"],
  ["cleo5to7",        "Cléo_from_5_to_7",             "Cléo from 5 to 7",           ["Hiroshima Mon Amour","Jules and Jim","The 400 Blows"],         "hard"],
  ["400_blows",       "The_400_Blows",                 "The 400 Blows",              ["Au Revoir les Enfants","Zero for Conduct","Wild Reeds"],       "hard"],
  ["breathless",      "Breathless_(1960_film)",        "Breathless",                 ["Shoot the Piano Player","Band of Outsiders","Contempt"],       "hard"],
  ["bicycle_thieves", "Bicycle_Thieves",               "Bicycle Thieves",            ["Rome Open City","Umberto D.","Rocco and His Brothers"],        "hard"],
  ["ran_kurosawa",    "Ran_(film)",                    "Ran",                        ["Kagemusha","Throne of Blood","Sanjuro"],                       "hard"],
  ["princess_mononoke","Princess_Mononoke",            "Princess Mononoke",          ["Nausicaä","Howl's Moving Castle","The Tale of Princess Kaguya"], "hard"],
  ["howl_moving",     "Howl's_Moving_Castle",          "Howl's Moving Castle",       ["Princess Mononoke","Castle in the Sky","Spirited Away"],       "hard"],
  ["coco",            "Coco_(2017_film)",              "Coco",                       ["Soul","Turning Red","Encanto"],                                "hard"],
  ["soul",            "Soul_(2020_film)",              "Soul",                       ["Inside Out","Coco","Turning Red"],                             "hard"],
  ["ratatouille",     "Ratatouille_(film)",            "Ratatouille",                ["Bee Movie","Ant Bully","Over the Hedge"],                      "hard"],
  // ── Modern Oscar films (medium continued) ────────────────────────────────────
  ["nomadland",       "Nomadland_(film)",              "Nomadland",                  ["American Honey","Lean on Pete","The Rider"],                   "medium"],
  ["coda_film",       "CODA_(film)",                   "CODA",                       ["Sound of Metal","The Shape of Water","Deaf U"],                "medium"],
  ["once_hollywood",  "Once_Upon_a_Time_in_Hollywood", "Once Upon a Time in Hollywood", ["Boogie Nights","Licorice Pizza","The Nice Guys"],         "medium"],
  ["poor_things",     "Poor_Things_(film)",            "Poor Things",                ["Dogtooth","The Favourite","The Lobster"],                      "medium"],
  ["killers_flower",  "Killers_of_the_Flower_Moon_(film)", "Killers of the Flower Moon", ["The Power of the Dog","Mank","The Irishman"],            "medium"],
  ["zone_interest",   "The_Zone_of_Interest_(film)",   "The Zone of Interest",       ["Son of Saul","Shoah","The Reader"],                           "medium"],
  ["barbie",          "Barbie_(film)",                 "Barbie",                     ["Legally Blonde","Mean Girls","Legally Blonde"],               "easy"],
  ["dallas_buyers",   "Dallas_Buyers_Club_(film)",     "Dallas Buyers Club",         ["Philadelphia","The Normal Heart","Angels in America"],         "medium"],
  ["lincolnfilm",     "Lincoln_(film)",                "Lincoln",                    ["Lincoln (2012)","Selma","The Birth of a Nation"],             "hard"],
  ["argo2",           "Zero_Dark_Thirty",              "Zero Dark Thirty",           ["Argo","13 Hours","American Sniper"],                           "hard"],
  ["ex_machina",      "Ex_Machina_(film)",             "Ex Machina",                 ["Her","A.I. Artificial Intelligence","Westworld"],              "medium"],
  ["nope_film",       "Nope_(film)",                   "Nope",                       ["Get Out","Us","Candyman"],                                     "medium"],
  ["us_film",         "Us_(2019_film)",                "Us",                         ["Get Out","Nope","The Purge"],                                  "medium"],
  ["tenet",           "Tenet_(film)",                  "Tenet",                      ["Inception","Dunkirk","Interstellar"],                          "medium"],
  ["dune_part2",      "Dune:_Part_Two",                "Dune: Part Two",             ["Dune","Avatar","Star Wars"],                                   "easy"],
  ["barbie2",         "Oppenheimer_(film)",            "Oppenheimer",                ["The Imitation Game","A Beautiful Mind","Einstein and Eddington"], "easy"],
  // ── Sci-Fi & Action ──────────────────────────────────────────────────────────
  ["blade_runner_2049","Blade_Runner_2049",            "Blade Runner 2049",          ["Blade Runner","Total Recall","Ghost in the Shell"],            "medium"],
  ["annihilation",    "Annihilation_(film)",           "Annihilation",               ["Arrival","Ex Machina","Midsommar"],                            "hard"],
  ["gravity2",        "Gravity_(2013_film)",           "Gravity",                    ["Interstellar","The Martian","Sunshine"],                       "medium"],
  ["martian",         "The_Martian_(film)",            "The Martian",                ["Interstellar","Gravity","Contact"],                            "medium"],
  ["edge_tomorrow",   "Edge_of_Tomorrow",              "Edge of Tomorrow",           ["Groundhog Day","Source Code","Looper"],                        "medium"],
  ["district9",       "District_9",                   "District 9",                 ["Elysium","Chappie","Alien Nation"],                            "hard"],
  ["moon_2009",       "Moon_(2009_film)",              "Moon",                       ["Gravity","The Martian","Silent Running"],                       "hard"],
  ["children_men",    "Children_of_Men",               "Children of Men",            ["The Road","28 Days Later","Y: The Last Man"],                  "hard"],
  ["minority_report", "Minority_Report_(film)",        "Minority Report",            ["Total Recall","A.I. Artificial Intelligence","eXistenZ"],      "hard"],
  ["prestige",        "The_Prestige_(film)",           "The Prestige",               ["The Illusionist","Now You See Me","Magic"],                    "medium"],
  // ── Horror ──────────────────────────────────────────────────────────────────
  ["shining",         "The_Shining_(film)",            "The Shining",                ["Doctor Sleep","1408","The Haunting"],                          "medium"],
  ["exorcist",        "The_Exorcist",                  "The Exorcist",               ["The Omen","Rosemary's Baby","Poltergeist"],                    "hard"],
  ["rosemarys_baby",  "Rosemary's_Baby_(film)",        "Rosemary's Baby",            ["The Omen","The Exorcist","It's Alive"],                        "hard"],
  ["halloween",       "Halloween_(1978_film)",         "Halloween",                  ["Nightmare on Elm Street","Friday the 13th","Scream"],          "medium"],
  ["nightmare_elm",   "A_Nightmare_on_Elm_Street",     "A Nightmare on Elm Street",  ["Halloween","Friday the 13th","Child's Play"],                  "medium"],
  ["it_2017",         "It_(2017_film)",                "It",                         ["Pennywise","Poltergeist","Clown"],                             "easy"],
  ["witch_2015",      "The_Witch_(2015_film)",         "The Witch",                  ["Hereditary","Midsommar","The Blackcoat's Daughter"],           "hard"],
  ["conjuring",       "The_Conjuring",                 "The Conjuring",              ["Insidious","Annabelle","Sinister"],                            "medium"],
  // ── Thrillers ────────────────────────────────────────────────────────────────
  ["gone_girl",       "Gone_Girl_(film)",              "Gone Girl",                  ["The Girl on the Train","Sharp Objects","Big Little Lies"],     "medium"],
  ["zodiac",          "Zodiac_(film)",                 "Zodiac",                     ["Se7en","Prisoners","Mindhunter"],                              "hard"],
  ["seven",           "Se7en",                         "Se7en",                      ["Silence of the Lambs","Zodiac","Prisoners"],                   "medium"],
  ["prisoners",       "Prisoners_(film)",              "Prisoners",                  ["Zodiac","Se7en","Mystic River"],                               "medium"],
  ["usual_suspects",  "The_Usual_Suspects",            "The Usual Suspects",         ["Primal Fear","Chinatown","L.A. Confidential"],                 "hard"],
  ["chinatown",       "Chinatown_(1974_film)",         "Chinatown",                  ["L.A. Confidential","The Two Jakes","The Big Lebowski"],        "hard"],
  ["heat",            "Heat_(1995_film)",              "Heat",                       ["Collateral","Miami Vice","Public Enemies"],                    "hard"],
  ["training_day",    "Training_Day",                  "Training Day",               ["End of Watch","Dark Blue","The Shield"],                       "medium"],
  // ── Comedies ─────────────────────────────────────────────────────────────────
  ["superbad",        "Superbad",                      "Superbad",                   ["Knocked Up","Pineapple Express","The Hangover"],               "medium"],
  ["hangover",        "The_Hangover",                  "The Hangover",               ["Due Date","Very Bad Trip 2","Old School"],                     "medium"],
  ["bridesmaids",     "Bridesmaids_(film)",            "Bridesmaids",                ["The Heat","Girls Trip","Bachelorette"],                        "medium"],
  ["mean_girls",      "Mean_Girls",                    "Mean Girls",                 ["Clueless","10 Things I Hate About You","Easy A"],              "easy"],
  ["groundhog_day",   "Groundhog_Day_(film)",          "Groundhog Day",              ["Source Code","Edge of Tomorrow","Palm Springs"],               "medium"],
  ["big_lebowski",    "The_Big_Lebowski",              "The Big Lebowski",           ["Barton Fink","Burn After Reading","Fargo"],                    "hard"],
  ["fargo_film",      "Fargo_(film)",                  "Fargo",                      ["Blood Simple","The Big Lebowski","No Country for Old Men"],    "hard"],
  ["office_space",    "Office_Space",                  "Office Space",               ["Clerks","Napoleon Dynamite","Idiocracy"],                      "hard"],
  // ── Drama ────────────────────────────────────────────────────────────────────
  ["american_beauty", "American_Beauty_(film)",        "American Beauty",            ["Happiness","Magnolia","Short Cuts"],                           "medium"],
  ["beautiful_mind",  "A_Beautiful_Mind_(film)",       "A Beautiful Mind",           ["The Imitation Game","Good Will Hunting","Proof"],              "medium"],
  ["imitation_game",  "The_Imitation_Game",            "The Imitation Game",         ["A Beautiful Mind","Turing","The Theory of Everything"],        "medium"],
  ["good_will",       "Good_Will_Hunting",             "Good Will Hunting",          ["A Beautiful Mind","The Social Network","Gifted"],              "medium"],
  ["dead_poets",      "Dead_Poets_Society",            "Dead Poets Society",         ["The Emperor's Club","Mona Lisa Smile","School of Rock"],       "medium"],
  ["philadelphia",    "Philadelphia_(film)",           "Philadelphia",               ["Dallas Buyers Club","The Normal Heart","Angels in America"],   "hard"],
  ["slumdog",         "Slumdog_Millionaire",           "Slumdog Millionaire",        ["Lion","A Mighty Heart","The Kite Runner"],                     "medium"],
  ["127_hours",       "127_Hours",                     "127 Hours",                  ["Wild","Into the Wild","Touching the Void"],                    "hard"],
  ["requiem_dream",   "Requiem_for_a_Dream",           "Requiem for a Dream",        ["Trainspotting","Christiane F.","Fear and Loathing"],           "hard"],
  ["black_swan",      "Black_Swan_(film)",             "Black Swan",                 ["Whiplash","Nina","Red Sparrow"],                               "medium"],
  ["natalie_portman", "Closer_(2004_film)",            "Closer",                     ["Eyes Wide Shut","Match Point","The Shape of Things"],          "hard"],
  ["looper",          "Looper_(film)",                 "Looper",                     ["Source Code","Edge of Tomorrow","Primer"],                     "hard"],
  ["source_code",     "Source_Code",                   "Source Code",                ["Looper","Edge of Tomorrow","Deja Vu"],                         "hard"],
  // ── Animation ────────────────────────────────────────────────────────────────
  ["akira",           "Akira_(1988_film)",             "Akira",                      ["Ghost in the Shell","Paprika","Redline"],                      "hard"],
  ["ghost_shell",     "Ghost_in_the_Shell_(1995_film)","Ghost in the Shell",         ["Akira","Paprika","Metropolis"],                                "hard"],
  ["waltz_bashir",    "Waltz_with_Bashir",             "Waltz with Bashir",          ["Persepolis","Grave of the Fireflies","Maus"],                  "extreme"],
  ["persepolis",      "Persepolis_(film)",             "Persepolis",                 ["Waltz with Bashir","A Cat in Paris","The Illusionist"],        "extreme"],
  ["grave_fireflies", "Grave_of_the_Fireflies",        "Grave of the Fireflies",     ["In This Corner of the World","The Tale of Princess Kaguya","My Neighbor Totoro"], "hard"],
  ["my_neighbor",     "My_Neighbor_Totoro",            "My Neighbor Totoro",         ["Kiki's Delivery Service","Castle in the Sky","Ponyo"],         "medium"],
  ["castle_sky",      "Castle_in_the_Sky",             "Castle in the Sky",          ["Nausicaä","Howl's Moving Castle","The Wind Rises"],            "hard"],
  ["nausicaa",        "Nausicaä_of_the_Valley_of_the_Wind_(film)", "Nausicaä of the Valley of the Wind", ["Princess Mononoke","Castle in the Sky","The Wind Rises"], "hard"],
  // ── Extreme / very obscure ────────────────────────────────────────────────────
  ["rashomon",        "Rashomon",                      "Rashomon",                   ["Ikiru","Seven Samurai","Ran"],                                 "extreme"],
  ["wild_strawberries","Wild_Strawberries_(film)",     "Wild Strawberries",          ["The Seventh Seal","Persona","Through a Glass Darkly"],         "extreme"],
  ["seventh_seal",    "The_Seventh_Seal",              "The Seventh Seal",           ["Wild Strawberries","Persona","Winter Light"],                  "extreme"],
  ["persona",         "Persona_(1966_film)",           "Persona",                    ["Hour of the Wolf","The Seventh Seal","Through a Glass Darkly"],"extreme"],
  ["amarcord",        "Amarcord",                      "Amarcord",                   ["8½","Rome","Fellini Satyricon"],                               "extreme"],
  ["eight_half",      "8½",                            "8½",                         ["Amarcord","Roma","La Dolce Vita"],                             "extreme"],
  ["stalker_film",    "Stalker_(1979_film)",           "Stalker",                    ["Solaris","Mirror","Andrei Rublev"],                            "extreme"],
  ["solaris",         "Solaris_(1972_film)",           "Solaris",                    ["Stalker","Mirror","2001: A Space Odyssey"],                    "extreme"],
  ["blue_velvet",     "Blue_Velvet_(film)",            "Blue Velvet",                ["Wild at Heart","Lost Highway","Mulholland Drive"],             "extreme"],
  ["2046",            "2046_(film)",                   "2046",                       ["In the Mood for Love","Days of Being Wild","Chungking Express"],"extreme"],
  ["in_mood_love",    "In_the_Mood_for_Love",          "In the Mood for Love",       ["2046","Days of Being Wild","Chungking Express"],               "extreme"],
];

function isValidImage(path) {
  if (!existsSync(path)) return false;
  if (statSync(path).size < 5000) return false;
  const buf = readFileSync(path).subarray(0, 4);
  return (buf[0] === 0xff && buf[1] === 0xd8) || (buf[0] === 0x89 && buf[1] === 0x50);
}

// Use REST summary API which returns the article's actual lead image (including fair-use posters).
async function wikiThumb(wikiTitle) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, "accept": "application/json" } });
      if (res.status === 429) { await sleep(8000 * (i + 1)); continue; }
      if (res.status === 404) return null;
      if (!res.ok) return null;
      const j = await res.json();
      // Prefer originalimage (higher res), fall back to thumbnail
      return j.originalimage?.source ?? j.thumbnail?.source ?? null;
    } catch { await sleep(3000); }
  }
  return null;
}

async function download(src, dest) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(src, { headers: { "user-agent": UA } });
      if (res.status === 429) { await sleep(10000 * (i + 1)); continue; }
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
      return true;
    } catch (e) {
      if (i === 2) return false;
      await sleep(3000 * (i + 1));
    }
  }
  return false;
}

mkdirSync(join(ROOT, "public/movies"), { recursive: true });

// Load existing movies.json to preserve already-downloaded entries
let existing = [];
try { existing = JSON.parse(readFileSync(join(ROOT, "data/movies.json"), "utf8")); } catch {}
const byId = new Map(existing.map((m) => [m.id, m]));

let added = 0, skipped = 0, failed = 0;

for (const [id, wiki, answer, decoys, tier] of MOVIES) {
  const imageFile = `${id}.jpg`;
  const imagePath = `/movies/${imageFile}`;
  const dest = join(ROOT, `public${imagePath}`);

  if (byId.has(id) && isValidImage(dest)) {
    skipped++;
    continue;
  }

  // Fetch Wikipedia thumbnail
  const src = await wikiThumb(wiki);
  await sleep(5000); // 5s between Wikipedia API calls to be polite
  if (!src) {
    console.log(`SKIP (no thumb): ${id}`);
    failed++;
    continue;
  }

  const ext = src.includes(".png") ? "png" : "jpg";
  const finalDest = dest.replace(".jpg", `.${ext}`);
  const finalPath = imagePath.replace(".jpg", `.${ext}`);

  const ok = await download(src, finalDest);
  await sleep(5000);
  if (ok && isValidImage(finalDest)) {
    byId.set(id, { id, answer, decoys, image: finalPath, source: src, tier });
    added++;
    console.log(`ok: ${id} (${tier})`);
  } else {
    console.log(`FAIL: ${id}`);
    failed++;
  }
}

// Write final JSON in MOVIES order, then append any extras from existing
const order = MOVIES.map(([id]) => id);
const seen = new Set(order);
const out = [
  ...order.map((id) => byId.get(id)).filter(Boolean),
  ...existing.filter((m) => !seen.has(m.id) && isValidImage(join(ROOT, `public${m.image}`))),
];
writeFileSync(join(ROOT, "data/movies.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`\nDone. Added ${added}, skipped ${skipped}, failed ${failed}`);
console.log(`Total movies.json: ${out.length} entries`);
