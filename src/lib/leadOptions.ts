/* ============================================================
   LEAD OPTIONS
   Fixed dropdown lists for the Leads module (Source + City).
   Edit these arrays to add/remove options.
============================================================ */

export interface LeadSourceOption {
  value: string;
  label: string;
  group: "Social / Organic" | "Ads";
}

export const LEAD_SOURCES: LeadSourceOption[] = [
  // Social / Organic
  { value: "facebook", label: "Facebook", group: "Social / Organic" },
  { value: "facebook_ad", label: "Facebook Ad", group: "Social / Organic" },
  { value: "instagram", label: "Instagram", group: "Social / Organic" },
  { value: "reference", label: "Reference", group: "Social / Organic" },
  { value: "word_of_mouth", label: "Word of Mouth", group: "Social / Organic" },
  { value: "repeat", label: "Repeat", group: "Social / Organic" },
  { value: "mf_follower", label: "MF Follower", group: "Social / Organic" },
  // Ads
  { value: "ads_1", label: "Ads 1", group: "Ads" },
  { value: "ads_2", label: "Ads 2", group: "Ads" },
  { value: "ads_3", label: "Ads 3", group: "Ads" },
];

export const LEAD_SOURCE_GROUPS = ["Social / Organic", "Ads"] as const;

export function leadSourceLabel(value: string | null | undefined): string {
  if (!value) return "";
  return LEAD_SOURCES.find((s) => s.value === value)?.label || value;
}

/* Main cities & towns of Pakistan (all provinces / territories), A–Z */
const RAW_CITIES = [
  // Punjab
  "Lahore", "Faisalabad", "Rawalpindi", "Gujranwala", "Multan", "Sialkot",
  "Bahawalpur", "Sargodha", "Sheikhupura", "Jhang", "Rahim Yar Khan",
  "Gujrat", "Kasur", "Sahiwal", "Okara", "Wah Cantt", "Dera Ghazi Khan",
  "Mandi Bahauddin", "Chiniot", "Kamoke", "Hafizabad", "Sadiqabad",
  "Burewala", "Khanewal", "Muzaffargarh", "Jhelum", "Khanpur", "Pakpattan",
  "Daska", "Gojra", "Muridke", "Bahawalnagar", "Jaranwala", "Chishtian",
  "Attock", "Vehari", "Kot Addu", "Wazirabad", "Mianwali", "Kamalia",
  "Ahmedpur East", "Toba Tek Singh", "Khushab", "Bhakkar", "Narowal",
  "Layyah", "Lodhran", "Rajanpur", "Chakwal", "Taxila", "Hasilpur",
  "Arifwala", "Pattoki", "Haroonabad", "Samundri", "Shakargarh",
  "Pasrur", "Kharian", "Lalamusa", "Talagang", "Pind Dadan Khan",
  "Murree", "Hassan Abdal", "Fateh Jang", "Gujar Khan", "Nankana Sahib",
  "Shujabad", "Jalalpur Pirwala", "Mian Channu", "Kabirwala", "Depalpur",
  "Renala Khurd", "Chichawatni", "Phalia", "Sambrial", "Kot Radha Kishan",
  "Raiwind", "Ferozewala", "Sharaqpur", "Safdarabad", "Bhalwal",
  "Kot Momin", "Sillanwali", "Shorkot", "Fort Abbas", "Yazman",
  "Liaquatpur", "Taunsa", "Jampur", "Chunian", "Alipur", "Isa Khel",
  "Kalabagh", "Piplan", "Dina", "Sohawa", "Jauharabad", "Noorpur Thal",
  "Bhera", "Sangla Hill", "Tandlianwala", "Pir Mahal", "Kamar Mushani",
  // Sindh
  "Karachi", "Hyderabad", "Sukkur", "Larkana", "Nawabshah", "Mirpur Khas",
  "Jacobabad", "Shikarpur", "Khairpur", "Dadu", "Thatta", "Badin",
  "Tando Allahyar", "Tando Adam", "Tando Muhammad Khan", "Sanghar",
  "Umerkot", "Mithi", "Ghotki", "Kandhkot", "Kashmore", "Matiari",
  "Hala", "Moro", "Kotri", "Jamshoro", "Sehwan", "Mehar", "Ratodero",
  "Shahdadkot", "Kamber", "Naushahro Feroze", "Daharki", "Rohri",
  "Pano Aqil", "Gambat", "Shahdadpur", "Digri", "Sujawal", "Keti Bandar",
  // Khyber Pakhtunkhwa
  "Peshawar", "Mardan", "Mingora", "Swat", "Abbottabad", "Kohat",
  "Dera Ismail Khan", "Bannu", "Mansehra", "Nowshera", "Charsadda",
  "Swabi", "Haripur", "Chitral", "Dir", "Timergara", "Batkhela",
  "Karak", "Lakki Marwat", "Tank", "Hangu", "Shangla", "Battagram",
  "Malakand", "Buner", "Risalpur", "Pabbi", "Jamrud", "Landi Kotal",
  "Parachinar", "Miranshah", "Wana", "Khar", "Topi", "Tangi", "Takht-i-Nasrati",
  "Havelian", "Nathia Gali", "Kalam", "Saidu Sharif", "Chakdara",
  // Balochistan
  "Quetta", "Gwadar", "Turbat", "Khuzdar", "Hub", "Chaman", "Sibi",
  "Zhob", "Loralai", "Kalat", "Mastung", "Pishin", "Nushki", "Dera Murad Jamali",
  "Usta Muhammad", "Jaffarabad", "Kharan", "Panjgur", "Dalbandin",
  "Pasni", "Ormara", "Jiwani", "Lasbela", "Uthal", "Bela", "Kohlu",
  "Dera Bugti", "Ziarat", "Qila Saifullah", "Qila Abdullah", "Washuk",
  "Awaran", "Barkhan", "Musakhel", "Sui",
  // Islamabad Capital Territory
  "Islamabad",
  // Azad Jammu & Kashmir
  "Muzaffarabad", "Mirpur", "Kotli", "Bhimber", "Rawalakot", "Bagh",
  "Pallandri", "Hajira", "Athmuqam", "Dadyal", "Sudhnoti",
  // Gilgit-Baltistan
  "Gilgit", "Skardu", "Hunza", "Aliabad", "Chilas", "Ghizer", "Gahkuch",
  "Khaplu", "Shigar", "Astore", "Nagar",
];

export const PAKISTAN_CITIES: string[] = Array.from(new Set(RAW_CITIES)).sort(
  (a, b) => a.localeCompare(b)
);
