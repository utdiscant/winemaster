// The chapters of the WSET Level 3 textbook ("Understanding Wines: Explaining Style and Quality"),
// in book order. Question categories use these titles.
export const WSET3_CHAPTERS = [
  "The Systematic Approach to Tasting Wine",
  "Wine with Food",
  "Storage and Service of Wine",
  "The Vine",
  "The Growing Environment",
  "Vineyard Management",
  "Common Elements in Winemaking and Maturation",
  "White and Sweet Winemaking",
  "Red and Rosé Winemaking",
  "Factors that Affect the Price of Wine",
  "Wine and the Law",
  "Introduction to France",
  "Bordeaux",
  "The Dordogne and South West France",
  "Burgundy",
  "Beaujolais",
  "Alsace",
  "The Loire Valley",
  "The Northern Rhône",
  "The Southern Rhône",
  "Southern France",
  "Germany",
  "Austria",
  "Tokaj",
  "Greece",
  "Introduction to Italy",
  "Northern Italy",
  "Central Italy",
  "Southern Italy",
  "Spain",
  "Portugal",
  "Introduction to the USA",
  "California",
  "Oregon, Washington and New York",
  "Canada",
  "Chile",
  "Argentina",
  "South Africa",
  "Australia",
  "New Zealand",
  "Sparkling Wine Production",
  "Sparkling Wines of the World",
  "Sherry",
  "Port",
  "Fortified Muscats",
];

// Sorts categories in book order; categories that aren't chapters go last, alphabetically
export function compareCategories(a: string, b: string): number {
  const rank = (category: string) => {
    const index = WSET3_CHAPTERS.indexOf(category);
    return index === -1 ? WSET3_CHAPTERS.length : index;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}
