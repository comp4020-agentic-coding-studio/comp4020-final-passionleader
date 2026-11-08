// The quick quiz's questions (mini-game tables): ANU and Canberra, each one
// about a place or a fact the app's own pages already state. Dates are the
// ones in client/src/academic-calendar.json (copied from ANU's University
// Calendar); the places are the ones the café guide, the Hub and the creek
// scenery name. Anything I wasn't sure of stayed out (for one, the library's
// opening hours: they change, and the assistants read them live). `a` is the
// right answer and `wrong` three clearly wrong ones; the server shuffles the
// four for each asking, so the right one isn't always in the same place.

export interface Question {
  q: string;
  a: string;
  wrong: [string, string, string];
}

export const QUESTIONS: Question[] = [
  { q: "Which creek runs through the ANU campus?", a: "Sullivans Creek", wrong: ["Ginninderra Creek", "Yarralumla Creek", "Jerrabomberra Creek"] },
  { q: "On ANU's calendar, when is the Semester 1 2026 census date?", a: "31 March 2026", wrong: ["23 February 2026", "9 March 2026", "8 May 2026"] },
  { q: "On ANU's calendar, when is the Semester 2 2026 census date?", a: "31 August 2026", wrong: ["27 July 2026", "5 October 2026", "1 June 2026"] },
  { q: "When do Semester 1 2026 classes begin?", a: "23 February 2026", wrong: ["31 March 2026", "6 April 2026", "27 July 2026"] },
  { q: "When do Semester 2 2026 classes begin?", a: "27 July 2026", wrong: ["23 February 2026", "31 August 2026", "5 October 2026"] },
  { q: "On what date is Canberra Day in 2026?", a: "9 March 2026", wrong: ["26 January 2026", "31 March 2026", "1 June 2026"] },
  { q: "On what date is Labour Day in 2026, on ANU's calendar?", a: "5 October 2026", wrong: ["9 March 2026", "1 June 2026", "8 June 2026"] },
  { q: "Which public holiday falls on 1 June 2026, on ANU's calendar?", a: "Reconciliation Day", wrong: ["Canberra Day", "Labour Day", "Boxing Day"] },
  { q: "Which public holiday falls on 8 June 2026, on ANU's calendar?", a: "King's Birthday", wrong: ["Reconciliation Day", "Canberra Day", "Labour Day"] },
  { q: "When does the Semester 1 2026 teaching break begin?", a: "6 April 2026", wrong: ["23 February 2026", "20 April 2026", "29 May 2026"] },
  { q: "When do classes return after the Semester 1 2026 teaching break?", a: "20 April 2026", wrong: ["6 April 2026", "8 May 2026", "29 May 2026"] },
  { q: "When do Semester 1 2026 classes end?", a: "29 May 2026", wrong: ["31 March 2026", "8 May 2026", "1 June 2026"] },
  { q: "What is the last day to drop a Semester 1 2026 course without failure?", a: "8 May 2026", wrong: ["23 February 2026", "31 March 2026", "29 May 2026"] },
  { q: "In which Canberra suburb is ANU's main campus?", a: "Acton", wrong: ["Belconnen", "Braddon", "Kingston"] },
  { q: "The Marie Reay Teaching Centre, with Craft Beans coffee, is in which ANU precinct?", a: "Kambri", wrong: ["Civic", "Woden", "Belconnen"] },
  { q: "The Student Hub and Lab Coffee are in the Di Riddell Student Centre. Which building number is it?", a: "154", wrong: ["155", "25", "1"] },
  { q: "What does ANUSA stand for?", a: "ANU Students' Association", wrong: ["ANU Staff and University Services Agency", "Australian National University Sports Alliance", "ANU Study Abroad Office"] },
  { q: "What does the O in O-Week stand for?", a: "Orientation", wrong: ["Open", "Online", "Outdoor"] },
  { q: "An ANU student's email begins with u. How many digits come next?", a: "7", wrong: ["5", "6", "8"] },
  { q: "Which architect, with Marion Mahony Griffin, won the 1912 competition to design Canberra?", a: "Walter Burley Griffin", wrong: ["Frank Lloyd Wright", "John Monash", "Robin Boyd"] },
  { q: "What does ACT stand for?", a: "Australian Capital Territory", wrong: ["Australian Central Territory", "Allied Capital Territory", "Australian Council Trust"] },
  { q: "Which lake lies in the middle of Canberra and is named after the city's designer?", a: "Lake Burley Griffin", wrong: ["Lake George", "Lake Eucumbene", "Lake Ginninderra"] },
  { q: "On which hill does Parliament House stand?", a: "Capital Hill", wrong: ["Red Hill", "Mount Ainslie", "Black Mountain"] },
  { q: "The Telstra Tower stands on which hill near ANU?", a: "Black Mountain", wrong: ["Red Hill", "Mount Ainslie", "Mount Majura"] },
  { q: "In which year was the Australian National University founded by an Act of Parliament?", a: "1946", wrong: ["1913", "1927", "1967"] },
];
