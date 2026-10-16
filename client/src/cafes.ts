// Cafés on ANU's Acton campus, for the café kiosk outside 154 (Lab Coffee).
// Gathered from public pages on 2026-10-17; hours and menus change, so the
// popup says to check before going. Not an official ANU list.

export interface Cafe {
  name: string;
  /** Building or landmark, short: "Di Riddell Student Centre, building 154". */
  where: string;
  /** One or two sentences: what it's like, what it's known for. */
  about: string;
  /** What it mostly sells, 3–6 items: ["Coffee", "Toasties", "Bánh mì"]. */
  sells: string[];
  /** Its own site or an official page about it (https), or null. */
  link: string | null;
}

export const CAFES: Cafe[] = [
  {
    name: "Lab Coffee",
    where: "Di Riddell Student Centre, building 154",
    about:
      "The café on the north side of 154, listed in some places as \"Coffee Lab\" or just \"LAB\". A student-run listing describes it as \"arguably the best coffee on campus\".",
    sells: ["Coffee", "Hot and cold drinks", "Breakfast", "Lunch", "Sweets"],
    link: "https://www.facebook.com/labatanu/",
  },
  {
    name: "Craft Beans",
    where: "Marie Reay Teaching Centre, Kambri",
    about: "A coffee spot in the Marie Reay Teaching Centre in Kambri.",
    sells: ["Coffee", "Fresh juices", "Food menu"],
    link: "https://kambri.com.au/eat-drink-shop/craft-beans/",
  },
  {
    name: "Rex Espresso",
    where: "Marie Reay Teaching Centre, Kambri",
    about: "A coffee spot in the Marie Reay Teaching Centre.",
    sells: ["Espresso coffee"],
    link: "https://www.facebook.com/people/REX-Espresso-Canberra/100063531520830/",
  },
  {
    name: "Ambis Chai",
    where: "Chifley Library",
    about: "A chai stall in Chifley Library.",
    sells: ["Chai"],
    link: "https://www.instagram.com/ambischaianu/",
  },
  {
    name: "Atticus Café",
    where: "CBE building (26)",
    about: "A café in the Business and Economics building.",
    sells: ["Coffee"],
    link: "https://www.facebook.com/atticuscoffeeanu/",
  },
  {
    name: "Tasa Coffee House",
    where: "David Cocking building (19)",
    about: "A coffee house in the David Cocking building.",
    sells: ["Coffee"],
    link: "https://www.facebook.com/people/Tasa-Coffee-House/61558650490488/",
  },
  {
    name: "Superfine Café",
    where: "College of Law (5)",
    about: "The café in the College of Law building.",
    sells: ["Coffee"],
    link: "https://www.facebook.com/SuperfineCafe/",
  },
  {
    name: "Little Pickle",
    where: "R.N. Robertson building (46)",
    about: "A café in the R.N. Robertson building.",
    sells: ["Coffee"],
    link: "https://picklecatering.com.au/contact-us/",
  },
  {
    name: "Café Mantra",
    where: "Old Canberra House (73), Lennox Crossing",
    about: "Good coffee and comforting, customisable food in a relaxed space. It also does catering for events.",
    sells: ["Coffee", "Breakfast plates", "Light lunches", "Burgers", "Mains"],
    link: "https://cafemantra.com.au/",
  },
  {
    name: "Savoir French",
    where: "School of Art and Design, building 105, Ellery Crescent",
    about: "A small French café and bakery in the lobby of the School of Art and Design, about five minutes' walk from Kambri.",
    sells: ["Coffee", "Breakfast", "Lunch", "Baguette sandwiches", "Afternoon tea"],
    link: "https://savoirfrench.com.au/",
  },
  {
    name: "Gods Café",
    where: "Hedley Bull building (130)",
    about: "A café in the Hedley Bull building. A 2015 article called it one of the campus's oldest venues.",
    sells: ["Coffee", "Café food"],
    link: "https://www.facebook.com/thegodscafe/",
  },
  {
    name: "Vanilla Bean Café",
    where: "John Curtin School of Medical Research (131)",
    about: "The café in the John Curtin School of Medical Research.",
    sells: ["Coffee", "Café food"],
    link: null,
  },
];

export const CAFES_CHECKED = "2026-10-17";
