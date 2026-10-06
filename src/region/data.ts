/**
 * @file src/region/data.ts
 * @desc Generic region data: every ISO 3166-1 country (plus XK, Kosovo, which osu! uses) by
 *       continent, UN M49 style, and a few representative zones per continent.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

/** Continent codes. */
export type ContinentCode = "AF" | "AN" | "AS" | "EU" | "NA" | "OC" | "SA";

/** Country codes per continent. Transcontinental countries follow UN M49. */
export const COUNTRIES_BY_CONTINENT: Readonly<Record<ContinentCode, string>> = {
  AF:
    "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG " +
    "MW ML MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW IO",
  AN: "AQ BV GS HM TF",
  AS:
    "AF AM AZ BH BD BT BN KH CN CY GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM " +
    "NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE CX CC",
  EU:
    "AX AL AD AT BY BE BA BG HR CZ DK EE FO FI FR DE GI GR GG VA HU IS IE IM IT JE XK LV LI LT " +
    "LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB",
  NA:
    "AI AG AW BS BB BZ BM BQ VG CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MX MS NI PA PR " +
    "BL KN LC MF PM VC SX TT TC US VI",
  OC: "AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV UM VU WF",
  SA: "AR BO BR CL CO EC FK GF GY PY PE SR UY VE",
};

/** English names per continent. */
export const CONTINENT_NAMES: Readonly<Record<ContinentCode, string>> = {
  AF: "Africa",
  AN: "Antarctica",
  AS: "Asia",
  EU: "Europe",
  NA: "North America",
  OC: "Oceania",
  SA: "South America",
};

/** A few common zones per continent, for pickers. Not every zone on the continent. */
export const ZONES_BY_CONTINENT: Readonly<Record<ContinentCode, string>> = {
  AF:
    "Africa/Cairo Africa/Lagos Africa/Johannesburg Africa/Nairobi Africa/Casablanca " +
    "Africa/Algiers Africa/Accra Africa/Addis_Ababa Africa/Kinshasa Indian/Mauritius",
  AN: "Antarctica/McMurdo Antarctica/Casey Antarctica/Palmer Antarctica/Troll",
  AS:
    "Asia/Tokyo Asia/Seoul Asia/Shanghai Asia/Hong_Kong Asia/Taipei Asia/Singapore Asia/Manila " +
    "Asia/Jakarta Asia/Bangkok Asia/Ho_Chi_Minh Asia/Kolkata Asia/Kathmandu Asia/Dhaka " +
    "Asia/Karachi Asia/Dubai Asia/Riyadh Asia/Tehran Asia/Jerusalem Asia/Almaty Asia/Tashkent " +
    "Europe/Istanbul",
  EU:
    "Europe/London Europe/Dublin Europe/Lisbon Europe/Paris Europe/Berlin Europe/Madrid " +
    "Europe/Rome Europe/Amsterdam Europe/Stockholm Europe/Warsaw Europe/Athens Europe/Helsinki " +
    "Europe/Kyiv Europe/Moscow Atlantic/Reykjavik",
  NA:
    "America/New_York America/Chicago America/Denver America/Phoenix America/Los_Angeles " +
    "America/Anchorage Pacific/Honolulu America/Toronto America/Vancouver America/Halifax " +
    "America/St_Johns America/Mexico_City America/Puerto_Rico America/Panama America/Havana",
  OC:
    "Australia/Sydney Australia/Melbourne Australia/Brisbane Australia/Adelaide Australia/Perth " +
    "Australia/Darwin Pacific/Auckland Pacific/Fiji Pacific/Guam Pacific/Port_Moresby " +
    "Pacific/Tongatapu Pacific/Apia Pacific/Kiritimati Pacific/Chatham Pacific/Noumea",
  SA:
    "America/Sao_Paulo America/Argentina/Buenos_Aires America/Santiago America/Bogota " +
    "America/Lima America/Caracas America/La_Paz America/Asuncion America/Montevideo " +
    "America/Guayaquil",
};
