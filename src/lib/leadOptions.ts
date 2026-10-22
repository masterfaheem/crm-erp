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

/* Status & priority (value -> label), in pipeline order */
export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  mature: "Mature",
  proposal: "Proposal",
  negotiation: "Negotiation",
  follow_up: "Follow Up",
  won: "Won",
  lost: "Lost",
};

export const LEAD_PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

type Opt = { value: string; label: string };
const toMap = (arr: Opt[]) =>
  Object.fromEntries(arr.map((o) => [o.value, o.label])) as Record<string, string>;

/* Profession ("other" -> free text) */
export const PROFESSIONS: Opt[] = [
  { value: "student", label: "Student" },
  { value: "businessman", label: "Businessman" },
  { value: "freelancer", label: "Freelancer" },
  { value: "job_holder", label: "Job Holder" },
  { value: "teacher", label: "Teacher" },
  { value: "other", label: "Other" },
];

/* Budget range (PKR, thousands) */
export const BUDGET_RANGES: Opt[] = [
  { value: "30-40", label: "30k – 40k" },
  { value: "40-50", label: "40k – 50k" },
  { value: "50-60", label: "50k – 60k" },
  { value: "60-80", label: "60k – 80k" },
  { value: "80-100", label: "80k – 100k" },
  { value: "100-125", label: "100k – 125k" },
  { value: "125-150", label: "125k – 150k" },
  { value: "150-200", label: "150k – 200k" },
  { value: "200-300", label: "200k – 300k" },
  { value: "300-500", label: "300k – 500k" },
];

/* Workload / use case (multi-select, "custom" -> free text) */
export const USE_CASES: Opt[] = [
  { value: "study", label: "Study" },
  { value: "graphic_design", label: "Graphic Design" },
  { value: "video_editing", label: "Video Editing" },
  { value: "data_entry", label: "Data Entry" },
  { value: "ecommerce", label: "E-Commerce" },
  { value: "web_dev", label: "Web Development" },
  { value: "programming", label: "Programming" },
  { value: "office_use", label: "Office Use" },
  { value: "gaming", label: "Gaming" },
  { value: "autocad_3d", label: "AutoCAD / 3D" },
  { value: "trading", label: "Trading" },
  { value: "custom", label: "Custom" },
];

/* Lost reason ("other" -> free text) */
export const LOST_REASONS: Opt[] = [
  { value: "budget_issue", label: "Budget Issue" },
  { value: "model_not_available", label: "Model Not Available" },
  { value: "price_high", label: "Price High" },
  { value: "condition_issue", label: "Condition Issue" },
  { value: "bought_elsewhere", label: "Bought Elsewhere" },
  { value: "not_responding", label: "Not Responding" },
  { value: "unknown", label: "Unknown" },
  { value: "other", label: "Other" },
];

export const PROFESSION_LABELS = toMap(PROFESSIONS);
export const BUDGET_LABELS = toMap(BUDGET_RANGES);
export const USE_CASE_LABELS = toMap(USE_CASES);
export const LOST_REASON_LABELS = toMap(LOST_REASONS);

/* Display helpers */
export function professionText(v?: string | null, other?: string | null) {
  if (!v) return "";
  return v === "other" ? other || "Other" : PROFESSION_LABELS[v] || v;
}
export function formatUseCases(csv?: string | null, custom?: string | null) {
  if (!csv) return "";
  return csv
    .split(",")
    .filter(Boolean)
    .map((k) => (k === "custom" ? custom || "Custom" : USE_CASE_LABELS[k] || k))
    .join(", ");
}
export function lostReasonText(v?: string | null, other?: string | null) {
  if (!v) return "";
  return v === "other" ? other || "Other" : LOST_REASON_LABELS[v] || v;
}
