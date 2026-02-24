import type { AppLanguage, ExerciseAiInfo } from "../db/types";
import {
  getCanonicalMuscleDetailLabel,
  getCanonicalMuscleLabel,
  type CanonicalMuscleKey
} from "./muscle-taxonomy";

export interface ExerciseCatalogTargetMuscle {
  muscleKey: CanonicalMuscleKey;
  involvementPercent: number;
}

type CoachingProfileKey =
  | "horizontal_press"
  | "incline_press"
  | "decline_press"
  | "chest_fly"
  | "push_up"
  | "dip_chest"
  | "vertical_pull"
  | "horizontal_row"
  | "straight_arm_pull"
  | "shrug"
  | "face_pull"
  | "shoulder_press"
  | "lateral_raise"
  | "rear_delt_raise"
  | "front_raise"
  | "upright_row"
  | "curl"
  | "hammer_curl"
  | "preacher_curl"
  | "triceps_pushdown"
  | "overhead_triceps"
  | "skullcrusher"
  | "dip_triceps"
  | "squat"
  | "leg_press"
  | "lunge"
  | "hip_hinge"
  | "leg_extension"
  | "leg_curl"
  | "hip_thrust"
  | "glute_kickback"
  | "abduction"
  | "adduction"
  | "calf_raise"
  | "tibialis_raise"
  | "back_extension"
  | "crunch"
  | "leg_raise"
  | "plank"
  | "rotation_core";

interface ExerciseCatalogEntry {
  key: string;
  names: { de: string; en: string };
  aliases: string[];
  profile: CoachingProfileKey;
  targetMuscles: ExerciseCatalogTargetMuscle[];
  executionFocus?: { de: string; en: string };
  coachingFocus?: { de: string; en: string };
}

export interface ExerciseCatalogMatch {
  entry: ExerciseCatalogEntry;
  score: number;
  strategy: "exact" | "compact" | "fuzzy";
}

export interface ExerciseCatalogSuggestion {
  key: string;
  label: string;
  score: number;
}

const tm = (muscleKey: CanonicalMuscleKey, involvementPercent: number): ExerciseCatalogTargetMuscle => ({
  muscleKey,
  involvementPercent
});

function ex(
  key: string,
  de: string,
  en: string,
  profile: CoachingProfileKey,
  targetMuscles: ExerciseCatalogTargetMuscle[],
  aliases: string[] = [],
  options: Pick<ExerciseCatalogEntry, "executionFocus" | "coachingFocus"> = {}
): ExerciseCatalogEntry {
  const autoAliases = new Set<string>([
    de,
    en,
    de.replace(/\s*\([^)]*\)/g, "").trim(),
    en.replace(/\s*\([^)]*\)/g, "").trim(),
    en.replace(/-/g, " "),
    ...aliases
  ]);

  return {
    key,
    names: { de, en },
    aliases: [...autoAliases].filter(Boolean),
    profile,
    targetMuscles,
    ...options
  };
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value: string) {
  return normalizeText(value).replace(/\s+/g, "");
}

function tokenize(value: string) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }

  return prev[b.length];
}

function compactSimilarityScore(a: string, b: string) {
  const ac = compactText(a);
  const bc = compactText(b);
  if (!ac || !bc) return 0;

  const maxLen = Math.max(ac.length, bc.length);
  if (maxLen < 5) return 0;

  const distance = levenshteinDistance(ac, bc);
  const normalizedSimilarity = 1 - distance / maxLen;
  if (normalizedSimilarity <= 0) return 0;

  const firstCharBoost = ac[0] === bc[0] ? 0.02 : 0;
  const prefixBoost = (ac.startsWith(bc.slice(0, 4)) || bc.startsWith(ac.slice(0, 4))) ? 0.03 : 0;
  return Math.min(1, normalizedSimilarity + firstCharBoost + prefixBoost);
}

function buildExecutionGuide(profile: CoachingProfileKey, locale: AppLanguage, focus?: string) {
  const de = {
    horizontal_press: "Ziehe die Schulterblätter leicht nach hinten unten, führe die Hantel kontrolliert zur Brust und drücke in einer stabilen Linie nach oben",
    incline_press: "Halte die Schulterblätter stabil, senke kontrolliert zur oberen Brust und drücke aus der Brust in einer gleichmäßigen Bahn nach oben",
    decline_press: "Stabilisiere den Oberkörper, senke kontrolliert zur unteren Brust und drücke ohne Schwung wieder hoch",
    chest_fly: "Behalte einen leichten Ellenbogenwinkel, öffne kontrolliert in einem Bogen und führe die Hände aktiv vor der Brust zusammen",
    push_up: "Halte den Körper als Linie, senke dich kontrolliert ab und drücke dich mit Spannung in Brust, Schulter und Rumpf nach oben",
    dip_chest: "Lehne dich leicht nach vorne, senke kontrolliert ab und drücke dich ohne Schwung wieder hoch",
    vertical_pull: "Ziehe die Schulterblätter nach unten, führe die Ellbogen Richtung Rumpf und kontrolliere die Rückführung vollständig",
    horizontal_row: "Starte mit stolzer Brust, ziehe die Ellbogen aktiv nach hinten und lasse das Gewicht kontrolliert wieder vor", 
    straight_arm_pull: "Halte die Arme fast gestreckt, ziehe aus dem Lat nach unten und vermeide Schwung aus dem Oberkörper",
    shrug: "Ziehe die Schultern kontrolliert nach oben hinten, halte kurz Spannung und senke langsam ab",
    face_pull: "Ziehe auf Gesichtshöhe, führe die Ellbogen nach außen und rotiere die Hände leicht nach hinten",
    shoulder_press: "Spanne Rumpf und Gesäß an, drücke über Kopf ohne Hohlkreuz und senke kontrolliert zurück",
    lateral_raise: "Hebe seitlich mit leicht gebeugten Armen, führe aus der Schulter und stoppe kontrolliert auf Schulterhöhe",
    rear_delt_raise: "Beuge den Oberkörper stabil vor, führe die Arme seitlich nach außen und halte die Spannung in der hinteren Schulter",
    front_raise: "Hebe kontrolliert nach vorne ohne Schwung und senke langsam zurück",
    upright_row: "Ziehe nah am Körper nach oben, führe die Ellbogen an und halte Schultergelenke kontrolliert",
    curl: "Fixiere den Oberarm, beuge im Ellbogen kontrolliert und senke langsam ab",
    hammer_curl: "Halte den neutralen Griff, bewege nur den Unterarm und kontrolliere die exzentrische Phase",
    preacher_curl: "Bleibe mit dem Oberarm stabil auf dem Polster, curl kontrolliert hoch und senke langsam ab",
    triceps_pushdown: "Halte die Oberarme eng am Körper, strecke im Ellbogen nach unten und kontrolliere den Weg zurück",
    overhead_triceps: "Halte die Oberarme stabil über dem Kopf, strecke sauber aus und vermeide Ausweichen im Rücken",
    skullcrusher: "Halte die Oberarme ruhig, senke zur Stirn bzw. hinter den Kopf und strecke kontrolliert aus",
    dip_triceps: "Bleibe aufrecht, halte die Ellbogen relativ eng und drücke dich kontrolliert wieder hoch",
    squat: "Spanne Rumpf an, senke dich kontrolliert über Hüfte und Knie ab und drücke aus dem Mittelfuß nach oben",
    leg_press: "Füße stabil platzieren, kontrolliert ablassen, Knie sauber führen und ohne Abprallen hochdrücken",
    lunge: "Mache einen kontrollierten Schritt, senke mit stabiler Hüfte ab und drücke dich sauber zurück",
    hip_hinge: "Schiebe die Hüfte nach hinten, halte den Rücken neutral und führe die Last nah am Körper",
    leg_extension: "Fixiere die Position, strecke kontrolliert im Knie und senke langsam ab",
    leg_curl: "Halte die Hüfte stabil, beuge kontrolliert im Knie und lass das Gewicht langsam zurück",
    hip_thrust: "Kippe das Becken leicht nach hinten, drücke die Hüfte hoch und halte oben kurz Glute-Spannung",
    glute_kickback: "Stabilisiere den Rumpf, führe das Bein aus dem Gesäß nach hinten und vermeide Hohlkreuz",
    abduction: "Halte Becken und Oberkörper ruhig, drücke kontrolliert nach außen und führe langsam zurück",
    adduction: "Halte Becken stabil, ziehe kontrolliert nach innen und senke langsam zurück",
    calf_raise: "Bewege aus dem Sprunggelenk, gehe kontrolliert in die Dehnung und drücke vollständig hoch",
    tibialis_raise: "Ziehe die Fußspitzen kontrolliert Richtung Schienbein und senke langsam ab",
    back_extension: "Bewege dich aus Hüfte und Rückenstreckern kontrolliert, ohne in die Endposition zu überstrecken",
    crunch: "Rolle den Oberkörper kontrolliert ein, halte Rumpfspannung und senke langsam zurück",
    leg_raise: "Stabilisiere den unteren Rücken, hebe die Beine kontrolliert an und senke langsam ab",
    plank: "Halte eine gerade Linie, spanne Bauch und Gesäß an und atme ruhig weiter",
    rotation_core: "Rotieren kontrolliert aus dem Rumpf, halte die Hüfte stabil und vermeide Schwung"
  } as const;
  const en = {
    horizontal_press: "Set your shoulder blades slightly back and down, lower under control toward the chest, and press up on a stable path",
    incline_press: "Keep your shoulder blades stable, lower to the upper chest with control, and press up smoothly from the chest",
    decline_press: "Brace your torso, lower under control toward the lower chest, and press back up without momentum",
    chest_fly: "Keep a soft bend in the elbows, open in an arc with control, and actively bring the hands together in front of the chest",
    push_up: "Keep your body in one line, lower with control, and press up while keeping chest, shoulders, and core tight",
    dip_chest: "Lean slightly forward, lower under control, and press back up without swinging",
    vertical_pull: "Pull the shoulder blades down, drive the elbows toward the torso, and control the full return",
    horizontal_row: "Start with a proud chest, drive the elbows back, and let the weight travel forward under control",
    straight_arm_pull: "Keep the arms almost straight, pull down from the lats, and avoid torso swing",
    shrug: "Lift the shoulders up and slightly back with control, pause briefly, then lower slowly",
    face_pull: "Pull toward face height, move elbows out, and slightly rotate the hands back",
    shoulder_press: "Brace core and glutes, press overhead without over-arching, and lower under control",
    lateral_raise: "Raise to the side with a soft elbow bend, lead from the shoulder, and stop around shoulder height",
    rear_delt_raise: "Hinge into a stable position, move the arms out to the sides, and keep tension in the rear delts",
    front_raise: "Raise forward under control without swinging and lower slowly",
    upright_row: "Pull close to the body, lead with the elbows, and keep the shoulders controlled",
    curl: "Keep the upper arm fixed, curl with control, and lower slowly",
    hammer_curl: "Use a neutral grip, move only the forearm, and control the eccentric phase",
    preacher_curl: "Keep the upper arm anchored on the pad, curl up with control, and lower slowly",
    triceps_pushdown: "Keep the upper arms close to the body, extend the elbows down, and control the return",
    overhead_triceps: "Keep the upper arms stable overhead, extend cleanly, and avoid compensating through the back",
    skullcrusher: "Keep the upper arms steady, lower toward the forehead or behind the head, and extend with control",
    dip_triceps: "Stay upright, keep the elbows relatively close, and press back up under control",
    squat: "Brace your core, descend through hips and knees with control, and drive up through the midfoot",
    leg_press: "Set your feet firmly, lower under control, track the knees cleanly, and press without bouncing",
    lunge: "Step with control, lower with a stable hip, and drive back cleanly",
    hip_hinge: "Push the hips back, keep a neutral spine, and keep the load close to your body",
    leg_extension: "Lock in your position, extend the knee under control, and lower slowly",
    leg_curl: "Keep the hips stable, flex the knee under control, and return slowly",
    hip_thrust: "Slightly tuck the pelvis, drive the hips up, and pause with glute tension at the top",
    glute_kickback: "Brace your core, move the leg back from the glutes, and avoid over-arching the lower back",
    abduction: "Keep the pelvis and torso steady, press out under control, and return slowly",
    adduction: "Keep the pelvis stable, pull in under control, and return slowly",
    calf_raise: "Move from the ankle, reach a controlled stretch, and press fully up",
    tibialis_raise: "Pull the toes toward the shin with control and lower slowly",
    back_extension: "Move from the hips and spinal erectors under control, without overextending at the top",
    crunch: "Curl the torso in under control, keep core tension, and lower slowly",
    leg_raise: "Stabilize your lower back, raise the legs with control, and lower slowly",
    plank: "Hold a straight line, brace abs and glutes, and breathe steadily",
    rotation_core: "Rotate from the torso with control, keep the hips stable, and avoid momentum"
  } as const;

  const base = locale === "de" ? de[profile] : en[profile];
  if (!focus) return base;
  return locale === "de" ? `${base} Fokus: ${focus}` : `${base} Focus: ${focus}`;
}

function buildCoachingTips(profile: CoachingProfileKey, locale: AppLanguage, focus?: string) {
  const tipsDe: Record<CoachingProfileKey, string[]> = {
    horizontal_press: ["Füße stabil in den Boden drücken", "Handgelenke neutral halten", "Am Umkehrpunkt nicht abprallen"],
    incline_press: ["Bankwinkel moderat halten", "Ellbogen leicht unter der Hantel führen", "Oben die Schultern nicht hochziehen"],
    decline_press: ["Bauch fest halten", "Spannung in der Brust behalten", "Kontrolliert ablassen"],
    chest_fly: ["Nicht zu weit überdehnen", "Bewegung aus der Brust führen", "Gewicht kontrollieren statt schwingen"],
    push_up: ["Körperlinie stabil halten", "Ellbogen kontrolliert führen", "Brust und Bauch gleichzeitig anspannen"],
    dip_chest: ["Leichte Vorneigung beibehalten", "Tiefgang nur schmerzfrei", "Unten nicht federn"],
    vertical_pull: ["Mit den Ellbogen ziehen", "Brust leicht anheben", "Nicht aus dem unteren Rücken schwingen"],
    horizontal_row: ["Schulterblätter aktiv bewegen", "Ellbogenpfad bewusst wählen", "Kein Ruck aus dem Oberkörper"],
    straight_arm_pull: ["Lat-Spannung vor jeder Wdh. aufbauen", "Rumpf ruhig halten", "Arme nicht stark beugen"],
    shrug: ["Keine Rollbewegung nötig", "Oben kurz halten", "Nacken nicht verkrampfen"],
    face_pull: ["Seilenden auseinanderziehen", "Ellbogen hoch führen", "Kontrollierte Rückführung"],
    shoulder_press: ["Rippen unten halten", "Kopf aus der Bahn nehmen und wieder neutral", "Nicht ins Hohlkreuz drücken"],
    lateral_raise: ["Kleine Gewichte sauber bewegen", "Mit Schulter statt Schwung arbeiten", "Handgelenke ruhig halten"],
    rear_delt_raise: ["Brustkorb stabil halten", "Nicht aus dem Trapez ziehen", "Endposition kurz kontrollieren"],
    front_raise: ["Nicht über Schulterhöhe schwingen", "Rumpf stabil halten", "Langsam absenken"],
    upright_row: ["Schmerzfreie Griffbreite wählen", "Schultern kontrolliert halten", "Nicht mit Schwung ziehen"],
    curl: ["Oberarme ruhig lassen", "Vollen Bewegungsumfang nutzen", "Negativphase betonen"],
    hammer_curl: ["Neutralen Griff halten", "Ellbogen am Körper", "Keine Hüftbewegung"],
    preacher_curl: ["Unten nicht komplett entspannen", "Langsam absenken", "Schwung vermeiden"],
    triceps_pushdown: ["Oberarme fixieren", "Unten kurz strecken", "Schultern tief halten"],
    overhead_triceps: ["Ellbogen nicht weit aufspreizen", "Rumpf anspannen", "Volle Streckung sauber kontrollieren"],
    skullcrusher: ["Ellbogen möglichst konstant halten", "Langsam senken", "Gewicht nicht fallen lassen"],
    dip_triceps: ["Ellbogen eher eng halten", "Schultern nicht nach vorn kippen", "Sauber hochdrücken"],
    squat: ["Knie folgen der Fußrichtung", "Rumpfspannung vor jeder Wdh.", "Tempo kontrollieren"],
    leg_press: ["Lendenwirbelsäule stabil halten", "Knie nicht nach innen fallen lassen", "Bewegung vollständig kontrollieren"],
    lunge: ["Schrittweite passend wählen", "Vorderes Knie stabil führen", "Becken gerade halten"],
    hip_hinge: ["Hüfte aktiv nach hinten schieben", "Rücken neutral halten", "Nahe am Körper bleiben"],
    leg_extension: ["Ohne Schwung strecken", "Oben kurz Spannung halten", "Langsam absenken"],
    leg_curl: ["Hüfte am Polster lassen", "Volle Beugung nutzen", "Negativphase kontrollieren"],
    hip_thrust: ["Über die Ferse drücken", "Rippen unten halten", "Oben Gesäß bewusst anspannen"],
    glute_kickback: ["Becken nicht verdrehen", "Aus dem Gesäß arbeiten", "Rumpfspannung halten"],
    abduction: ["Nicht mit Schwung öffnen", "Becken stabil halten", "Außenposition kurz kontrollieren"],
    adduction: ["Kontrolliert zusammenführen", "Keine Hüftrotation", "Rückweg langsam"],
    calf_raise: ["Volle Dehnung nutzen", "Oben komplett strecken", "Tempo konstant halten"],
    tibialis_raise: ["Fußspitzen aktiv hochziehen", "Schienbeinspannung halten", "Langsam absenken"],
    back_extension: ["Nicht überstrecken", "Bewegung aus Hüfte/Rückenstreckern", "Tempo kontrolliert"],
    crunch: ["Rippen Richtung Becken rollen", "Nacken entspannt halten", "Nicht am Kopf ziehen"],
    leg_raise: ["Lendenwirbelsäule stabilisieren", "Langsam absenken", "Beine nicht schwingen"],
    plank: ["Gesäß nicht zu hoch/tief", "Bauch fest anspannen", "Ruhe im Atem halten"],
    rotation_core: ["Aus dem Rumpf rotieren", "Hüfte ruhig halten", "Kontrollierte Endposition"]
  };
  const tipsEn: Record<CoachingProfileKey, string[]> = {
    horizontal_press: ["Drive your feet into the floor", "Keep wrists neutral", "Do not bounce at the bottom"],
    incline_press: ["Use a moderate bench angle", "Keep elbows under the load", "Do not shrug at the top"],
    decline_press: ["Keep your core braced", "Maintain chest tension", "Lower with control"],
    chest_fly: ["Do not overstretch", "Lead the movement from the chest", "Control the weight instead of swinging"],
    push_up: ["Keep a stable body line", "Control elbow path", "Brace chest and core together"],
    dip_chest: ["Keep a slight forward lean", "Only use pain-free depth", "Do not bounce at the bottom"],
    vertical_pull: ["Lead with the elbows", "Lift the chest slightly", "Do not swing through the lower back"],
    horizontal_row: ["Move the shoulder blades actively", "Choose an intentional elbow path", "No jerking from the torso"],
    straight_arm_pull: ["Set lat tension before each rep", "Keep the torso quiet", "Avoid bending the elbows too much"],
    shrug: ["No shoulder roll needed", "Pause briefly at the top", "Do not tense the neck excessively"],
    face_pull: ["Pull the rope ends apart", "Drive elbows high", "Control the return"],
    shoulder_press: ["Keep ribs down", "Move the head around the bar path", "Avoid over-arching"],
    lateral_raise: ["Use manageable weights", "Lead from the shoulder, not momentum", "Keep wrists quiet"],
    rear_delt_raise: ["Keep the torso stable", "Do not dominate with upper traps", "Control the end position"],
    front_raise: ["Do not swing above shoulder height", "Keep the torso stable", "Lower slowly"],
    upright_row: ["Use a pain-free grip width", "Keep shoulders controlled", "Do not yank the weight"],
    curl: ["Keep upper arms still", "Use full range of motion", "Emphasize the lowering phase"],
    hammer_curl: ["Keep a neutral grip", "Keep elbows near the torso", "No hip drive"],
    preacher_curl: ["Do not fully relax at the bottom", "Lower slowly", "Avoid momentum"],
    triceps_pushdown: ["Fix the upper arms", "Lock out briefly at the bottom", "Keep shoulders down"],
    overhead_triceps: ["Do not flare elbows too much", "Brace your core", "Control full extension"],
    skullcrusher: ["Keep elbows as steady as possible", "Lower slowly", "Do not drop the weight"],
    dip_triceps: ["Keep elbows relatively close", "Do not dump the shoulders forward", "Press up cleanly"],
    squat: ["Track knees with the feet", "Brace before each rep", "Control the tempo"],
    leg_press: ["Keep lower back stable", "Do not let knees cave in", "Control the full movement"],
    lunge: ["Choose a suitable step length", "Track the front knee well", "Keep pelvis level"],
    hip_hinge: ["Push the hips back", "Keep a neutral spine", "Keep the load close"],
    leg_extension: ["Extend without swinging", "Pause briefly at the top", "Lower slowly"],
    leg_curl: ["Keep hips on the pad", "Use full knee flexion", "Control the eccentric"],
    hip_thrust: ["Drive through the heel", "Keep ribs down", "Squeeze glutes at the top"],
    glute_kickback: ["Do not rotate the pelvis", "Move from the glutes", "Keep core tension"],
    abduction: ["Do not open with momentum", "Keep pelvis stable", "Control the outer position"],
    adduction: ["Pull in under control", "Avoid hip rotation", "Slow return"],
    calf_raise: ["Use a full stretch", "Fully extend at the top", "Keep a steady tempo"],
    tibialis_raise: ["Actively pull toes up", "Keep shin tension", "Lower slowly"],
    back_extension: ["Do not overextend", "Move through hips/spinal erectors", "Use controlled tempo"],
    crunch: ["Curl ribs toward the pelvis", "Keep the neck relaxed", "Do not pull on the head"],
    leg_raise: ["Stabilize the lower back", "Lower slowly", "Do not swing the legs"],
    plank: ["Do not let hips rise or sag", "Brace abs hard", "Keep your breathing calm"],
    rotation_core: ["Rotate from the torso", "Keep hips stable", "Control the end range"]
  };

  const tips = (locale === "de" ? tipsDe : tipsEn)[profile].slice(0, 3);
  if (!focus) return tips;
  return [...tips, locale === "de" ? `Achte besonders auf: ${focus}` : `Pay extra attention to: ${focus}`].slice(0, 4);
}

function buildExerciseInfo(entry: ExerciseCatalogEntry, locale: AppLanguage): ExerciseAiInfo {
  return {
    targetMuscles: entry.targetMuscles.map((target) => ({
      muscleKey: target.muscleKey,
      muscle: getCanonicalMuscleLabel(target.muscleKey, locale),
      involvementPercent: target.involvementPercent
    })),
    executionGuide: buildExecutionGuide(entry.profile, locale, entry.executionFocus?.[locale]),
    coachingTips: buildCoachingTips(entry.profile, locale, entry.coachingFocus?.[locale]),
    generatedAt: new Date().toISOString(),
    sourceProvider: "local-catalog",
    sourceModel: "exercise-catalog-v1"
  };
}

// Target presets
const TARGETS = {
  benchFlat: [tm("mid_chest", 55), tm("anterior_delts", 20), tm("triceps_lateral_head", 15), tm("triceps_long_head", 10)],
  benchIncline: [tm("upper_chest", 45), tm("anterior_delts", 30), tm("triceps_lateral_head", 15), tm("triceps_long_head", 10)],
  benchDecline: [tm("lower_chest", 50), tm("mid_chest", 20), tm("triceps_lateral_head", 20), tm("anterior_delts", 10)],
  flyChest: [tm("mid_chest", 65), tm("upper_chest", 20), tm("serratus_anterior", 10), tm("anterior_delts", 5)],
  dipChest: [tm("lower_chest", 40), tm("mid_chest", 20), tm("triceps_long_head", 20), tm("anterior_delts", 20)],
  pushUp: [tm("mid_chest", 40), tm("anterior_delts", 25), tm("triceps_lateral_head", 20), tm("rectus_abdominis", 15)],
  latPull: [tm("latissimus_dorsi", 55), tm("teres_major", 15), tm("biceps_brachii", 15), tm("brachialis", 10), tm("mid_traps", 5)],
  row: [tm("latissimus_dorsi", 35), tm("teres_major", 10), tm("mid_traps", 20), tm("rear_delts", 15), tm("biceps_brachii", 10), tm("brachialis", 10)],
  straightArmPull: [tm("latissimus_dorsi", 70), tm("teres_major", 15), tm("serratus_anterior", 10), tm("rectus_abdominis", 5)],
  shrug: [tm("upper_traps", 70), tm("mid_traps", 20), tm("forearm_flexors", 10)],
  facePull: [tm("rear_delts", 40), tm("mid_traps", 25), tm("lower_traps", 15), tm("rotator_cuff", 20)],
  shoulderPress: [tm("anterior_delts", 35), tm("medial_delts", 35), tm("triceps_long_head", 15), tm("triceps_lateral_head", 10), tm("rectus_abdominis", 5)],
  lateralRaise: [tm("medial_delts", 70), tm("upper_traps", 20), tm("anterior_delts", 10)],
  rearDeltRaise: [tm("rear_delts", 60), tm("mid_traps", 20), tm("lower_traps", 10), tm("rotator_cuff", 10)],
  frontRaise: [tm("anterior_delts", 65), tm("upper_chest", 15), tm("upper_traps", 10), tm("rectus_abdominis", 10)],
  uprightRow: [tm("upper_traps", 35), tm("medial_delts", 35), tm("anterior_delts", 20), tm("forearm_flexors", 10)],
  curl: [tm("biceps_brachii", 55), tm("brachialis", 25), tm("brachioradialis", 20)],
  hammerCurl: [tm("brachialis", 40), tm("brachioradialis", 35), tm("biceps_brachii", 25)],
  preacherCurl: [tm("biceps_brachii", 60), tm("brachialis", 25), tm("brachioradialis", 15)],
  tricepsPushdown: [tm("triceps_lateral_head", 40), tm("triceps_long_head", 35), tm("triceps_medial_head", 25)],
  overheadTriceps: [tm("triceps_long_head", 55), tm("triceps_lateral_head", 25), tm("triceps_medial_head", 20)],
  skullcrusher: [tm("triceps_long_head", 45), tm("triceps_lateral_head", 30), tm("triceps_medial_head", 25)],
  dipTriceps: [tm("triceps_lateral_head", 35), tm("triceps_long_head", 30), tm("triceps_medial_head", 20), tm("anterior_delts", 15)],
  squat: [tm("rectus_femoris", 25), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("gluteus_maximus", 20), tm("erector_spinae", 10)],
  frontSquat: [tm("rectus_femoris", 30), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("vastus_intermedius", 15), tm("rectus_abdominis", 10)],
  legPress: [tm("rectus_femoris", 25), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("gluteus_maximus", 20), tm("biceps_femoris", 10)],
  lunge: [tm("gluteus_maximus", 25), tm("rectus_femoris", 20), tm("vastus_lateralis", 20), tm("vastus_medialis", 15), tm("biceps_femoris", 10), tm("gluteus_medius", 10)],
  hinge: [tm("gluteus_maximus", 30), tm("biceps_femoris", 20), tm("semitendinosus", 15), tm("semimembranosus", 15), tm("erector_spinae", 15), tm("forearm_flexors", 5)],
  legExtension: [tm("rectus_femoris", 30), tm("vastus_lateralis", 25), tm("vastus_medialis", 25), tm("vastus_intermedius", 20)],
  legCurl: [tm("biceps_femoris", 40), tm("semitendinosus", 30), tm("semimembranosus", 20), tm("gastrocnemius", 10)],
  hipThrust: [tm("gluteus_maximus", 60), tm("gluteus_medius", 15), tm("biceps_femoris", 15), tm("erector_spinae", 10)],
  gluteKickback: [tm("gluteus_maximus", 70), tm("gluteus_medius", 15), tm("biceps_femoris", 10), tm("erector_spinae", 5)],
  abduction: [tm("gluteus_medius", 45), tm("gluteus_minimus", 30), tm("abductors", 25)],
  adduction: [tm("adductors", 80), tm("gluteus_maximus", 10), tm("rectus_abdominis", 10)],
  calfRaise: [tm("gastrocnemius", 65), tm("soleus", 35)],
  seatedCalfRaise: [tm("soleus", 65), tm("gastrocnemius", 35)],
  tibRaise: [tm("tibialis_anterior", 85), tm("rectus_abdominis", 15)],
  backExtension: [tm("erector_spinae", 45), tm("gluteus_maximus", 25), tm("biceps_femoris", 20), tm("rectus_abdominis", 10)],
  crunch: [tm("rectus_abdominis", 70), tm("transversus_abdominis", 15), tm("external_obliques", 10), tm("internal_obliques", 5)],
  legRaise: [tm("rectus_abdominis", 40), tm("transversus_abdominis", 25), tm("iliopsoas", 25), tm("external_obliques", 10)],
  plank: [tm("transversus_abdominis", 35), tm("rectus_abdominis", 25), tm("external_obliques", 15), tm("internal_obliques", 15), tm("gluteus_maximus", 10)],
  rotationCore: [tm("external_obliques", 40), tm("internal_obliques", 30), tm("rectus_abdominis", 20), tm("transversus_abdominis", 10)]
} as const;

const catalog: ExerciseCatalogEntry[] = [
  // Chest (18)
  ex("barbell_bench_press", "Bankdrücken (Langhantel)", "Barbell Bench Press", "horizontal_press", [...TARGETS.benchFlat], ["bench press", "flat bench"]),
  ex("dumbbell_bench_press", "Bankdrücken (Kurzhantel)", "Dumbbell Bench Press", "horizontal_press", [...TARGETS.benchFlat], ["db bench press"]),
  ex("smith_bench_press", "Bankdrücken (Smith Machine)", "Smith Machine Bench Press", "horizontal_press", [...TARGETS.benchFlat], ["smith bench"]),
  ex("machine_chest_press", "Brustpresse (Maschine)", "Machine Chest Press", "horizontal_press", [...TARGETS.benchFlat], ["chest press machine"]),
  ex("incline_barbell_bench_press", "Schrägbankdrücken (Langhantel)", "Incline Barbell Bench Press", "incline_press", [...TARGETS.benchIncline], ["incline bench"]),
  ex("incline_dumbbell_bench_press", "Schrägbankdrücken (Kurzhantel)", "Incline Dumbbell Bench Press", "incline_press", [...TARGETS.benchIncline], ["incline db bench"]),
  ex("incline_machine_chest_press", "Schrägbank Brustpresse (Maschine)", "Incline Machine Chest Press", "incline_press", [...TARGETS.benchIncline]),
  ex("decline_bench_press", "Negativbankdrücken", "Decline Bench Press", "decline_press", [...TARGETS.benchDecline]),
  ex("push_up", "Liegestütz", "Push-Up", "push_up", [...TARGETS.pushUp], ["pushup"]),
  ex("weighted_push_up", "Liegestütz (mit Gewicht)", "Weighted Push-Up", "push_up", [...TARGETS.pushUp]),
  ex("assisted_push_up", "Liegestütz (erhöht/assistiert)", "Assisted Push-Up", "push_up", [...TARGETS.pushUp], ["incline push up", "incline push-up"]),
  ex("chest_dips", "Dips (Brustfokus)", "Chest Dips", "dip_chest", [...TARGETS.dipChest], ["forward lean dips"]),
  ex("pec_deck_fly", "Butterfly (Pec Deck)", "Pec Deck Fly", "chest_fly", [...TARGETS.flyChest], ["pec deck", "butterfly machine"]),
  ex("cable_fly_mid", "Cable Fly (mittlere Brust)", "Cable Fly (Mid Chest)", "chest_fly", [...TARGETS.flyChest]),
  ex("cable_fly_high_to_low", "Cable Fly (oben nach unten)", "Cable Fly (High to Low)", "chest_fly", [tm("lower_chest", 45), tm("mid_chest", 25), tm("serratus_anterior", 15), tm("anterior_delts", 15)]),
  ex("cable_fly_low_to_high", "Cable Fly (unten nach oben)", "Cable Fly (Low to High)", "chest_fly", [tm("upper_chest", 45), tm("mid_chest", 25), tm("serratus_anterior", 15), tm("anterior_delts", 15)]),
  ex("dumbbell_fly", "Kurzhantel Fly", "Dumbbell Fly", "chest_fly", [...TARGETS.flyChest]),
  ex("dumbbell_squeeze_press", "Squeeze Press (Kurzhantel)", "Dumbbell Squeeze Press", "horizontal_press", [tm("mid_chest", 60), tm("triceps_lateral_head", 15), tm("anterior_delts", 15), tm("serratus_anterior", 10)]),

  // Back / Lats / Traps (20)
  ex("lat_pulldown_wide", "Latzug (breit)", "Wide-Grip Lat Pulldown", "vertical_pull", [...TARGETS.latPull], ["lat pulldown", "wide lat pulldown", "lat pull down"]),
  ex("lat_pulldown_close", "Latzug (eng)", "Close-Grip Lat Pulldown", "vertical_pull", [...TARGETS.latPull], ["close lat pulldown"]),
  ex("lat_pulldown_neutral", "Latzug (Neutralgriff)", "Neutral-Grip Lat Pulldown", "vertical_pull", [...TARGETS.latPull]),
  ex("pull_up", "Klimmzug", "Pull-Up", "vertical_pull", [...TARGETS.latPull], ["pullup"]),
  ex("chin_up", "Chin-Up", "Chin-Up", "vertical_pull", [tm("latissimus_dorsi", 45), tm("biceps_brachii", 25), tm("brachialis", 15), tm("teres_major", 10), tm("mid_traps", 5)], ["chinup"]),
  ex("assisted_pull_up", "Klimmzug (assistiert)", "Assisted Pull-Up", "vertical_pull", [...TARGETS.latPull], ["assisted pullup"]),
  ex("seated_cable_row", "Sitzendes Kabelrudern", "Seated Cable Row", "horizontal_row", [...TARGETS.row], ["cable row", "seated row"]),
  ex("machine_row", "Rudern (Maschine)", "Machine Row", "horizontal_row", [...TARGETS.row], ["row machine"]),
  ex("chest_supported_row", "Chest-Supported Row", "Chest-Supported Row", "horizontal_row", [...TARGETS.row], ["seal row machine"]),
  ex("one_arm_dumbbell_row", "Einarmiges Kurzhantelrudern", "One-Arm Dumbbell Row", "horizontal_row", [...TARGETS.row], ["1 arm dumbbell row"]),
  ex("barbell_row", "Langhantelrudern", "Barbell Row", "horizontal_row", [...TARGETS.row], ["bent over row", "barbell bent-over row"]),
  ex("t_bar_row", "T-Bar Rudern", "T-Bar Row", "horizontal_row", [...TARGETS.row]),
  ex("high_row_machine", "High Row (Maschine)", "High Row Machine", "horizontal_row", [tm("latissimus_dorsi", 30), tm("teres_major", 15), tm("mid_traps", 25), tm("rear_delts", 15), tm("biceps_brachii", 15)]),
  ex("straight_arm_pulldown", "Überzüge am Kabel (gerade Arme)", "Straight-Arm Pulldown", "straight_arm_pull", [...TARGETS.straightArmPull], ["cable pullover"]),
  ex("dumbbell_pullover", "Kurzhantel Pullover", "Dumbbell Pullover", "straight_arm_pull", [tm("latissimus_dorsi", 45), tm("upper_chest", 20), tm("serratus_anterior", 20), tm("triceps_long_head", 15)]),
  ex("face_pull", "Face Pull", "Face Pull", "face_pull", [...TARGETS.facePull]),
  ex("barbell_shrug", "Shrugs (Langhantel)", "Barbell Shrug", "shrug", [...TARGETS.shrug]),
  ex("dumbbell_shrug", "Shrugs (Kurzhantel)", "Dumbbell Shrug", "shrug", [...TARGETS.shrug]),
  ex("reverse_pec_deck", "Reverse Pec Deck", "Reverse Pec Deck", "rear_delt_raise", [...TARGETS.rearDeltRaise], ["rear delt machine"]),
  ex("rack_pull", "Rack Pull", "Rack Pull", "hip_hinge", [tm("erector_spinae", 30), tm("upper_traps", 25), tm("mid_traps", 15), tm("gluteus_maximus", 15), tm("biceps_femoris", 10), tm("forearm_flexors", 5)]),

  // Shoulders (18)
  ex("barbell_overhead_press", "Schulterdrücken (Langhantel)", "Barbell Overhead Press", "shoulder_press", [...TARGETS.shoulderPress], ["military press", "ohp"]),
  ex("dumbbell_shoulder_press", "Schulterdrücken (Kurzhantel)", "Dumbbell Shoulder Press", "shoulder_press", [...TARGETS.shoulderPress], ["db shoulder press"]),
  ex("machine_shoulder_press", "Schulterpresse (Maschine)", "Machine Shoulder Press", "shoulder_press", [...TARGETS.shoulderPress]),
  ex("arnold_press", "Arnold Press", "Arnold Press", "shoulder_press", [tm("anterior_delts", 40), tm("medial_delts", 30), tm("triceps_long_head", 15), tm("triceps_lateral_head", 10), tm("rotator_cuff", 5)]),
  ex("dumbbell_lateral_raise", "Seitheben (Kurzhantel)", "Dumbbell Lateral Raise", "lateral_raise", [...TARGETS.lateralRaise], ["lateral raise", "side lateral raise"]),
  ex("cable_lateral_raise", "Seitheben (Kabel)", "Cable Lateral Raise", "lateral_raise", [...TARGETS.lateralRaise]),
  ex("machine_lateral_raise", "Seitheben (Maschine)", "Machine Lateral Raise", "lateral_raise", [...TARGETS.lateralRaise]),
  ex("lean_away_cable_lateral_raise", "Seitheben Kabel (lean-away)", "Lean-Away Cable Lateral Raise", "lateral_raise", [tm("medial_delts", 75), tm("anterior_delts", 10), tm("upper_traps", 15)]),
  ex("rear_delt_fly_dumbbell", "Reverse Fly (Kurzhantel)", "Dumbbell Rear Delt Fly", "rear_delt_raise", [...TARGETS.rearDeltRaise]),
  ex("rear_delt_fly_cable", "Reverse Fly (Kabel)", "Cable Rear Delt Fly", "rear_delt_raise", [...TARGETS.rearDeltRaise]),
  ex("rear_delt_row", "Rear Delt Row", "Rear Delt Row", "rear_delt_raise", [tm("rear_delts", 45), tm("mid_traps", 25), tm("upper_traps", 10), tm("biceps_brachii", 10), tm("rotator_cuff", 10)]),
  ex("front_raise_dumbbell", "Frontheben (Kurzhantel)", "Dumbbell Front Raise", "front_raise", [...TARGETS.frontRaise], ["front raise"]),
  ex("front_raise_cable", "Frontheben (Kabel)", "Cable Front Raise", "front_raise", [...TARGETS.frontRaise]),
  ex("upright_row_barbell", "Aufrechtes Rudern (Langhantel)", "Barbell Upright Row", "upright_row", [...TARGETS.uprightRow], ["upright row"]),
  ex("upright_row_cable", "Aufrechtes Rudern (Kabel)", "Cable Upright Row", "upright_row", [...TARGETS.uprightRow]),
  ex("landmine_press", "Landmine Press", "Landmine Press", "shoulder_press", [tm("anterior_delts", 40), tm("upper_chest", 25), tm("medial_delts", 15), tm("triceps_lateral_head", 10), tm("rectus_abdominis", 10)]),
  ex("y_raise", "Y-Raise", "Y-Raise", "rear_delt_raise", [tm("lower_traps", 30), tm("rear_delts", 30), tm("mid_traps", 20), tm("rotator_cuff", 20)]),
  ex("cuban_press", "Cuban Press", "Cuban Press", "shoulder_press", [tm("rotator_cuff", 35), tm("medial_delts", 25), tm("rear_delts", 20), tm("anterior_delts", 20)]),

  // Arms (20)
  ex("barbell_curl", "Bizepscurls (Langhantel)", "Barbell Curl", "curl", [...TARGETS.curl], ["biceps curl"]),
  ex("ez_bar_curl", "Bizepscurls (EZ-Stange)", "EZ-Bar Curl", "curl", [...TARGETS.curl], ["ez curl"]),
  ex("dumbbell_curl", "Bizepscurls (Kurzhantel)", "Dumbbell Curl", "curl", [...TARGETS.curl], ["db curl"]),
  ex("alternating_dumbbell_curl", "Alternierende Bizepscurls", "Alternating Dumbbell Curl", "curl", [...TARGETS.curl]),
  ex("incline_dumbbell_curl", "Schrägbank Bizepscurls", "Incline Dumbbell Curl", "curl", [...TARGETS.curl]),
  ex("concentration_curl", "Konzentrationscurl", "Concentration Curl", "curl", [...TARGETS.curl]),
  ex("preacher_curl_ez", "Preacher Curl (EZ)", "EZ Preacher Curl", "preacher_curl", [...TARGETS.preacherCurl]),
  ex("preacher_curl_machine", "Preacher Curl (Maschine)", "Preacher Curl Machine", "preacher_curl", [...TARGETS.preacherCurl]),
  ex("cable_curl", "Bizepscurls (Kabel)", "Cable Curl", "curl", [...TARGETS.curl]),
  ex("hammer_curl_dumbbell", "Hammer Curls (Kurzhantel)", "Dumbbell Hammer Curl", "hammer_curl", [...TARGETS.hammerCurl], ["hammer curls"]),
  ex("hammer_curl_rope", "Hammer Curls (Seil am Kabel)", "Rope Hammer Curl", "hammer_curl", [...TARGETS.hammerCurl], ["rope hammer curl"]),
  ex("triceps_pushdown_bar", "Trizepsdrücken (Stange)", "Bar Triceps Pushdown", "triceps_pushdown", [...TARGETS.tricepsPushdown], ["triceps pushdown"]),
  ex("triceps_pushdown_rope", "Trizepsdrücken (Seil)", "Rope Triceps Pushdown", "triceps_pushdown", [...TARGETS.tricepsPushdown], ["rope pushdown"]),
  ex("overhead_triceps_extension_cable", "Überkopf Trizepsstrecken (Kabel)", "Overhead Cable Triceps Extension", "overhead_triceps", [...TARGETS.overheadTriceps]),
  ex("overhead_triceps_extension_db", "Überkopf Trizepsstrecken (Kurzhantel)", "Dumbbell Overhead Triceps Extension", "overhead_triceps", [...TARGETS.overheadTriceps]),
  ex("skullcrusher_ez", "Skullcrusher (EZ-Stange)", "EZ-Bar Skullcrusher", "skullcrusher", [...TARGETS.skullcrusher]),
  ex("lying_triceps_extension_db", "Liegendes Trizepsstrecken (Kurzhantel)", "Dumbbell Lying Triceps Extension", "skullcrusher", [...TARGETS.skullcrusher]),
  ex("close_grip_bench_press", "Enges Bankdrücken", "Close-Grip Bench Press", "horizontal_press", [tm("triceps_lateral_head", 30), tm("triceps_long_head", 25), tm("triceps_medial_head", 20), tm("mid_chest", 15), tm("anterior_delts", 10)]),
  ex("triceps_dips", "Dips (Trizepsfokus)", "Triceps Dips", "dip_triceps", [...TARGETS.dipTriceps], ["bench dips", "upright dips"]),
  ex("wrist_curl", "Handgelenkcurl", "Wrist Curl", "curl", [tm("forearm_flexors", 75), tm("forearm_extensors", 10), tm("brachioradialis", 15)], ["forearm curl"]),

  // Legs (24)
  ex("back_squat", "Kniebeuge (Langhantel)", "Barbell Back Squat", "squat", [...TARGETS.squat], ["barbell squat"]),
  ex("front_squat", "Front Squat", "Front Squat", "squat", [...TARGETS.frontSquat]),
  ex("goblet_squat", "Goblet Squat", "Goblet Squat", "squat", [...TARGETS.frontSquat]),
  ex("smith_squat", "Kniebeuge (Smith Machine)", "Smith Machine Squat", "squat", [...TARGETS.squat], ["smith squat"]),
  ex("hack_squat", "Hack Squat", "Hack Squat", "squat", [tm("rectus_femoris", 30), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("vastus_intermedius", 15), tm("gluteus_maximus", 10)]),
  ex("leg_press", "Beinpresse", "Leg Press", "leg_press", [...TARGETS.legPress]),
  ex("bulgarian_split_squat", "Bulgarian Split Squat", "Bulgarian Split Squat", "lunge", [...TARGETS.lunge]),
  ex("reverse_lunge", "Reverse Lunge", "Reverse Lunge", "lunge", [...TARGETS.lunge]),
  ex("walking_lunge", "Walking Lunge", "Walking Lunge", "lunge", [...TARGETS.lunge]),
  ex("step_up", "Step-Up", "Step-Up", "lunge", [tm("gluteus_maximus", 25), tm("rectus_femoris", 20), tm("vastus_lateralis", 20), tm("vastus_medialis", 15), tm("gluteus_medius", 10), tm("biceps_femoris", 10)]),
  ex("romanian_deadlift", "Rumänisches Kreuzheben", "Romanian Deadlift", "hip_hinge", [...TARGETS.hinge], ["rdl"]),
  ex("stiff_leg_deadlift", "Steifbein-Kreuzheben", "Stiff-Leg Deadlift", "hip_hinge", [...TARGETS.hinge]),
  ex("deadlift", "Kreuzheben", "Deadlift", "hip_hinge", [tm("gluteus_maximus", 25), tm("biceps_femoris", 15), tm("semitendinosus", 10), tm("semimembranosus", 10), tm("erector_spinae", 20), tm("upper_traps", 10), tm("mid_traps", 5), tm("forearm_flexors", 5)]),
  ex("sumo_deadlift", "Sumo-Kreuzheben", "Sumo Deadlift", "hip_hinge", [tm("gluteus_maximus", 25), tm("adductors", 20), tm("rectus_femoris", 15), tm("vastus_lateralis", 10), tm("biceps_femoris", 10), tm("erector_spinae", 15), tm("forearm_flexors", 5)]),
  ex("good_morning", "Good Morning", "Good Morning", "hip_hinge", [tm("erector_spinae", 30), tm("gluteus_maximus", 25), tm("biceps_femoris", 20), tm("semitendinosus", 15), tm("semimembranosus", 10)]),
  ex("leg_extension", "Beinstrecker", "Leg Extension", "leg_extension", [...TARGETS.legExtension]),
  ex("lying_leg_curl", "Beinbeuger liegend", "Lying Leg Curl", "leg_curl", [...TARGETS.legCurl]),
  ex("seated_leg_curl", "Beinbeuger sitzend", "Seated Leg Curl", "leg_curl", [...TARGETS.legCurl]),
  ex("standing_leg_curl", "Beinbeuger stehend", "Standing Leg Curl", "leg_curl", [...TARGETS.legCurl]),
  ex("hip_thrust", "Hip Thrust", "Hip Thrust", "hip_thrust", [...TARGETS.hipThrust]),
  ex("glute_bridge", "Glute Bridge", "Glute Bridge", "hip_thrust", [...TARGETS.hipThrust]),
  ex("cable_glute_kickback", "Glute Kickback (Kabel)", "Cable Glute Kickback", "glute_kickback", [...TARGETS.gluteKickback], ["glute kickback"]),
  ex("hip_abduction_machine", "Abduktion (Maschine)", "Hip Abduction Machine", "abduction", [...TARGETS.abduction]),
  ex("hip_adduction_machine", "Adduktion (Maschine)", "Hip Adduction Machine", "adduction", [...TARGETS.adduction]),

  // Lower legs + tibialis (6)
  ex("standing_calf_raise", "Wadenheben stehend", "Standing Calf Raise", "calf_raise", [...TARGETS.calfRaise]),
  ex("seated_calf_raise", "Wadenheben sitzend", "Seated Calf Raise", "calf_raise", [...TARGETS.seatedCalfRaise]),
  ex("leg_press_calf_raise", "Wadenheben an der Beinpresse", "Leg Press Calf Raise", "calf_raise", [...TARGETS.calfRaise]),
  ex("smith_calf_raise", "Wadenheben (Smith Machine)", "Smith Machine Calf Raise", "calf_raise", [...TARGETS.calfRaise]),
  ex("donkey_calf_raise", "Donkey Calf Raise", "Donkey Calf Raise", "calf_raise", [...TARGETS.calfRaise]),
  ex("tibialis_raise", "Tibialis Raise", "Tibialis Raise", "tibialis_raise", [...TARGETS.tibRaise]),

  // Core / lower back (14)
  ex("back_extension", "Hyperextensions / Rückenstrecker", "Back Extension", "back_extension", [...TARGETS.backExtension], ["hyperextension", "roman chair back extension"]),
  ex("machine_crunch", "Bauchmaschine Crunch", "Machine Crunch", "crunch", [...TARGETS.crunch], ["ab crunch machine"]),
  ex("cable_crunch", "Cable Crunch", "Cable Crunch", "crunch", [...TARGETS.crunch]),
  ex("floor_crunch", "Crunch", "Crunch", "crunch", [...TARGETS.crunch]),
  ex("reverse_crunch", "Reverse Crunch", "Reverse Crunch", "crunch", [tm("rectus_abdominis", 45), tm("transversus_abdominis", 20), tm("external_obliques", 15), tm("internal_obliques", 10), tm("iliopsoas", 10)]),
  ex("hanging_knee_raise", "Hängendes Knieheben", "Hanging Knee Raise", "leg_raise", [...TARGETS.legRaise]),
  ex("hanging_leg_raise", "Hängendes Beinheben", "Hanging Leg Raise", "leg_raise", [tm("rectus_abdominis", 35), tm("transversus_abdominis", 20), tm("iliopsoas", 30), tm("external_obliques", 10), tm("internal_obliques", 5)]),
  ex("captains_chair_leg_raise", "Leg Raise (Captain's Chair)", "Captain's Chair Leg Raise", "leg_raise", [...TARGETS.legRaise]),
  ex("ab_wheel_rollout", "Ab Wheel Rollout", "Ab Wheel Rollout", "plank", [tm("transversus_abdominis", 30), tm("rectus_abdominis", 25), tm("external_obliques", 15), tm("internal_obliques", 10), tm("lower_traps", 10), tm("serratus_anterior", 10)]),
  ex("plank", "Plank", "Plank", "plank", [...TARGETS.plank]),
  ex("side_plank", "Side Plank", "Side Plank", "plank", [tm("external_obliques", 35), tm("internal_obliques", 25), tm("transversus_abdominis", 20), tm("rectus_abdominis", 10), tm("gluteus_medius", 10)]),
  ex("dead_bug", "Dead Bug", "Dead Bug", "plank", [tm("transversus_abdominis", 35), tm("rectus_abdominis", 25), tm("internal_obliques", 15), tm("external_obliques", 15), tm("iliopsoas", 10)]),
  ex("russian_twist", "Russian Twist", "Russian Twist", "rotation_core", [...TARGETS.rotationCore]),
  ex("woodchopper_cable", "Cable Woodchopper", "Cable Woodchopper", "rotation_core", [tm("external_obliques", 35), tm("internal_obliques", 25), tm("rectus_abdominis", 15), tm("transversus_abdominis", 10), tm("serratus_anterior", 15)])
];

// Add extra common machine/isolation variants to reach a broader phase-1 coverage (~100 entries)
const EXTRA_VARIANTS: ExerciseCatalogEntry[] = [
  ex("smith_incline_press", "Schrägbankdrücken (Smith Machine)", "Smith Machine Incline Press", "incline_press", [...TARGETS.benchIncline]),
  ex("crossover_press", "Kabel Brustpresse (stehend)", "Standing Cable Chest Press", "horizontal_press", [...TARGETS.benchFlat]),
  ex("underhand_lat_pulldown", "Latzug (Untergriff)", "Underhand Lat Pulldown", "vertical_pull", [...TARGETS.latPull]),
  ex("single_arm_lat_pulldown", "Einarmiger Latzug", "Single-Arm Lat Pulldown", "vertical_pull", [...TARGETS.latPull]),
  ex("single_arm_cable_row", "Einarmiges Kabelrudern", "Single-Arm Cable Row", "horizontal_row", [...TARGETS.row]),
  ex("meadows_row", "Meadows Row", "Meadows Row", "horizontal_row", [...TARGETS.row]),
  ex("dumbbell_shoulder_press_seated", "Schulterdrücken sitzend (Kurzhantel)", "Seated Dumbbell Shoulder Press", "shoulder_press", [...TARGETS.shoulderPress]),
  ex("machine_rear_delt_fly", "Rear Delt Fly (Maschine)", "Machine Rear Delt Fly", "rear_delt_raise", [...TARGETS.rearDeltRaise]),
  ex("cable_front_raise_single", "Einarmiges Frontheben (Kabel)", "Single-Arm Cable Front Raise", "front_raise", [...TARGETS.frontRaise]),
  ex("reverse_grip_curl", "Reverse Curl", "Reverse Curl", "hammer_curl", [tm("brachioradialis", 40), tm("forearm_extensors", 35), tm("biceps_brachii", 15), tm("brachialis", 10)]),
  ex("cable_preacher_curl", "Preacher Curl (Kabel)", "Cable Preacher Curl", "preacher_curl", [...TARGETS.preacherCurl]),
  ex("rope_overhead_triceps_extension", "Überkopf Trizepsstrecken (Seil)", "Rope Overhead Triceps Extension", "overhead_triceps", [...TARGETS.overheadTriceps]),
  ex("single_arm_pushdown", "Einarmiges Trizepsdrücken", "Single-Arm Triceps Pushdown", "triceps_pushdown", [...TARGETS.tricepsPushdown]),
  ex("hack_squat_machine", "Hack Squat (Maschine)", "Hack Squat Machine", "squat", [tm("rectus_femoris", 30), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("vastus_intermedius", 15), tm("gluteus_maximus", 10)]),
  ex("split_squat", "Split Squat", "Split Squat", "lunge", [...TARGETS.lunge]),
  ex("curtsy_lunge", "Curtsy Lunge", "Curtsy Lunge", "lunge", [tm("gluteus_medius", 25), tm("gluteus_maximus", 25), tm("adductors", 20), tm("rectus_femoris", 15), tm("vastus_medialis", 15)]),
  ex("romanian_deadlift_dumbbell", "Rumänisches Kreuzheben (Kurzhantel)", "Dumbbell Romanian Deadlift", "hip_hinge", [...TARGETS.hinge]),
  ex("cable_pull_through", "Cable Pull-Through", "Cable Pull-Through", "hip_hinge", [tm("gluteus_maximus", 45), tm("biceps_femoris", 20), tm("semitendinosus", 15), tm("semimembranosus", 10), tm("erector_spinae", 10)]),
  ex("single_leg_leg_extension", "Einbeiniger Beinstrecker", "Single-Leg Leg Extension", "leg_extension", [...TARGETS.legExtension]),
  ex("single_leg_leg_curl", "Einbeiniger Beinbeuger", "Single-Leg Leg Curl", "leg_curl", [...TARGETS.legCurl])
];

export const EXERCISE_CATALOG: ExerciseCatalogEntry[] = [...catalog, ...EXTRA_VARIANTS];

const exactAliasIndex = new Map<string, ExerciseCatalogEntry>();
const compactAliasIndex = new Map<string, ExerciseCatalogEntry>();

for (const entry of EXERCISE_CATALOG) {
  for (const alias of entry.aliases) {
    const normalized = normalizeText(alias);
    const compact = compactText(alias);
    if (normalized && !exactAliasIndex.has(normalized)) {
      exactAliasIndex.set(normalized, entry);
    }
    if (compact && !compactAliasIndex.has(compact)) {
      compactAliasIndex.set(compact, entry);
    }
  }
}

export function matchExerciseCatalogEntry(inputName: string): ExerciseCatalogMatch | null {
  const normalized = normalizeText(inputName);
  if (!normalized) return null;
  const compactInput = compactText(inputName);

  const exact = exactAliasIndex.get(normalized);
  if (exact) {
    return { entry: exact, score: 1, strategy: "exact" };
  }

  const compact = compactAliasIndex.get(compactInput);
  if (compact) {
    return { entry: compact, score: 0.98, strategy: "compact" };
  }

  const inputTokens = new Set(tokenize(inputName));
  if (inputTokens.size === 0) return null;

  let best: ExerciseCatalogMatch | null = null;
  for (const entry of EXERCISE_CATALOG) {
    let bestAliasScore = 0;
    for (const alias of entry.aliases) {
      const aliasTokens = new Set(tokenize(alias));
      if (aliasTokens.size === 0) continue;
      let overlap = 0;
      for (const token of inputTokens) {
        if (aliasTokens.has(token)) overlap += 1;
      }
      const jaccard = overlap / new Set([...inputTokens, ...aliasTokens]).size;
      const normalizedAlias = normalizeText(alias);
      const containsBoost = normalizedAlias.includes(normalized) || normalized.includes(normalizedAlias) ? 0.08 : 0;
      const tokenScore = jaccard + containsBoost;
      const charScore = compactInput ? compactSimilarityScore(alias, compactInput) : 0;
      const score = Math.max(tokenScore, charScore);
      if (score > bestAliasScore) bestAliasScore = score;
    }

    if (bestAliasScore >= 0.62 && (!best || bestAliasScore > best.score)) {
      best = { entry, score: bestAliasScore, strategy: "fuzzy" };
    }
  }

  return best;
}

export function getExerciseCatalogSuggestions(
  inputName: string,
  locale: AppLanguage,
  options: { limit?: number; minScore?: number } = {}
): ExerciseCatalogSuggestion[] {
  const normalized = normalizeText(inputName);
  if (!normalized) return [];

  const compactInput = compactText(inputName);
  const inputTokens = new Set(tokenize(inputName));
  const limit = Math.max(1, Math.min(12, options.limit ?? 6));
  const minScore = options.minScore ?? 0.45;
  const ranked: Array<{ entry: ExerciseCatalogEntry; score: number }> = [];

  for (const entry of EXERCISE_CATALOG) {
    let bestAliasScore = 0;
    for (const alias of entry.aliases) {
      const aliasTokens = new Set(tokenize(alias));
      let tokenScore = 0;
      if (inputTokens.size > 0 && aliasTokens.size > 0) {
        let overlap = 0;
        for (const token of inputTokens) {
          if (aliasTokens.has(token)) overlap += 1;
        }
        const jaccard = overlap / new Set([...inputTokens, ...aliasTokens]).size;
        const normalizedAlias = normalizeText(alias);
        const containsBoost = normalizedAlias.includes(normalized) || normalized.includes(normalizedAlias) ? 0.08 : 0;
        tokenScore = jaccard + containsBoost;
      }
      const charScore = compactInput ? compactSimilarityScore(alias, compactInput) : 0;
      const score = Math.max(tokenScore, charScore);
      if (score > bestAliasScore) bestAliasScore = score;
    }

    if (bestAliasScore >= minScore) {
      ranked.push({ entry, score: bestAliasScore });
    }
  }

  ranked.sort((a, b) => b.score - a.score);

  const seenLabels = new Set<string>();
  const suggestions: ExerciseCatalogSuggestion[] = [];
  for (const item of ranked) {
    const label = item.entry.names[locale];
    const dedupeKey = normalizeText(label);
    if (!dedupeKey || seenLabels.has(dedupeKey)) {
      continue;
    }
    seenLabels.add(dedupeKey);
    suggestions.push({
      key: item.entry.key,
      label,
      score: Math.max(0, Math.min(1, item.score))
    });
    if (suggestions.length >= limit) {
      break;
    }
  }

  return suggestions;
}

export function buildExerciseInfoForMatch(match: ExerciseCatalogMatch, locale: AppLanguage, inputName: string) {
  const info = buildExerciseInfo(match.entry, locale);
  return {
    inputName,
    targetMuscles: info.targetMuscles,
    executionGuide: info.executionGuide,
    coachingTips: info.coachingTips,
    matchedExerciseName: match.entry.names[locale],
    matchedExerciseKey: match.entry.key,
    matchScore: match.score,
    matchStrategy: match.strategy
  };
}
