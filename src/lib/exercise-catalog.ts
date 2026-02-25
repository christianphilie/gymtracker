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
  | "rotation_core"
  | "farmers_carry";

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
  const de: Record<CoachingProfileKey, string> = {
    // Chest
    horizontal_press:
      "Schulterblätter zurück und runter anspannen, Ellbogen ca. 45–60° vom Rumpf abwinkeln (nicht senkrecht seitlich). Kontrolliert zur Brust absenken bis der Oberarm parallel zum Boden ist, dann mit Bodenpressung durch die Fersen kraftvoll hochdrücken",
    incline_press:
      "Bankwinkel 30–45° wählen, Schulterblätter fest nach hinten unten ziehen. Ellbogen unterhalb der Hantelstange halten und zur oberen Brust (nicht zum Kinn) absenken – aus der oberen Brust herausdrücken und oben die Schultern nicht hochziehen",
    decline_press:
      "Oberkörper sicher fixieren, Schulterblätter zurück und unten. Kontrolliert zur unteren Brust absenken, dabei Spannung in der Brust behalten und ohne Abprallen oder Schwung hochdrücken",
    chest_fly:
      "Leichten Ellbogenwinkel konstant halten (keine vollständige Streckung). Arme in einem weiten Bogen öffnen bis leichte Dehnung spürbar – nicht überdehnen. Hände aktiv vor der Brust zusammenführen und dabei die Brustmuskeln bewusst einrollen",
    push_up:
      "Körper als steife Linie halten (Bauch und Gesäß anspannen), Hände ca. schulterbreit, Ellbogen 45° vom Rumpf. Kontrolliert absenken bis Brust fast den Boden berührt und mit Volldruck hochdrücken",
    dip_chest:
      "Oberkörper bewusst nach vorne lehnen (ca. 20–30°), Schulterblätter zurück und runter. Kontrolliert bis unter Schulterniveau absenken, unten nicht federn und gleichmäßig hochdrücken",
    // Back
    vertical_pull:
      "Schulterblätter zuerst nach unten ziehen, dann erst Ellbogen einsetzen (Reihenfolge entscheidend). Brust leicht nach vorne heben und Richtung Stange führen. Gleichmäßig bis zum Kinn oder Brustbein ziehen, dann vollständig kontrolliert zurückführen",
    horizontal_row:
      "Brust aufrecht halten (stolze Brust), Rumpf leicht vorgespannt. Ellbogen bewusst nach hinten ziehen – nicht nach außen aufspreizen. Am Endpunkt Schulterblätter kurz zusammendrücken und das Gewicht kontrolliert wieder nach vorne führen",
    straight_arm_pull:
      "Arme fast vollständig gestreckt halten (leichte Beugung erlaubt). Vor jeder Wiederholung Lat-Spannung aufbauen, dann aus dem Latissimus nach unten ziehen ohne Oberkörperschwung. Arme in einem Bogen bis zur Hüfte führen",
    shrug:
      "Schultern kontrolliert vertikal nach oben hinten führen (keine Rollbewegung nötig). Oben kurz Spannung halten, dann langsam und kontrolliert absenken. Nacken entspannt halten",
    face_pull:
      "Kabel auf Gesichtshöhe oder leicht darüber. Ellbogen weit nach außen und oben führen, Hände dabei Richtung Ohren ziehen und leicht nach hinten rotieren. Rumpf ruhig halten und langsam zurückführen",
    // Shoulders
    shoulder_press:
      "Rumpf und Gesäß vor dem Drücken anspannen, Rippen geschlossen halten. Stange oder Hanteln auf Schulterniveau starten, vertikal nach oben drücken und Kopf kurz aus der Bahn nehmen (bei Stange). Oben vollständig strecken ohne Hohlkreuz",
    lateral_raise:
      "Arm ca. 30° vor der Körperfrontalebene führen (nicht exakt seitlich), Daumen leicht nach unten drehen (Pronation) für saubere Deltaroid-Isolation. Aus dem Schultergelenk heben, nicht zucken. Kontrolliert bis auf Schulterhöhe führen – nicht höher",
    rear_delt_raise:
      "Oberkörper stabil nach vorne beugen (Hüftgelenk, nicht Wirbelsäule), Blick bodenwärts. Arme in einem weiten Bogen seitlich nach hinten oben führen und dabei Spannung in der hinteren Schulter spüren. Keine Trapez-Dominanz – aus dem hinteren Delt führen",
    front_raise:
      "Aus der Schulter heraus nach vorne und oben führen, keine Hüftunterstützung. Tempo kontrollieren, besonders in der exzentrischen Phase. Nicht über Schulterhöhe schwingen – Obere Brust und Trapez sollen minimal mitarbeiten",
    upright_row:
      "Griff mindestens schulterbreit wählen (enger Griff erhöht Impingement-Risiko). Stange nah am Körper nach oben ziehen, Ellbogen führen die Bewegung. Schultergelenke kontrolliert halten – nicht ins Impingement-Muster ziehen",
    // Arms
    curl:
      "Oberarme vollständig fixieren – am Körper oder auf dem Polster. Volle Streckung in der Ausgangsposition nutzen (maximaler Bewegungsumfang). Beim Curlen Handfläche supinieren (nach außen drehen) für maximale Bizepsaktivierung. Exzentrisch 2–3 Sekunden kontrolliert absenken",
    hammer_curl:
      "Neutralen Griff (Daumen oben) über die gesamte Bewegung beibehalten. Nur der Unterarm bewegt sich – Oberarm bleibt ruhig am Rumpf. Kontrolliert hoch- und langsam absenken. Kein Hüftschwung",
    preacher_curl:
      "Oberarm vollständig auf dem Polster auflegen und dort fixiert halten. Unten nicht komplett entspannen – kurz vor vollständiger Streckung stoppen. Kontrolliert zur Schulter curlen und langsam 2–3 Sekunden absenken",
    triceps_pushdown:
      "Oberarme fest am Körper fixieren – sie dürfen nicht nach vorne schwingen. Ellbogen nach unten strecken und unten kurz Spannung halten (Lock-out). Schultern tief und ruhig lassen, Handgelenke neutral",
    overhead_triceps:
      "Ellbogen eng nach oben halten und nicht nach außen aufspreizen. Becken stabilisieren um Hohlkreuz zu vermeiden. Langen Trizepskopf durch vollständige Streckung maximal beanspruchen – das ist die einzige Übung, die den langen Kopf in gestreckter Position arbeiten lässt",
    skullcrusher:
      "Oberarme senkrecht zur Decke halten und möglichst konstant lassen. Ellbogen kontrolliert beugen, Hantelstange zur Stirn oder leicht hinter den Kopf führen. Langsam absenken (2–3 Sek.) und kontrolliert strecken – kein Fallen lassen",
    dip_triceps:
      "Oberkörper aufrecht halten (Vorneigung = Brustfokus). Ellbogen relativ eng führen, nicht nach außen aufspreizen. Gleichmäßig und kontrolliert hochdrücken – kein Schwung aus den Beinen",
    // Legs
    squat:
      "Rumpf fest anspannen (wie eine Schraube), Knie in Zehenrichtung führen. Gewicht über dem Mittelfuß halten, Fersen am Boden. Hüfte und Knie gleichzeitig hoch treiben – vermeiden, Rücken zu strecken bevor die Hüfte folgt. Volle Tiefe (parallel oder tiefer) wenn Mobilität es erlaubt",
    leg_press:
      "Füße hüftbreit platzieren, Lendenwirbelsäule am Polster halten. Kontrolliert ablassen bis Knie ca. 90° Beugung erreichen, Knie in Zehenrichtung führen. Ohne Abprallen gleichmäßig hochdrücken – nicht im letzten Viertel der Bewegung einrasten lassen",
    lunge:
      "Kontrollierten Schritt nach vorne oder hinten, Oberkörper aufrecht. Beide Knie beugen gleichzeitig – vorderes Knie über dem Fuß, nicht darüber hinaus. Mit Fersendruck am vorderen Bein hochdrücken und Becken gerade halten",
    hip_hinge:
      "Hüfte aktiv zurückschieben bevor der Oberkörper sich beugt – Gewicht liegt im Anfang hinten. Lendenwirbelsäule neutral halten (kein Rundrücken). Stange oder Last bleibt nah am Körper. Bewegung kommt aus der Hüftstreckung – nicht aus dem Aufrichten des Rückens",
    leg_extension:
      "Position an der Maschine sauber einstellen (Achse auf Kniehöhe). Ohne Schwung strecken und oben 1–2 Sekunden halten. Langsam 2–3 Sekunden absenken. Rücken bleibt am Polster",
    leg_curl:
      "Hüfte fest am Polster fixieren – kein Hohlkreuz entstehen lassen. Fußspitzen leicht nach oben ziehen (Dorsalflexion) für erhöhte Hamstring-Spannung. Vollständig beugen, dann exzentrisch 2–3 Sekunden kontrolliert zurück",
    hip_thrust:
      "Schulterblätter auf der Bank abstützen, Füße hüftbreit. Becken posterior tilten (Schambein Richtung Rippen) vor dem Hochdrücken. Durch die Fersen Hüfte explosiv nach oben drücken, oben Gesäß maximal anspannen und Knie stabil halten – Rippen bleiben geschlossen",
    glute_kickback:
      "Rumpf stabilisieren, Hüfte gerade halten. Bein aus dem Gesäß nach hinten oben führen – nicht aus dem Rücken. Beckenknochen gerade halten, keine Seitwärtsneigung. Am Endpunkt kurz Glute anspannen",
    abduction:
      "Becken und Oberkörper ruhig halten, keine Seitwärtsbewegung der Hüfte. Bein kontrolliert nach außen führen und am Endpunkt kurz halten. Langsam und kontrolliert zurück – kein Fallen lassen",
    adduction:
      "Becken stabil halten, keine Rotation in der Hüfte. Beine kontrolliert zusammenführen und Adduktoren bewusst anspannen. Langsam und kontrolliert zum Startpunkt zurück",
    // Lower legs / core
    calf_raise:
      "Vollständig in die Dehnung absenken (Ferse unter Zehenebene wenn möglich). Aus dem Sprunggelenk drücken – nicht aus dem Knie. Oben vollständig strecken und kurz halten. Tempo gleichmäßig und kontrolliert",
    tibialis_raise:
      "Ferse aufgestützt oder Last an der Unterschenkelfront. Fußspitzen kontrolliert maximal Richtung Schienbein ziehen und kurz oben halten. Langsam 2–3 Sekunden absenken. Schienbeinmuskel ist schwach – kleine Gewichte reichen",
    back_extension:
      "Aus Hüftgelenk und Rückenstreckern heraus kontrolliert bewegen. Oberkörper in etwa parallel zum Boden senken und wieder aufrichten – nicht überstrecken in der Endposition. Ganzen Rücken neutral halten, kein Rundrücken am unteren Umkehrpunkt",
    crunch:
      "Rippen Richtung Becken einrollen (Wirbelsäulenflexion), nicht Kopf zum Knie ziehen. Nacken entspannt, kein Ziehen am Kopf. Oben kurz Spannung halten, dann langsam und kontrolliert absenken – Rücken berührt den Boden in der exzentrischen Phase nicht vollständig entspannen",
    leg_raise:
      "Lendenwirbelsäule während der gesamten Bewegung am Boden halten. Beine kontrolliert anheben, kurz halten und langsam absenken ohne zu schwingen. Bei Schwäche Knie leicht beugen",
    plank:
      "Körper als gerade Linie halten – Hüfte nicht zu hoch oder zu tief. Bauch maximal anspannen (als würde ein Schlag kommen), Gesäß anspannen, Schulterblätter stabil. Ruhig atmen ohne die Spannung zu verlieren",
    rotation_core:
      "Rotation kommt aus dem Rumpf – Hüfte bleibt stabil und zeigt nach vorne. Bewegung kontrolliert ausführen, keine Ausholbewegung oder Schwung. Endposition kurz halten für maximale Aktivierung der Obliquen",
    farmers_carry:
      "Gewicht in beiden Händen neutral halten, Schulterblätter zurückgezogen, Rumpf fest anspannen. Aufrecht gehen mit gleichmäßigem Schritttempo. Hüfte nicht wackeln, Blick gerade nach vorne"
  } as const;

  const en: Record<CoachingProfileKey, string> = {
    horizontal_press:
      "Retract and depress the shoulder blades, angle elbows about 45–60° from the torso (not straight out to the sides). Lower under control until the upper arm is roughly parallel to the floor, then press powerfully with leg drive through the floor",
    incline_press:
      "Set the bench to 30–45°, firmly retract the shoulder blades. Keep elbows under the barbell and lower to the upper chest — not to the chin. Press from the upper chest and avoid shrugging at the top",
    decline_press:
      "Secure the torso, retract and depress shoulder blades. Lower under control to the lower chest keeping tension throughout — press back up without bouncing or momentum",
    chest_fly:
      "Maintain a constant soft elbow bend (never fully straight). Open in a wide arc until you feel a slight stretch — do not overstretch. Actively bring the hands together in front of the chest and consciously engage the pecs at the top",
    push_up:
      "Keep the body rigid as one straight line (brace abs and glutes), hands roughly shoulder-width, elbows at 45° from the torso. Lower with control until the chest nearly touches the floor, then press up with full force",
    dip_chest:
      "Lean the torso forward deliberately (≈20–30°), retract and depress the shoulder blades. Lower under control to below shoulder level — do not bounce at the bottom, press back up evenly",
    vertical_pull:
      "Initiate by pulling shoulder blades down first, then drive the elbows — sequence is key. Lift the chest slightly forward and up toward the bar. Pull until the bar reaches chin or chest height, then return fully under control",
    horizontal_row:
      "Start with a proud chest and lightly braced torso. Drive the elbows straight back — do not flare them wide. Briefly squeeze the shoulder blades together at the end position and return the weight forward under full control",
    straight_arm_pull:
      "Keep arms almost straight with just a slight elbow bend. Build lat tension before each rep, then pull down from the lats in an arc to the hips. Avoid any torso swing or momentum",
    shrug:
      "Lift the shoulders vertically upward and slightly back — no shoulder roll needed. Pause briefly at the top, then lower slowly and under control. Keep the neck relaxed",
    face_pull:
      "Set cable at face height or slightly above. Drive elbows wide and upward while pulling the hands toward the ears and rotating them slightly back. Keep the torso still and control the return",
    shoulder_press:
      "Brace core and glutes before pressing, keep ribs closed. Start with bar or dumbbells at shoulder level, press straight overhead and move the head around the bar path (barbell). Fully lock out at the top without over-arching the lower back",
    lateral_raise:
      "Lead the arm approximately 30° in front of the frontal plane (not directly to the side), rotate the thumb slightly downward (pronation) for cleaner medial delt isolation. Lift from the shoulder joint — no shrug or momentum. Stop at shoulder height",
    rear_delt_raise:
      "Hinge at the hips to a stable forward lean, gaze toward the floor. Arc the arms wide and back, feeling tension specifically in the rear delts. Avoid letting the upper traps dominate — the movement should come from the posterior deltoid",
    front_raise:
      "Lift forward and upward from the shoulder — no hip drive or swing. Control the tempo especially on the way down. Stop at shoulder height and avoid letting the upper chest or traps take over",
    upright_row:
      "Use a grip at least shoulder-width wide (narrow grips increase impingement risk). Pull the bar close to the body, leading with the elbows. Keep the shoulder joints under control — avoid forcing them into an impingement pattern",
    curl:
      "Keep the upper arms completely fixed — against the torso or on a pad. Use a full stretch at the starting position. Supinate (rotate the palm upward) as you curl for maximum biceps activation. Take 2–3 seconds on the lowering phase",
    hammer_curl:
      "Maintain the neutral (thumb-up) grip throughout. Only the forearm moves — upper arm stays quiet against the torso. Control upward and lower slowly. No hip drive",
    preacher_curl:
      "Anchor the entire upper arm on the pad and keep it there. Stop just before full extension at the bottom — do not fully relax. Curl up under control and lower slowly for 2–3 seconds",
    triceps_pushdown:
      "Pin the upper arms to the torso — they must not swing forward. Extend the elbows fully downward and hold briefly at lockout. Keep shoulders down and wrists neutral",
    overhead_triceps:
      "Keep elbows pointing straight up — do not flare them outward. Brace the pelvis to prevent lower back arching. Fully extend to maximally load the long head of the triceps — this is the only position where the long head works at full stretch",
    skullcrusher:
      "Hold the upper arms vertical and keep them as steady as possible. Bend the elbows to lower the bar toward the forehead or behind the head. Take 2–3 seconds on the descent and extend with control — never drop the weight",
    dip_triceps:
      "Keep the torso upright (forward lean shifts focus to the chest). Keep elbows relatively close — do not let them flare wide. Press back up cleanly under control, no leg swing",
    squat:
      "Brace the entire torso hard (like a screw), track knees with the toes. Keep weight over the midfoot, heels flat on the floor. Drive hips and knees up simultaneously — avoid the hips rising faster than the torso. Aim for parallel or below if mobility allows",
    leg_press:
      "Place feet hip-width apart, keep the lower back against the pad. Lower under control to about 90° of knee flexion, tracking the knees with the toes. Press back up without bouncing — do not lock out aggressively at the top",
    lunge:
      "Step forward or back with control, keep the torso upright. Both knees bend simultaneously — front knee stays over the foot. Drive up through the heel of the front foot and keep the pelvis level",
    hip_hinge:
      "Push the hips back before the torso bends — load moves to the posterior chain immediately. Keep the lumbar spine neutral (no rounding). Keep the bar or load close to the body. Drive the movement through hip extension — not by straightening the spine first",
    leg_extension:
      "Set the machine correctly (pivot axis at knee height). Extend without any swing and hold at the top for 1–2 seconds. Lower slowly for 2–3 seconds. Keep the back against the pad",
    leg_curl:
      "Pin the hips to the pad — do not let the lower back arch. Dorsiflex your feet slightly (toes up) to increase hamstring tension. Flex fully under control, then take 2–3 seconds to return",
    hip_thrust:
      "Brace the upper back on the bench, feet hip-width. Posterior tilt the pelvis (pull the pubic bone toward the ribs) before driving up. Press through the heels, squeeze the glutes hard at the top — keep the ribs closed and the knees stable",
    glute_kickback:
      "Brace the core and keep the pelvis square. Drive the leg back and slightly upward from the glutes — not from the lower back. No lateral hip shift. Briefly squeeze the glute at the end position",
    abduction:
      "Keep the pelvis and torso completely still — no lateral tilt. Press the leg out under control and hold briefly at the end. Return slowly — do not let it drop back",
    adduction:
      "Keep the pelvis stable with no hip rotation. Pull the legs together under control and consciously engage the adductors. Return slowly to the start position",
    calf_raise:
      "Lower fully into a stretch (heel below toe level if possible). Press from the ankle joint — not the knee. Fully extend at the top and hold briefly. Keep tempo even and controlled",
    tibialis_raise:
      "Support the heel on a surface or load on the shin. Pull the toes maximally toward the shin and hold briefly at the top. Lower slowly over 2–3 seconds. The tibialis is a small muscle — light loads are sufficient",
    back_extension:
      "Move from the hip joint and spinal erectors. Lower the torso to roughly parallel and extend back — do not overextend at the top. Maintain a neutral spine throughout; avoid rounding at the bottom",
    crunch:
      "Curl the ribs toward the pelvis (spinal flexion) — do not pull the head to the knees. Neck relaxed, no pulling on the head. Hold briefly at the top, then lower slowly — do not fully relax at the bottom",
    leg_raise:
      "Keep the lower back pressed to the floor throughout. Raise legs with control, hold briefly, and lower slowly without swinging. Bend the knees slightly if needed",
    plank:
      "Hold the body as one straight line — hips not too high or too low. Brace the abs hard (as if bracing for a punch), squeeze the glutes, stabilize the shoulder blades. Breathe steadily without losing tension",
    rotation_core:
      "Rotate from the torso — the hips stay forward and stable. No wind-up or momentum. Hold the end position briefly for maximum oblique activation",
    farmers_carry:
      "Hold weight at neutral grip with shoulder blades retracted and core braced. Walk upright at a controlled pace. No hip sway, gaze straight ahead"
  } as const;

  const base = locale === "de" ? de[profile] : en[profile];
  if (!focus) return base;
  return locale === "de" ? `${base} Fokus: ${focus}` : `${base} Focus: ${focus}`;
}

function buildCoachingTips(profile: CoachingProfileKey, locale: AppLanguage, focus?: string) {
  const tipsDe: Record<CoachingProfileKey, string[]> = {
    horizontal_press: [
      "Ellbogen nicht senkrecht zur Seite öffnen – 45–60° Abstand schützt die Schulter",
      "Rücken fest in die Bank drücken und Bodenpressung durch die Fersen aufbauen",
      "Am Umkehrpunkt kurz pausieren statt abprallen lassen"
    ],
    incline_press: [
      "Bankwinkel über 45° verlagert den Fokus von der Brust auf die Schulter – 30–45° ist der Sweet Spot",
      "Ellbogen unter der Hantel führen, nicht senkrecht nach außen",
      "Oben die Schultern nicht hochziehen – Schulterblätter bleiben unten"
    ],
    decline_press: [
      "Bauch anspannen und Oberkörper fixieren – kein Aufrichten durch Schwung",
      "Ellbogen leicht angewinkelt halten für Schultergesundheit",
      "Exzentrisch kontrolliert ablassen – Negativphase betonen"
    ],
    chest_fly: [
      "Nicht vollständig strecken – den leichten Ellbogenwinkel konstant halten",
      "Bewegung kommt aus der Brust, nicht aus einem Schwung der Arme",
      "Gewicht klein wählen: bei Flies geht Kontrolle vor Last"
    ],
    push_up: [
      "Körperlinie als Einheit halten – Hüfte weder zu hoch noch zu tief",
      "Hände leicht auswärts drehen für bessere Schultergesundheit",
      "Langsam absenken (2–3 Sek.), explosiv hochdrücken"
    ],
    dip_chest: [
      "Vorneigung konstant halten – aufrechtes Kommen verschiebt den Fokus auf den Trizeps",
      "Tiefgang schmerz- und schulterfreundlich wählen: unter Schulterniveau reicht",
      "Unten nicht federn – Kontrolle im Umkehrpunkt"
    ],
    vertical_pull: [
      "Schulterblätter runterziehen bevor die Arme folgen – Reihenfolge ist entscheidend",
      "Brust zur Stange führen, nicht Kinn",
      "Negativphase 2–3 Sekunden kontrollieren – dort wächst die Kraft"
    ],
    horizontal_row: [
      "Schulterblätter aktiv bewegen – nicht nur mit den Armen ziehen",
      "Ellbogen nach hinten, nicht nach außen – definiert ob Lat oder Trapez dominiert",
      "Kein Ruck aus dem Oberkörper – Tempo kontrollieren"
    ],
    straight_arm_pull: [
      "Lat-Spannung vor jeder Wiederholung aktiv aufbauen",
      "Arme fast gestreckt halten – kein Curl-Effekt",
      "Rumpf ruhig halten – keine Oberkörperbewegung"
    ],
    shrug: [
      "Keine Rollbewegung mit den Schultern – rein vertikale Bewegung",
      "Oben kurz halten (1–2 Sek.) für bessere Muskelkontrolle",
      "Nacken nicht anspannen – obere Trapezmuskeln isoliert arbeiten lassen"
    ],
    face_pull: [
      "Seilenden auseinanderziehen – Spannung bleibt hoch",
      "Ellbogen hoch und weit nach außen führen – nicht tief und eng",
      "Face Pull ist Prävention: Rotationsmanschette und hintere Schulter stärken"
    ],
    shoulder_press: [
      "Rippen unten halten – kein Hohlkreuz durch Ausweichen",
      "Kopf kurz aus der Bahn nehmen (Langhantel), dann wieder neutral",
      "Rumpf und Gesäß anspannen vor jedem Rep – verhindert Ausweichen im Rücken"
    ],
    lateral_raise: [
      "Arm 30° vor der Körperfrontalebene führen – spart die Schulter und trifft besser den mittleren Delt",
      "Daumen leicht nach unten drehen (Pronation) – erzeugt sauberere Delt-Isolation",
      "Gewicht bewusst klein halten und Ego ausschalten – 5–10 kg reichen für saubere Arbeit"
    ],
    rear_delt_raise: [
      "Nicht aus dem Trapez zucken – Bewegung kommt ausschließlich aus der hinteren Schulter",
      "Endposition 1–2 Sekunden kontrollieren",
      "Leichte Pronation (Daumen runter) oder neutrale Position – kein Supinieren"
    ],
    front_raise: [
      "Nicht über Schulterhöhe schwingen – maximale Aktivierung liegt unterhalb",
      "Kein Hüftschwung – die vorderen Deltas sollen arbeiten",
      "Langsam absenken (3 Sek.) – exzentrische Phase nutzen"
    ],
    upright_row: [
      "Schmerzfreie Griffbreite wählen – enger Griff erhöht das Impingement-Risiko erheblich",
      "Ellbogen führen die Bewegung – Hände kommen hinterher",
      "Nicht mit Schwung ziehen – Trapez und Schulter sauber einsetzen"
    ],
    curl: [
      "Handflächen beim Curlen nach außen drehen (Supination) für maximale Bizepsaktivierung",
      "Vollen Bewegungsumfang nutzen – unten vollständig strecken",
      "Negativphase 2–3 Sekunden betonen – mehr Hypertrophie-Reiz"
    ],
    hammer_curl: [
      "Neutralen Griff halten – keine Supination beim Hochführen",
      "Ellbogen ruhig am Körper – keine Schulterunterstützung",
      "Brachialis und Brachioradialis werden hier besser aktiviert als beim normalen Curl"
    ],
    preacher_curl: [
      "Unten nicht komplett entspannen – kurz vor vollständiger Streckung stoppen",
      "Langsam absenken – am Preacher Curl ist der Reiz bei kurzer Muskellänge hoch",
      "Schwung vermeiden – der Pad übernimmt die Stabilisierung, nicht der Körper"
    ],
    triceps_pushdown: [
      "Oberarme am Körper fixieren – kein Schwingen nach vorne",
      "Unten kurz Lock-out halten (1 Sek.) für maximale Trizepskontraktion",
      "Schultern tief halten – kein Hochziehen"
    ],
    overhead_triceps: [
      "Ellbogen nicht zu weit aufspreizen – höchstens schulterbreit",
      "Rumpf und Beckenboden anspannen um Hohlkreuz zu vermeiden",
      "Volle Streckung anstreben – nur so wird der lange Kopf maximal beansprucht"
    ],
    skullcrusher: [
      "Ellbogen möglichst konstant halten – kein Hin- und Herwandern",
      "Langsam ablassen (2–3 Sek.) – Kontrolle schützt den Ellbogen",
      "Gewicht nicht fallen lassen – Sicherheit zuerst"
    ],
    dip_triceps: [
      "Ellbogen relativ eng halten – Aufspreizen verlagert Last auf die Brust",
      "Schultern nicht nach vorne kippen – aufrechter Oberkörper bleibt konstant",
      "Sauber hochdrücken – kein Schwung aus den Beinen"
    ],
    squat: [
      "Knie folgen exakt der Zehenrichtung – kein Valgus (Einknicken nach innen)",
      "Rumpfspannung aufbauen vor jedem Rep – Bauch und Rücken gemeinsam",
      "Hüfte und Knie gleichzeitig hochdrücken – kein Guten-Morgen-Effekt"
    ],
    leg_press: [
      "Lendenwirbelsäule am Polster lassen – keine Rollbewegung des Beckens",
      "Knie nicht nach innen fallen lassen – aktiver Außendruck durch die Füße",
      "Letztes Viertel der Bewegung kontrollieren – nicht einrasten lassen"
    ],
    lunge: [
      "Schrittweite so wählen, dass Oberschenkel und Schienbein im vorderen Bein ca. 90° erreichen",
      "Vorderes Knie nicht über die Zehe hinausschieben",
      "Becken gerade und stabil – keine Seitwärtsbewegung der Hüfte"
    ],
    hip_hinge: [
      "Hüfte aktiv zurückschieben – nicht einfach nach vorne beugen",
      "Rücken neutral halten – kein Rundrücken im Lendenbereich",
      "Last bleibt nah am Körper – Stange schleift fast am Schienbein"
    ],
    leg_extension: [
      "Ohne Schwung strecken – kein Reißen aus dem Sitzen",
      "Oben 1–2 Sekunden Spannung halten für maximale Quadrizepskontraktion",
      "Langsam absenken – exzentrische Kontrolle schützt das Knie"
    ],
    leg_curl: [
      "Fußspitzen leicht nach oben ziehen (Dorsalflexion) erhöht die Hamstring-Spannung messbar",
      "Hüfte am Polster lassen – kein Bogen nach oben",
      "Exzentrisch 2–3 Sekunden kontrollieren – der wichtigste Teil der Bewegung"
    ],
    hip_thrust: [
      "Über die Fersen drücken – nicht über die Zehen",
      "Rippen unten halten – kein Hohlkreuz am oberen Umkehrpunkt",
      "Oben 1–2 Sekunden Gesäß maximal anspannen"
    ],
    glute_kickback: [
      "Becken nicht verdrehen oder kippen – sauber gerade halten",
      "Aus dem Gesäß arbeiten, nicht aus dem Rücken – Fokus liegt auf dem Gluteus Maximus",
      "Rumpfspannung konstant halten"
    ],
    abduction: [
      "Nicht mit Schwung öffnen – kontrollierte Bewegung aus dem Gesäßmedius",
      "Becken stabil halten – kein Seitwärtskippen",
      "Außenposition kurz kontrollieren (1 Sek.) bevor zurück"
    ],
    adduction: [
      "Kontrolliert zusammenführen – kein Fallen lassen",
      "Keine Hüftrotation – Adduktoren isoliert einsetzen",
      "Rückweg langsam und kontrolliert"
    ],
    calf_raise: [
      "Volle Dehnung unten nutzen – das ist der wichtigste Teil der Bewegung",
      "Oben vollständig strecken und kurz halten",
      "Tempo konstant halten – weder zu schnell noch federn"
    ],
    tibialis_raise: [
      "Fußspitzen aktiv und maximal hochziehen – kein halber Bewegungsumfang",
      "Schienbeinspannung oben kurz halten",
      "Langsam absenken – der Muskel ist ungewohnt und braucht Aufwärmzeit"
    ],
    back_extension: [
      "Nicht überstrecken am oberen Umkehrpunkt – Rücken bleibt neutral",
      "Bewegung aus Hüfte und Rückenstreckern, nicht aus dem Nacken",
      "Tempo kontrolliert – kein Schwung durch den Rücken"
    ],
    crunch: [
      "Rippen Richtung Becken rollen – keine Knie-zu-Stirn-Bewegung",
      "Nacken entspannt – nicht am Kopf ziehen",
      "Nicht am unteren Umkehrpunkt entspannen – Spannung halten"
    ],
    leg_raise: [
      "Lendenwirbelsäule stabilisieren – kein Hohlkreuz beim Absenken",
      "Langsam absenken – die Exzentrik ist der härteste und wichtigste Teil",
      "Beine nicht schwingen – kontrollierte Bewegung"
    ],
    plank: [
      "Gesäß nicht zu hoch – Hüfte in der Körperlinie",
      "Bauch maximal fest anspannen – nicht nur halten",
      "Ruhe im Atem halten – aktive Spannung bleibt konstant"
    ],
    rotation_core: [
      "Aus dem Rumpf rotieren – Hüfte bleibt stabil und nach vorne ausgerichtet",
      "Hüfte ruhig halten – kein Mitdrehen",
      "Kontrollierte Endposition kurz halten"
    ],
    farmers_carry: [
      "Schulterblätter aktiv zurückhalten – kein Vorneigenkippen der Schultern",
      "Rumpf fest anspannen wie beim schweren Kreuzheben",
      "Gleichmäßiges Gehtempo – nicht hetzen"
    ]
  };

  const tipsEn: Record<CoachingProfileKey, string[]> = {
    horizontal_press: [
      "Don't flare elbows 90° out — 45–60° protects the shoulder joint",
      "Press your back firmly into the bench and build leg drive through the floor",
      "Pause at the bottom instead of bouncing"
    ],
    incline_press: [
      "Bench angle above 45° shifts focus from chest to shoulder — 30–45° is the sweet spot",
      "Keep elbows under the bar — not flared out to the sides",
      "Don't shrug at the top — shoulder blades stay depressed"
    ],
    decline_press: [
      "Brace the core and fix the torso — no momentum from swinging up",
      "Keep a slight elbow angle for shoulder health",
      "Emphasize the eccentric — lower slowly and controlled"
    ],
    chest_fly: [
      "Never fully straighten the elbows — keep the soft bend constant",
      "The movement comes from the chest, not from swinging the arms",
      "Use lighter weights — control beats load on flies"
    ],
    push_up: [
      "Keep the body rigid as one unit — hips not too high or too low",
      "Rotate hands slightly outward for better shoulder health",
      "Lower slowly (2–3 sec), press up explosively"
    ],
    dip_chest: [
      "Keep the forward lean constant — going upright shifts focus to triceps",
      "Use pain-free depth only — just below shoulder level is enough",
      "Do not bounce at the bottom — control the turnaround"
    ],
    vertical_pull: [
      "Pull the shoulder blades down before the arms engage — the sequence is critical",
      "Bring the chest to the bar, not the chin",
      "Control the negative for 2–3 seconds — that's where strength is built"
    ],
    horizontal_row: [
      "Move the shoulder blades actively — don't just pull with the arms",
      "Elbows go straight back, not flared wide — defines lat vs. trap dominance",
      "No torso jerk — control the tempo throughout"
    ],
    straight_arm_pull: [
      "Build lat tension before each rep",
      "Keep arms almost straight — avoid turning it into a curl",
      "Keep the torso quiet — no body swing"
    ],
    shrug: [
      "No shoulder roll — pure vertical movement",
      "Pause at the top for 1–2 seconds for better muscle control",
      "Don't tense the neck — let the upper traps work in isolation"
    ],
    face_pull: [
      "Pull the rope ends apart — keep tension high throughout",
      "Drive elbows high and wide — not low and narrow",
      "Face pulls are injury prevention: rotator cuff and rear delt health"
    ],
    shoulder_press: [
      "Keep ribs down — no lower back arch as a compensation",
      "Move the head around the bar path (barbell), then neutral again",
      "Brace core and glutes before every rep — prevents back compensation"
    ],
    lateral_raise: [
      "Lead 30° in front of the frontal plane — better for the shoulder and hits the medial delt more directly",
      "Rotate the thumb slightly down (pronation) — creates cleaner delt isolation",
      "Use light weight and check the ego — 5–10 kg done right is enough"
    ],
    rear_delt_raise: [
      "Don't shrug from the upper traps — movement comes exclusively from the rear delt",
      "Control the end position for 1–2 seconds",
      "Slight pronation (thumb down) or neutral — never supinate"
    ],
    front_raise: [
      "Do not swing above shoulder height — peak activation is below",
      "No hip drive — the anterior delts should do the work",
      "Lower slowly (3 sec) — use the eccentric phase"
    ],
    upright_row: [
      "Use a pain-free grip width — a narrow grip significantly increases impingement risk",
      "Lead with the elbows — hands follow",
      "No yanking — use the traps and shoulders cleanly"
    ],
    curl: [
      "Supinate (rotate palm upward) as you curl for maximum biceps activation",
      "Use full range of motion — fully straighten at the bottom",
      "Emphasize the eccentric for 2–3 seconds — more hypertrophy stimulus"
    ],
    hammer_curl: [
      "Keep the neutral grip — do not supinate on the way up",
      "Keep elbows close to the torso — no shoulder assist",
      "The brachialis and brachioradialis get better activation here than in regular curls"
    ],
    preacher_curl: [
      "Do not fully relax at the bottom — stop just before full extension",
      "Lower slowly — the preacher position is highly stimulating at short muscle lengths",
      "No momentum — the pad handles the stabilization, not the body"
    ],
    triceps_pushdown: [
      "Fix the upper arms to the torso — no forward swing",
      "Hold the lockout briefly (1 sec) for maximum triceps contraction",
      "Keep shoulders down — no shrugging"
    ],
    overhead_triceps: [
      "Elbows should not flare more than shoulder-width apart",
      "Brace core and pelvic floor to prevent lower back arching",
      "Reach full extension — that's the only way to fully load the long head"
    ],
    skullcrusher: [
      "Keep elbows as steady as possible — no wandering",
      "Lower slowly (2–3 sec) — control protects the elbow joint",
      "Never drop the weight — safety first"
    ],
    dip_triceps: [
      "Keep elbows relatively close — flaring shifts load to the chest",
      "Don't dump the shoulders forward — upright torso stays constant",
      "Press up cleanly — no leg swing"
    ],
    squat: [
      "Track knees exactly with the toes — no valgus (caving inward)",
      "Build core tension before each rep — abs and back together",
      "Drive hips and knees up simultaneously — avoid a good morning effect"
    ],
    leg_press: [
      "Keep the lower back against the pad — no pelvic roll-back",
      "Do not let knees cave in — actively push outward through the feet",
      "Control the last quarter of the movement — do not crash into lockout"
    ],
    lunge: [
      "Choose a step length so that both knees can reach roughly 90° of flexion",
      "Front knee does not travel past the toes",
      "Pelvis stays level and stable — no lateral hip shift"
    ],
    hip_hinge: [
      "Push the hips back actively — do not simply bend forward",
      "Keep a neutral lumbar spine — no rounding of the lower back",
      "Keep the load close to the body — the bar nearly grazes the shin"
    ],
    leg_extension: [
      "Extend without any jerking — no yanking from the seat",
      "Pause at the top for 1–2 seconds for maximum quad contraction",
      "Lower slowly — eccentric control protects the knee"
    ],
    leg_curl: [
      "Dorsiflex slightly (toes up) before each rep — measurably increases hamstring tension",
      "Keep hips pinned to the pad — no arching up",
      "Control the eccentric for 2–3 seconds — the most important part"
    ],
    hip_thrust: [
      "Drive through the heels — not the toes",
      "Keep ribs down at the top — no hyperextension of the lower back",
      "Squeeze glutes hard for 1–2 seconds at the top"
    ],
    glute_kickback: [
      "Do not rotate or tilt the pelvis — keep it square",
      "Move from the glutes, not the lower back",
      "Keep core tension constant throughout"
    ],
    abduction: [
      "Do not open with momentum — controlled movement from the gluteus medius",
      "Keep the pelvis stable — no lateral tilt",
      "Hold the end position briefly (1 sec) before returning"
    ],
    adduction: [
      "Pull in under control — do not let the weight drop",
      "No hip rotation — isolate the adductors",
      "Return slowly and controlled"
    ],
    calf_raise: [
      "Use a full stretch at the bottom — this is the most important part",
      "Fully extend and hold briefly at the top",
      "Keep tempo even — no bouncing at the bottom"
    ],
    tibialis_raise: [
      "Pull toes actively and maximally toward the shin — no half range",
      "Hold the top position briefly",
      "Lower slowly — this muscle is unfamiliar and needs warm-up time"
    ],
    back_extension: [
      "Do not hyperextend at the top — spine stays neutral",
      "Move from the hips and spinal erectors, not from the neck",
      "Control the tempo — no swinging through the lower back"
    ],
    crunch: [
      "Curl ribs toward the pelvis — not forehead to knees",
      "Keep the neck relaxed — no pulling on the head",
      "Do not fully relax at the bottom — maintain tension"
    ],
    leg_raise: [
      "Stabilize the lower back — no arching on the way down",
      "Lower slowly — the eccentric is the hardest and most important part",
      "Do not swing the legs — controlled movement only"
    ],
    plank: [
      "Keep hips in line — not too high or too low",
      "Brace abs maximally — actively squeeze, not just hold",
      "Keep breathing steady — active tension stays constant"
    ],
    rotation_core: [
      "Rotate from the torso — hips stay stable and facing forward",
      "Keep the hips from rotating — isolate the obliques",
      "Hold the end position briefly for maximum activation"
    ],
    farmers_carry: [
      "Keep shoulder blades actively retracted — no forward shoulder roll",
      "Brace the core as hard as for a heavy deadlift",
      "Walk at an even pace — do not rush"
    ]
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
    sourceModel: "exercise-catalog-v2"
  };
}

export function buildExerciseAiInfoForCatalogMatch(match: ExerciseCatalogMatch, locale: AppLanguage): ExerciseAiInfo {
  const info = buildExerciseInfo(match.entry, locale);
  return {
    ...info,
    matchedExerciseName: match.entry.names[locale],
    matchStrategy: match.strategy,
    matchScore: match.score
  };
}

// ─── Target presets ────────────────────────────────────────────────────────────
const TARGETS = {
  benchFlat:      [tm("mid_chest", 55), tm("anterior_delts", 20), tm("triceps_lateral_head", 15), tm("triceps_long_head", 10)],
  benchIncline:   [tm("upper_chest", 45), tm("anterior_delts", 30), tm("triceps_lateral_head", 15), tm("triceps_long_head", 10)],
  benchDecline:   [tm("lower_chest", 50), tm("mid_chest", 20), tm("triceps_lateral_head", 20), tm("anterior_delts", 10)],
  flyChest:       [tm("mid_chest", 65), tm("upper_chest", 20), tm("serratus_anterior", 10), tm("anterior_delts", 5)],
  dipChest:       [tm("lower_chest", 40), tm("mid_chest", 20), tm("triceps_long_head", 20), tm("anterior_delts", 20)],
  pushUp:         [tm("mid_chest", 40), tm("anterior_delts", 25), tm("triceps_lateral_head", 20), tm("rectus_abdominis", 15)],
  latPull:        [tm("latissimus_dorsi", 55), tm("teres_major", 15), tm("biceps_brachii", 15), tm("brachialis", 10), tm("mid_traps", 5)],
  row:            [tm("latissimus_dorsi", 35), tm("teres_major", 10), tm("mid_traps", 20), tm("rear_delts", 15), tm("biceps_brachii", 10), tm("brachialis", 10)],
  straightArmPull:[tm("latissimus_dorsi", 70), tm("teres_major", 15), tm("serratus_anterior", 10), tm("rectus_abdominis", 5)],
  shrug:          [tm("upper_traps", 70), tm("mid_traps", 20), tm("forearm_flexors", 10)],
  facePull:       [tm("rear_delts", 40), tm("mid_traps", 25), tm("lower_traps", 15), tm("rotator_cuff", 20)],
  shoulderPress:  [tm("anterior_delts", 35), tm("medial_delts", 35), tm("triceps_long_head", 15), tm("triceps_lateral_head", 10), tm("rectus_abdominis", 5)],
  lateralRaise:   [tm("medial_delts", 70), tm("upper_traps", 20), tm("anterior_delts", 10)],
  rearDeltRaise:  [tm("rear_delts", 60), tm("mid_traps", 20), tm("lower_traps", 10), tm("rotator_cuff", 10)],
  // FIX: removed rectus_abdominis from frontRaise — minimal involvement does not justify inclusion
  frontRaise:     [tm("anterior_delts", 70), tm("upper_chest", 15), tm("upper_traps", 15)],
  uprightRow:     [tm("upper_traps", 35), tm("medial_delts", 35), tm("anterior_delts", 20), tm("forearm_flexors", 10)],
  curl:           [tm("biceps_brachii", 55), tm("brachialis", 25), tm("brachioradialis", 20)],
  hammerCurl:     [tm("brachialis", 40), tm("brachioradialis", 35), tm("biceps_brachii", 25)],
  preacherCurl:   [tm("biceps_brachii", 60), tm("brachialis", 25), tm("brachioradialis", 15)],
  tricepsPushdown:[tm("triceps_lateral_head", 40), tm("triceps_long_head", 35), tm("triceps_medial_head", 25)],
  overheadTriceps:[tm("triceps_long_head", 55), tm("triceps_lateral_head", 25), tm("triceps_medial_head", 20)],
  skullcrusher:   [tm("triceps_long_head", 45), tm("triceps_lateral_head", 30), tm("triceps_medial_head", 25)],
  dipTriceps:     [tm("triceps_lateral_head", 35), tm("triceps_long_head", 30), tm("triceps_medial_head", 20), tm("anterior_delts", 15)],
  squat:          [tm("rectus_femoris", 25), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("gluteus_maximus", 20), tm("erector_spinae", 10)],
  frontSquat:     [tm("rectus_femoris", 30), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("vastus_intermedius", 15), tm("rectus_abdominis", 10)],
  legPress:       [tm("rectus_femoris", 25), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("gluteus_maximus", 20), tm("biceps_femoris", 10)],
  lunge:          [tm("gluteus_maximus", 25), tm("rectus_femoris", 20), tm("vastus_lateralis", 20), tm("vastus_medialis", 15), tm("biceps_femoris", 10), tm("gluteus_medius", 10)],
  hinge:          [tm("gluteus_maximus", 30), tm("biceps_femoris", 20), tm("semitendinosus", 15), tm("semimembranosus", 15), tm("erector_spinae", 15), tm("forearm_flexors", 5)],
  legExtension:   [tm("rectus_femoris", 30), tm("vastus_lateralis", 25), tm("vastus_medialis", 25), tm("vastus_intermedius", 20)],
  legCurl:        [tm("biceps_femoris", 40), tm("semitendinosus", 30), tm("semimembranosus", 20), tm("gastrocnemius", 10)],
  hipThrust:      [tm("gluteus_maximus", 60), tm("gluteus_medius", 15), tm("biceps_femoris", 15), tm("erector_spinae", 10)],
  gluteKickback:  [tm("gluteus_maximus", 70), tm("gluteus_medius", 15), tm("biceps_femoris", 10), tm("erector_spinae", 5)],
  abduction:      [tm("gluteus_medius", 45), tm("gluteus_minimus", 30), tm("abductors", 25)],
  // FIX: removed rectus_abdominis from adduction — no anatomical relationship to hip adduction
  adduction:      [tm("adductors", 85), tm("gluteus_maximus", 10), tm("gluteus_medius", 5)],
  calfRaise:      [tm("gastrocnemius", 65), tm("soleus", 35)],
  seatedCalfRaise:[tm("soleus", 65), tm("gastrocnemius", 35)],
  // FIX: removed rectus_abdominis from tibRaise — no meaningful abdominal activation in tibialis raise
  tibRaise:       [tm("tibialis_anterior", 95), tm("soleus", 5)],
  // FIX: replaced rectus_abdominis (10%) with gluteus_medius — more accurate for back extension
  backExtension:  [tm("erector_spinae", 45), tm("gluteus_maximus", 25), tm("biceps_femoris", 20), tm("gluteus_medius", 10)],
  crunch:         [tm("rectus_abdominis", 70), tm("transversus_abdominis", 15), tm("external_obliques", 10), tm("internal_obliques", 5)],
  legRaise:       [tm("rectus_abdominis", 40), tm("transversus_abdominis", 25), tm("iliopsoas", 25), tm("external_obliques", 10)],
  plank:          [tm("transversus_abdominis", 35), tm("rectus_abdominis", 25), tm("external_obliques", 15), tm("internal_obliques", 15), tm("gluteus_maximus", 10)],
  rotationCore:   [tm("external_obliques", 40), tm("internal_obliques", 30), tm("rectus_abdominis", 20), tm("transversus_abdominis", 10)]
} as const;

const catalog: ExerciseCatalogEntry[] = [
  // ─── Chest (18) ──────────────────────────────────────────────────────────────
  ex("barbell_bench_press", "Bankdrücken (Langhantel)", "Barbell Bench Press", "horizontal_press", [...TARGETS.benchFlat],
    ["bench press", "flat bench", "flat bench press", "flachbankdrücken", "flachbank", "langhantel bankdrücken", "chest press barbell", "brust drücken"]),
  ex("dumbbell_bench_press", "Bankdrücken (Kurzhantel)", "Dumbbell Bench Press", "horizontal_press", [...TARGETS.benchFlat],
    ["db bench press", "kurzhantel bankdrücken"]),
  ex("smith_bench_press", "Bankdrücken (Smith Machine)", "Smith Machine Bench Press", "horizontal_press", [...TARGETS.benchFlat],
    ["smith bench", "smith machine bench"]),
  ex("machine_chest_press", "Brustpresse (Maschine)", "Machine Chest Press", "horizontal_press", [...TARGETS.benchFlat],
    ["chest press machine", "brust maschine"]),
  ex("incline_barbell_bench_press", "Schrägbankdrücken (Langhantel)", "Incline Barbell Bench Press", "incline_press", [...TARGETS.benchIncline],
    ["incline bench", "incline bench press", "schrägbank langhantel"]),
  ex("incline_dumbbell_bench_press", "Schrägbankdrücken (Kurzhantel)", "Incline Dumbbell Bench Press", "incline_press", [...TARGETS.benchIncline],
    ["incline db bench", "incline dumbbell press", "schrägbank kurzhantel"]),
  ex("incline_machine_chest_press", "Schrägbank Brustpresse (Maschine)", "Incline Machine Chest Press", "incline_press", [...TARGETS.benchIncline]),
  ex("decline_bench_press", "Negativbankdrücken", "Decline Bench Press", "decline_press", [...TARGETS.benchDecline]),
  ex("push_up", "Liegestütz", "Push-Up", "push_up", [...TARGETS.pushUp],
    ["pushup", "push ups", "liegestütze"]),
  ex("weighted_push_up", "Liegestütz (mit Gewicht)", "Weighted Push-Up", "push_up", [...TARGETS.pushUp]),
  ex("assisted_push_up", "Liegestütz (erhöht/assistiert)", "Assisted Push-Up", "push_up", [...TARGETS.pushUp],
    ["incline push up", "incline push-up", "kniender liegestütz"]),
  ex("chest_dips", "Dips (Brustfokus)", "Chest Dips", "dip_chest", [...TARGETS.dipChest],
    ["forward lean dips", "brust dips"]),
  ex("pec_deck_fly", "Butterfly (Pec Deck)", "Pec Deck Fly", "chest_fly", [...TARGETS.flyChest],
    ["pec deck", "butterfly machine", "machine fly pec deck", "machine fly pec dec", "butterfly", "pecdeck"]),
  ex("cable_fly_mid", "Cable Fly (mittlere Brust)", "Cable Fly (Mid Chest)", "chest_fly", [...TARGETS.flyChest],
    ["cable crossover", "cable fly", "kabel fly"]),
  ex("cable_fly_high_to_low", "Cable Fly (oben nach unten)", "Cable Fly (High to Low)", "chest_fly",
    [tm("lower_chest", 45), tm("mid_chest", 25), tm("serratus_anterior", 15), tm("anterior_delts", 15)]),
  ex("cable_fly_low_to_high", "Cable Fly (unten nach oben)", "Cable Fly (Low to High)", "chest_fly",
    [tm("upper_chest", 45), tm("mid_chest", 25), tm("serratus_anterior", 15), tm("anterior_delts", 15)]),
  ex("dumbbell_fly", "Kurzhantel Fly", "Dumbbell Fly", "chest_fly", [...TARGETS.flyChest],
    ["db fly", "dumbbell chest fly"]),
  ex("dumbbell_squeeze_press", "Squeeze Press (Kurzhantel)", "Dumbbell Squeeze Press", "horizontal_press",
    [tm("mid_chest", 60), tm("triceps_lateral_head", 15), tm("anterior_delts", 15), tm("serratus_anterior", 10)]),

  // ─── Back / Lats / Traps (20) ────────────────────────────────────────────────
  ex("lat_pulldown_wide", "Latzug (breit)", "Wide-Grip Lat Pulldown", "vertical_pull", [...TARGETS.latPull],
    ["lat pulldown", "wide lat pulldown", "lat pull down", "latziehen", "latzug", "latziehen breit"]),
  ex("lat_pulldown_close", "Latzug (eng)", "Close-Grip Lat Pulldown", "vertical_pull", [...TARGETS.latPull],
    ["close lat pulldown", "latziehen eng"]),
  ex("lat_pulldown_neutral", "Latzug (Neutralgriff)", "Neutral-Grip Lat Pulldown", "vertical_pull", [...TARGETS.latPull],
    ["neutral grip lat pulldown"]),
  ex("pull_up", "Klimmzug", "Pull-Up", "vertical_pull", [...TARGETS.latPull],
    ["pullup", "pull ups", "pullups", "klimmzüge"]),
  ex("chin_up", "Chin-Up", "Chin-Up", "vertical_pull",
    [tm("latissimus_dorsi", 45), tm("biceps_brachii", 25), tm("brachialis", 15), tm("teres_major", 10), tm("mid_traps", 5)],
    ["chinup", "chin up", "untergriff klimmzug"]),
  ex("assisted_pull_up", "Klimmzug (assistiert)", "Assisted Pull-Up", "vertical_pull", [...TARGETS.latPull],
    ["assisted pullup", "machine assisted pull-up", "assisted pullups"]),
  ex("seated_cable_row", "Sitzendes Kabelrudern", "Seated Cable Row", "horizontal_row", [...TARGETS.row],
    ["cable row", "seated row", "kabelrudern", "rudern am kabel", "kabel row"]),
  ex("machine_row", "Rudern (Maschine)", "Machine Row", "horizontal_row", [...TARGETS.row],
    ["row machine", "maschinenrudern"]),
  ex("chest_supported_row", "Chest-Supported Row", "Chest-Supported Row", "horizontal_row", [...TARGETS.row],
    ["seal row machine", "brust gestützt rudern"]),
  ex("one_arm_dumbbell_row", "Einarmiges Kurzhantelrudern", "One-Arm Dumbbell Row", "horizontal_row", [...TARGETS.row],
    ["1 arm dumbbell row", "dumbbell row", "dumbbell rows", "einarmig rudern", "kurzhantel rudern"]),
  ex("barbell_row", "Langhantelrudern", "Barbell Row", "horizontal_row", [...TARGETS.row],
    ["bent over row", "barbell bent-over row", "barbell rows", "rudern langhantel", "bent-over barbell row"]),
  ex("t_bar_row", "T-Bar Rudern", "T-Bar Row", "horizontal_row", [...TARGETS.row],
    ["t bar row", "tbar row"]),
  ex("high_row_machine", "High Row (Maschine)", "High Row Machine", "horizontal_row",
    [tm("latissimus_dorsi", 30), tm("teres_major", 15), tm("mid_traps", 25), tm("rear_delts", 15), tm("biceps_brachii", 15)]),
  ex("straight_arm_pulldown", "Überzüge am Kabel (gerade Arme)", "Straight-Arm Pulldown", "straight_arm_pull", [...TARGETS.straightArmPull],
    ["cable pullover", "straight arm pulldown", "überzüge kabel"]),
  ex("dumbbell_pullover", "Kurzhantel Pullover", "Dumbbell Pullover", "straight_arm_pull",
    [tm("latissimus_dorsi", 45), tm("upper_chest", 20), tm("serratus_anterior", 20), tm("triceps_long_head", 15)]),
  ex("face_pull", "Face Pull", "Face Pull", "face_pull", [...TARGETS.facePull],
    ["cable face pull", "face pulls", "rope face pull"]),
  ex("barbell_shrug", "Shrugs (Langhantel)", "Barbell Shrug", "shrug", [...TARGETS.shrug],
    ["shrugs", "barbell shrugs"]),
  ex("dumbbell_shrug", "Shrugs (Kurzhantel)", "Dumbbell Shrug", "shrug", [...TARGETS.shrug]),
  ex("reverse_pec_deck", "Reverse Pec Deck", "Reverse Pec Deck", "rear_delt_raise", [...TARGETS.rearDeltRaise],
    ["rear delt machine", "hintere schulter maschine"]),
  ex("rack_pull", "Rack Pull", "Rack Pull", "hip_hinge",
    [tm("erector_spinae", 30), tm("upper_traps", 25), tm("mid_traps", 15), tm("gluteus_maximus", 15), tm("biceps_femoris", 10), tm("forearm_flexors", 5)]),

  // ─── Shoulders (18) ──────────────────────────────────────────────────────────
  ex("barbell_overhead_press", "Schulterdrücken (Langhantel)", "Barbell Overhead Press", "shoulder_press", [...TARGETS.shoulderPress],
    ["military press", "ohp", "overhead shoulder press", "shoulder press", "schulterdrücken", "overhead press"]),
  ex("dumbbell_shoulder_press", "Schulterdrücken (Kurzhantel)", "Dumbbell Shoulder Press", "shoulder_press", [...TARGETS.shoulderPress],
    ["db shoulder press", "kurzhantel schulterdrücken"]),
  ex("machine_shoulder_press", "Schulterpresse (Maschine)", "Machine Shoulder Press", "shoulder_press", [...TARGETS.shoulderPress],
    ["schulterpresse", "shoulder press machine"]),
  ex("arnold_press", "Arnold Press", "Arnold Press", "shoulder_press",
    [tm("anterior_delts", 40), tm("medial_delts", 30), tm("triceps_long_head", 15), tm("triceps_lateral_head", 10), tm("rotator_cuff", 5)]),
  ex("dumbbell_lateral_raise", "Seitheben (Kurzhantel)", "Dumbbell Lateral Raise", "lateral_raise", [...TARGETS.lateralRaise],
    ["lateral raise", "side lateral raise", "lateral raises", "seitheben", "schulter seitheben"]),
  ex("cable_lateral_raise", "Seitheben (Kabel)", "Cable Lateral Raise", "lateral_raise", [...TARGETS.lateralRaise],
    ["kabel seitheben"]),
  ex("machine_lateral_raise", "Seitheben (Maschine)", "Machine Lateral Raise", "lateral_raise", [...TARGETS.lateralRaise],
    ["seitheben maschine"]),
  ex("lean_away_cable_lateral_raise", "Seitheben Kabel (lean-away)", "Lean-Away Cable Lateral Raise", "lateral_raise",
    [tm("medial_delts", 75), tm("anterior_delts", 10), tm("upper_traps", 15)]),
  ex("rear_delt_fly_dumbbell", "Reverse Fly (Kurzhantel)", "Dumbbell Rear Delt Fly", "rear_delt_raise", [...TARGETS.rearDeltRaise],
    ["reverse fly", "hintere schulter fly"]),
  ex("rear_delt_fly_cable", "Reverse Fly (Kabel)", "Cable Rear Delt Fly", "rear_delt_raise", [...TARGETS.rearDeltRaise]),
  ex("rear_delt_row", "Rear Delt Row", "Rear Delt Row", "rear_delt_raise",
    [tm("rear_delts", 45), tm("mid_traps", 25), tm("upper_traps", 10), tm("biceps_brachii", 10), tm("rotator_cuff", 10)]),
  ex("front_raise_dumbbell", "Frontheben (Kurzhantel)", "Dumbbell Front Raise", "front_raise", [...TARGETS.frontRaise],
    ["front raise", "frontheben"]),
  ex("front_raise_cable", "Frontheben (Kabel)", "Cable Front Raise", "front_raise", [...TARGETS.frontRaise]),
  ex("upright_row_barbell", "Aufrechtes Rudern (Langhantel)", "Barbell Upright Row", "upright_row", [...TARGETS.uprightRow],
    ["upright row", "aufrechtes rudern"]),
  ex("upright_row_cable", "Aufrechtes Rudern (Kabel)", "Cable Upright Row", "upright_row", [...TARGETS.uprightRow]),
  ex("landmine_press", "Landmine Press", "Landmine Press", "shoulder_press",
    [tm("anterior_delts", 40), tm("upper_chest", 25), tm("medial_delts", 15), tm("triceps_lateral_head", 10), tm("rectus_abdominis", 10)]),
  ex("y_raise", "Y-Raise", "Y-Raise", "rear_delt_raise",
    [tm("lower_traps", 30), tm("rear_delts", 30), tm("mid_traps", 20), tm("rotator_cuff", 20)]),
  ex("cuban_press", "Cuban Press", "Cuban Press", "shoulder_press",
    [tm("rotator_cuff", 35), tm("medial_delts", 25), tm("rear_delts", 20), tm("anterior_delts", 20)]),

  // ─── Arms (20) ───────────────────────────────────────────────────────────────
  ex("barbell_curl", "Bizepscurls (Langhantel)", "Barbell Curl", "curl", [...TARGETS.curl],
    ["biceps curl", "bicep curl", "barbell bicep curl", "bizepscurl", "curls langhantel"]),
  ex("ez_bar_curl", "Bizepscurls (EZ-Stange)", "EZ-Bar Curl", "curl", [...TARGETS.curl],
    ["ez curl", "ez bar curl"]),
  ex("dumbbell_curl", "Bizepscurls (Kurzhantel)", "Dumbbell Curl", "curl", [...TARGETS.curl],
    ["db curl", "kurzhantel curl", "dumbbell bicep curl"]),
  ex("alternating_dumbbell_curl", "Alternierende Bizepscurls", "Alternating Dumbbell Curl", "curl", [...TARGETS.curl],
    ["alternating curl"]),
  ex("incline_dumbbell_curl", "Schrägbank Bizepscurls", "Incline Dumbbell Curl", "curl", [...TARGETS.curl]),
  ex("concentration_curl", "Konzentrationscurl", "Concentration Curl", "curl", [...TARGETS.curl]),
  ex("preacher_curl_ez", "Preacher Curl (EZ)", "EZ Preacher Curl", "preacher_curl", [...TARGETS.preacherCurl],
    ["preacher curl ez bar"]),
  ex("preacher_curl_machine", "Preacher Curl (Maschine)", "Preacher Curl Machine", "preacher_curl", [...TARGETS.preacherCurl]),
  ex("cable_curl", "Bizepscurls (Kabel)", "Cable Curl", "curl", [...TARGETS.curl],
    ["cable biceps curl", "kabel curl"]),
  ex("hammer_curl_dumbbell", "Hammer Curls (Kurzhantel)", "Dumbbell Hammer Curl", "hammer_curl", [...TARGETS.hammerCurl],
    ["hammer curls", "hammer curl"]),
  ex("hammer_curl_rope", "Hammer Curls (Seil am Kabel)", "Rope Hammer Curl", "hammer_curl", [...TARGETS.hammerCurl],
    ["rope hammer curl"]),
  ex("triceps_pushdown_bar", "Trizepsdrücken (Stange)", "Bar Triceps Pushdown", "triceps_pushdown", [...TARGETS.tricepsPushdown],
    ["triceps pushdown", "triceps cable pushdown", "trizepsdrücken"]),
  ex("triceps_pushdown_rope", "Trizepsdrücken (Seil)", "Rope Triceps Pushdown", "triceps_pushdown", [...TARGETS.tricepsPushdown],
    ["rope pushdown", "seil trizepsdrücken"]),
  ex("overhead_triceps_extension_cable", "Überkopf Trizepsstrecken (Kabel)", "Overhead Cable Triceps Extension", "overhead_triceps", [...TARGETS.overheadTriceps],
    ["overhead triceps extension", "überkopf trizeps"]),
  ex("overhead_triceps_extension_db", "Überkopf Trizepsstrecken (Kurzhantel)", "Dumbbell Overhead Triceps Extension", "overhead_triceps", [...TARGETS.overheadTriceps]),
  ex("skullcrusher_ez", "Skullcrusher (EZ-Stange)", "EZ-Bar Skullcrusher", "skullcrusher", [...TARGETS.skullcrusher],
    ["skullcrusher", "skull crusher"]),
  ex("lying_triceps_extension_db", "Liegendes Trizepsstrecken (Kurzhantel)", "Dumbbell Lying Triceps Extension", "skullcrusher", [...TARGETS.skullcrusher]),
  ex("close_grip_bench_press", "Enges Bankdrücken", "Close-Grip Bench Press", "horizontal_press",
    [tm("triceps_lateral_head", 30), tm("triceps_long_head", 25), tm("triceps_medial_head", 20), tm("mid_chest", 15), tm("anterior_delts", 10)],
    ["close grip bench", "enges bankdrücken"]),
  ex("triceps_dips", "Dips (Trizepsfokus)", "Triceps Dips", "dip_triceps", [...TARGETS.dipTriceps],
    ["bench dips", "upright dips", "bank dips", "trizeps dips"]),
  ex("wrist_curl", "Handgelenkcurl", "Wrist Curl", "curl",
    [tm("forearm_flexors", 75), tm("forearm_extensors", 10), tm("brachioradialis", 15)],
    ["forearm curl", "dumbbell forearm curl"]),

  // ─── Legs (24) ───────────────────────────────────────────────────────────────
  ex("back_squat", "Kniebeuge (Langhantel)", "Barbell Back Squat", "squat", [...TARGETS.squat],
    ["barbell squat", "kniebeuge", "langhantelkniebeuge", "back squat"]),
  ex("front_squat", "Front Squat", "Front Squat", "squat", [...TARGETS.frontSquat]),
  ex("goblet_squat", "Goblet Squat", "Goblet Squat", "squat", [...TARGETS.frontSquat]),
  ex("smith_squat", "Kniebeuge (Smith Machine)", "Smith Machine Squat", "squat", [...TARGETS.squat],
    ["smith squat"]),
  ex("hack_squat", "Hack Squat", "Hack Squat", "squat",
    [tm("rectus_femoris", 30), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("vastus_intermedius", 15), tm("gluteus_maximus", 10)]),
  ex("leg_press", "Beinpresse", "Leg Press", "leg_press", [...TARGETS.legPress],
    ["machine leg press", "leg press machine", "beinpresse maschine"]),
  ex("bulgarian_split_squat", "Bulgarian Split Squat", "Bulgarian Split Squat", "lunge", [...TARGETS.lunge],
    ["bss", "bulgarische kniebeuge"]),
  ex("reverse_lunge", "Reverse Lunge", "Reverse Lunge", "lunge", [...TARGETS.lunge]),
  ex("walking_lunge", "Walking Lunge", "Walking Lunge", "lunge", [...TARGETS.lunge]),
  ex("step_up", "Step-Up", "Step-Up", "lunge",
    [tm("gluteus_maximus", 25), tm("rectus_femoris", 20), tm("vastus_lateralis", 20), tm("vastus_medialis", 15), tm("gluteus_medius", 10), tm("biceps_femoris", 10)],
    ["step up", "step ups"]),
  ex("romanian_deadlift", "Rumänisches Kreuzheben", "Romanian Deadlift", "hip_hinge", [...TARGETS.hinge],
    ["rdl", "rumänisches kreuzheben", "romanian deadlift barbell"]),
  ex("stiff_leg_deadlift", "Steifbein-Kreuzheben", "Stiff-Leg Deadlift", "hip_hinge", [...TARGETS.hinge],
    ["stiff leg deadlift", "sldl"]),
  ex("deadlift", "Kreuzheben", "Deadlift", "hip_hinge",
    [tm("gluteus_maximus", 25), tm("biceps_femoris", 15), tm("semitendinosus", 10), tm("semimembranosus", 10), tm("erector_spinae", 20), tm("upper_traps", 10), tm("mid_traps", 5), tm("forearm_flexors", 5)],
    ["deadlifts", "conventional deadlift", "konventionelles kreuzheben", "kreuzheben langhantel"]),
  ex("sumo_deadlift", "Sumo-Kreuzheben", "Sumo Deadlift", "hip_hinge",
    [tm("gluteus_maximus", 25), tm("adductors", 20), tm("rectus_femoris", 15), tm("vastus_lateralis", 10), tm("biceps_femoris", 10), tm("erector_spinae", 15), tm("forearm_flexors", 5)],
    ["sumo deadlifts"]),
  ex("good_morning", "Good Morning", "Good Morning", "hip_hinge",
    [tm("erector_spinae", 30), tm("gluteus_maximus", 25), tm("biceps_femoris", 20), tm("semitendinosus", 15), tm("semimembranosus", 10)]),
  ex("leg_extension", "Beinstrecker", "Leg Extension", "leg_extension", [...TARGETS.legExtension],
    ["machine leg extension", "leg extension machine", "beinstrecker maschine"]),
  ex("lying_leg_curl", "Beinbeuger liegend", "Lying Leg Curl", "leg_curl", [...TARGETS.legCurl],
    ["machine hamstring curl prone", "prone leg curl", "leg curls", "beinbeuger liegend maschine"]),
  ex("seated_leg_curl", "Beinbeuger sitzend", "Seated Leg Curl", "leg_curl", [...TARGETS.legCurl],
    ["seated hamstring curl"]),
  ex("standing_leg_curl", "Beinbeuger stehend", "Standing Leg Curl", "leg_curl", [...TARGETS.legCurl]),
  ex("hip_thrust", "Hip Thrust", "Hip Thrust", "hip_thrust", [...TARGETS.hipThrust],
    ["glute thrust", "hüftdrücken", "bodyweight hip thrust"]),
  ex("glute_bridge", "Glute Bridge", "Glute Bridge", "hip_thrust", [...TARGETS.hipThrust],
    ["glute bridges", "bridge"]),
  ex("cable_glute_kickback", "Glute Kickback (Kabel)", "Cable Glute Kickback", "glute_kickback", [...TARGETS.gluteKickback],
    ["glute kickback", "kabel glute kickback"]),
  ex("hip_abduction_machine", "Abduktion (Maschine)", "Hip Abduction Machine", "abduction", [...TARGETS.abduction],
    ["machine hip abduction", "hip abduction", "abduktion maschine"]),
  ex("hip_adduction_machine", "Adduktion (Maschine)", "Hip Adduction Machine", "adduction", [...TARGETS.adduction],
    ["machine hip adduction", "hip adduction", "adduktion maschine"]),

  // ─── Lower legs + tibialis (6) ───────────────────────────────────────────────
  ex("standing_calf_raise", "Wadenheben stehend", "Standing Calf Raise", "calf_raise", [...TARGETS.calfRaise],
    ["machine standing calf raise", "calf raises", "wadenheben"]),
  ex("seated_calf_raise", "Wadenheben sitzend", "Seated Calf Raise", "calf_raise", [...TARGETS.seatedCalfRaise]),
  ex("leg_press_calf_raise", "Wadenheben an der Beinpresse", "Leg Press Calf Raise", "calf_raise", [...TARGETS.calfRaise]),
  ex("smith_calf_raise", "Wadenheben (Smith Machine)", "Smith Machine Calf Raise", "calf_raise", [...TARGETS.calfRaise]),
  ex("donkey_calf_raise", "Donkey Calf Raise", "Donkey Calf Raise", "calf_raise", [...TARGETS.calfRaise]),
  ex("tibialis_raise", "Tibialis Raise", "Tibialis Raise", "tibialis_raise", [...TARGETS.tibRaise],
    ["tibialis anterior raise", "shin raise"]),

  // ─── Core / lower back (14) ──────────────────────────────────────────────────
  ex("back_extension", "Hyperextensions / Rückenstrecker", "Back Extension", "back_extension", [...TARGETS.backExtension],
    ["hyperextension", "roman chair back extension", "rückenstrecker"]),
  ex("machine_crunch", "Bauchmaschine Crunch", "Machine Crunch", "crunch", [...TARGETS.crunch],
    ["ab crunch machine", "machine ab crunch", "bauchmaschine"]),
  ex("cable_crunch", "Cable Crunch", "Cable Crunch", "crunch", [...TARGETS.crunch],
    ["kabel crunch"]),
  ex("floor_crunch", "Crunch", "Crunch", "crunch", [...TARGETS.crunch],
    ["sit ups", "crunches"]),
  ex("reverse_crunch", "Reverse Crunch", "Reverse Crunch", "crunch",
    [tm("rectus_abdominis", 45), tm("transversus_abdominis", 20), tm("external_obliques", 15), tm("internal_obliques", 10), tm("iliopsoas", 10)]),
  ex("hanging_knee_raise", "Hängendes Knieheben", "Hanging Knee Raise", "leg_raise", [...TARGETS.legRaise],
    ["hanging knee tucks", "knieheben hängend"]),
  ex("hanging_leg_raise", "Hängendes Beinheben", "Hanging Leg Raise", "leg_raise",
    [tm("rectus_abdominis", 35), tm("transversus_abdominis", 20), tm("iliopsoas", 30), tm("external_obliques", 10), tm("internal_obliques", 5)],
    ["hanging leg raises"]),
  ex("captains_chair_leg_raise", "Leg Raise (Captain's Chair)", "Captain's Chair Leg Raise", "leg_raise", [...TARGETS.legRaise],
    ["captain s chair", "captains chair"]),
  ex("ab_wheel_rollout", "Ab Wheel Rollout", "Ab Wheel Rollout", "plank",
    [tm("transversus_abdominis", 30), tm("rectus_abdominis", 25), tm("external_obliques", 15), tm("internal_obliques", 10), tm("lower_traps", 10), tm("serratus_anterior", 10)],
    ["ab roller", "wheel rollout"]),
  ex("plank", "Plank", "Plank", "plank", [...TARGETS.plank]),
  ex("side_plank", "Side Plank", "Side Plank", "plank",
    [tm("external_obliques", 35), tm("internal_obliques", 25), tm("transversus_abdominis", 20), tm("rectus_abdominis", 10), tm("gluteus_medius", 10)]),
  ex("dead_bug", "Dead Bug", "Dead Bug", "plank",
    [tm("transversus_abdominis", 35), tm("rectus_abdominis", 25), tm("internal_obliques", 15), tm("external_obliques", 15), tm("iliopsoas", 10)]),
  ex("russian_twist", "Russian Twist", "Russian Twist", "rotation_core", [...TARGETS.rotationCore]),
  ex("woodchopper_cable", "Cable Woodchopper", "Cable Woodchopper", "rotation_core",
    [tm("external_obliques", 35), tm("internal_obliques", 25), tm("rectus_abdominis", 15), tm("transversus_abdominis", 10), tm("serratus_anterior", 15)],
    ["wood chopper", "kabel woodchopper"])
];

// ─── Extra common machine / cable / grip / unilateral variants ─────────────────
const EXTRA_VARIANTS: ExerciseCatalogEntry[] = [
  ex("smith_incline_press", "Schrägbankdrücken (Smith Machine)", "Smith Machine Incline Press", "incline_press", [...TARGETS.benchIncline]),
  ex("crossover_press", "Kabel Brustpresse (stehend)", "Standing Cable Chest Press", "horizontal_press", [...TARGETS.benchFlat]),
  ex("underhand_lat_pulldown", "Latzug (Untergriff)", "Underhand Lat Pulldown", "vertical_pull", [...TARGETS.latPull],
    ["reverse grip lat pulldown"]),
  ex("single_arm_lat_pulldown", "Einarmiger Latzug", "Single-Arm Lat Pulldown", "vertical_pull", [...TARGETS.latPull]),
  ex("single_arm_cable_row", "Einarmiges Kabelrudern", "Single-Arm Cable Row", "horizontal_row", [...TARGETS.row],
    ["cable single-arm row"]),
  ex("meadows_row", "Meadows Row", "Meadows Row", "horizontal_row", [...TARGETS.row]),
  ex("dumbbell_shoulder_press_seated", "Schulterdrücken sitzend (Kurzhantel)", "Seated Dumbbell Shoulder Press", "shoulder_press", [...TARGETS.shoulderPress]),
  ex("machine_rear_delt_fly", "Rear Delt Fly (Maschine)", "Machine Rear Delt Fly", "rear_delt_raise", [...TARGETS.rearDeltRaise],
    ["machine rear delt fly", "machine reverse fly", "reverse fly maschine"]),
  ex("cable_front_raise_single", "Einarmiges Frontheben (Kabel)", "Single-Arm Cable Front Raise", "front_raise", [...TARGETS.frontRaise]),
  ex("reverse_grip_curl", "Reverse Curl", "Reverse Curl", "hammer_curl",
    [tm("brachioradialis", 40), tm("forearm_extensors", 35), tm("biceps_brachii", 15), tm("brachialis", 10)]),
  ex("cable_preacher_curl", "Preacher Curl (Kabel)", "Cable Preacher Curl", "preacher_curl", [...TARGETS.preacherCurl]),
  ex("rope_overhead_triceps_extension", "Überkopf Trizepsstrecken (Seil)", "Rope Overhead Triceps Extension", "overhead_triceps", [...TARGETS.overheadTriceps]),
  ex("single_arm_pushdown", "Einarmiges Trizepsdrücken", "Single-Arm Triceps Pushdown", "triceps_pushdown", [...TARGETS.tricepsPushdown]),
  ex("hack_squat_machine", "Hack Squat (Maschine)", "Hack Squat Machine", "squat",
    [tm("rectus_femoris", 30), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("vastus_intermedius", 15), tm("gluteus_maximus", 10)]),
  ex("split_squat", "Split Squat", "Split Squat", "lunge", [...TARGETS.lunge]),
  ex("curtsy_lunge", "Curtsy Lunge", "Curtsy Lunge", "lunge",
    [tm("gluteus_medius", 25), tm("gluteus_maximus", 25), tm("adductors", 20), tm("rectus_femoris", 15), tm("vastus_medialis", 15)]),
  ex("romanian_deadlift_dumbbell", "Rumänisches Kreuzheben (Kurzhantel)", "Dumbbell Romanian Deadlift", "hip_hinge", [...TARGETS.hinge]),
  ex("cable_pull_through", "Cable Pull-Through", "Cable Pull-Through", "hip_hinge",
    [tm("gluteus_maximus", 45), tm("biceps_femoris", 20), tm("semitendinosus", 15), tm("semimembranosus", 10), tm("erector_spinae", 10)]),
  ex("single_leg_leg_extension", "Einbeiniger Beinstrecker", "Single-Leg Leg Extension", "leg_extension", [...TARGETS.legExtension]),
  ex("single_leg_leg_curl", "Einbeiniger Beinbeuger", "Single-Leg Leg Curl", "leg_curl", [...TARGETS.legCurl])
];

// ─── Broader catalog expansion ────────────────────────────────────────────────
const EXTRA_VARIANTS_2: ExerciseCatalogEntry[] = [
  // Chest
  ex("plate_loaded_chest_press", "Brustpresse (plate-loaded)", "Plate-Loaded Chest Press", "horizontal_press", [...TARGETS.benchFlat],
    ["iso lateral chest press", "converging chest press"]),
  ex("seated_chest_press_machine", "Brustpresse sitzend (Maschine)", "Seated Chest Press Machine", "horizontal_press", [...TARGETS.benchFlat],
    ["machine seated chest press"]),
  ex("hammer_strength_chest_press", "Brustpresse (Hammer Strength)", "Hammer Strength Chest Press", "horizontal_press", [...TARGETS.benchFlat],
    ["hs chest press"]),
  ex("incline_plate_loaded_chest_press", "Schrägbank Brustpresse (plate-loaded)", "Incline Plate-Loaded Chest Press", "incline_press", [...TARGETS.benchIncline]),
  ex("incline_smith_close_grip_press", "Schrägbankdrücken eng (Smith Machine)", "Incline Close-Grip Smith Press", "incline_press", [...TARGETS.benchIncline]),
  ex("machine_decline_chest_press", "Negativ Brustpresse (Maschine)", "Decline Machine Chest Press", "decline_press", [...TARGETS.benchDecline]),
  ex("smith_decline_press", "Negativbankdrücken (Smith Machine)", "Smith Machine Decline Press", "decline_press", [...TARGETS.benchDecline]),
  ex("single_arm_cable_fly", "Einarmiger Cable Fly", "Single-Arm Cable Fly", "chest_fly", [...TARGETS.flyChest]),
  ex("single_arm_machine_chest_press", "Einarmige Brustpresse (Maschine)", "Single-Arm Machine Chest Press", "horizontal_press", [...TARGETS.benchFlat]),
  ex("push_up_handles", "Liegestütz (Griffe)", "Push-Up (Handles)", "push_up", [...TARGETS.pushUp],
    ["push up handles"]),
  ex("deficit_push_up", "Deficit Liegestütz", "Deficit Push-Up", "push_up", [...TARGETS.pushUp]),
  ex("decline_push_up", "Decline Liegestütz", "Decline Push-Up", "push_up",
    [tm("upper_chest", 35), tm("mid_chest", 25), tm("anterior_delts", 25), tm("triceps_lateral_head", 15)]),
  ex("machine_fly", "Brust-Fly (Maschine)", "Machine Chest Fly", "chest_fly", [...TARGETS.flyChest],
    ["chest fly machine", "fly maschine"]),
  ex("cable_press_incline_single_arm", "Einarmige Kabel Brustpresse (schräg)", "Single-Arm Incline Cable Press", "incline_press", [...TARGETS.benchIncline]),

  // Back / Lats / Rows
  ex("wide_grip_seated_row", "Sitzendes Rudern (breit)", "Wide-Grip Seated Row", "horizontal_row", [...TARGETS.row]),
  ex("close_grip_seated_row", "Sitzendes Rudern (eng)", "Close-Grip Seated Row", "horizontal_row", [...TARGETS.row],
    ["close cable row"]),
  ex("neutral_grip_seated_row", "Sitzendes Rudern (Neutralgriff)", "Neutral-Grip Seated Row", "horizontal_row", [...TARGETS.row]),
  ex("single_arm_machine_row", "Einarmiges Rudern (Maschine)", "Single-Arm Machine Row", "horizontal_row", [...TARGETS.row]),
  ex("seal_row", "Seal Row", "Seal Row", "horizontal_row", [...TARGETS.row]),
  ex("pendlay_row", "Pendlay Row", "Pendlay Row", "horizontal_row", [...TARGETS.row]),
  ex("smith_bent_over_row", "Rudern (Smith Machine)", "Smith Machine Bent-Over Row", "horizontal_row", [...TARGETS.row]),
  ex("landmine_row", "Landmine Row", "Landmine Row", "horizontal_row", [...TARGETS.row]),
  ex("kroc_row", "Kroc Row", "Kroc Row", "horizontal_row", [...TARGETS.row]),
  ex("machine_lat_pulldown", "Latzug (Maschine)", "Machine Lat Pulldown", "vertical_pull", [...TARGETS.latPull]),
  ex("kneeling_single_arm_lat_pulldown", "Einarmiger Latzug kniend (Kabel)", "Kneeling Single-Arm Lat Pulldown", "vertical_pull", [...TARGETS.latPull]),
  ex("lat_prayer", "Lat Prayer (Kabel)", "Cable Lat Prayer", "straight_arm_pull", [...TARGETS.straightArmPull],
    ["lat prayers"]),
  ex("machine_pullover", "Pullover (Maschine)", "Machine Pullover", "straight_arm_pull", [...TARGETS.straightArmPull],
    ["nautilus pullover"]),
  ex("assisted_chin_up", "Chin-Up (assistiert)", "Assisted Chin-Up", "vertical_pull",
    [tm("latissimus_dorsi", 45), tm("biceps_brachii", 25), tm("brachialis", 15), tm("teres_major", 10), tm("mid_traps", 5)],
    ["machine assisted chin-up"]),
  ex("scapular_pull_up", "Scapula Pull-Up", "Scapular Pull-Up", "vertical_pull",
    [tm("lower_traps", 35), tm("latissimus_dorsi", 30), tm("mid_traps", 20), tm("serratus_anterior", 15)]),
  ex("inverted_row", "Inverted Row", "Inverted Row", "horizontal_row", [...TARGETS.row],
    ["bodyweight row"]),
  ex("cable_shrug", "Shrugs (Kabel)", "Cable Shrug", "shrug", [...TARGETS.shrug]),
  ex("machine_shrug", "Shrugs (Maschine)", "Machine Shrug", "shrug", [...TARGETS.shrug]),
  ex("reverse_cable_fly", "Reverse Fly (Kabelzug über Kreuz)", "Reverse Cable Fly", "rear_delt_raise", [...TARGETS.rearDeltRaise]),
  ex("rear_delt_machine_row", "Rear Delt Row (Maschine)", "Rear Delt Row Machine", "rear_delt_raise",
    [tm("rear_delts", 45), tm("mid_traps", 25), tm("upper_traps", 10), tm("biceps_brachii", 10), tm("rotator_cuff", 10)]),

  // Shoulders
  ex("seated_barbell_overhead_press", "Schulterdrücken sitzend (Langhantel)", "Seated Barbell Overhead Press", "shoulder_press", [...TARGETS.shoulderPress]),
  ex("standing_dumbbell_shoulder_press", "Schulterdrücken stehend (Kurzhantel)", "Standing Dumbbell Shoulder Press", "shoulder_press", [...TARGETS.shoulderPress]),
  ex("push_press", "Push Press", "Push Press", "shoulder_press",
    [tm("anterior_delts", 30), tm("medial_delts", 25), tm("triceps_long_head", 15), tm("triceps_lateral_head", 10), tm("gluteus_maximus", 10), tm("rectus_abdominis", 10)]),
  ex("z_press", "Z-Press", "Z-Press", "shoulder_press",
    [tm("anterior_delts", 35), tm("medial_delts", 30), tm("triceps_long_head", 15), tm("triceps_lateral_head", 10), tm("rectus_abdominis", 10)]),
  ex("single_arm_landmine_press", "Einarmiger Landmine Press", "Single-Arm Landmine Press", "shoulder_press",
    [tm("anterior_delts", 40), tm("upper_chest", 20), tm("medial_delts", 15), tm("triceps_lateral_head", 10), tm("rectus_abdominis", 15)]),
  ex("behind_back_cable_lateral_raise", "Seitheben hinter dem Körper (Kabel)", "Behind-the-Back Cable Lateral Raise", "lateral_raise", [...TARGETS.lateralRaise]),
  ex("single_arm_cable_lateral_raise", "Einarmiges Seitheben (Kabel)", "Single-Arm Cable Lateral Raise", "lateral_raise", [...TARGETS.lateralRaise]),
  ex("lying_lateral_raise", "Seitheben liegend", "Lying Lateral Raise", "lateral_raise", [...TARGETS.lateralRaise]),
  ex("scaption_raise", "Scaption Raise", "Scaption Raise", "front_raise",
    [tm("anterior_delts", 35), tm("medial_delts", 25), tm("rotator_cuff", 30), tm("upper_traps", 10)]),
  ex("front_plate_raise", "Frontheben (Scheibe)", "Plate Front Raise", "front_raise", [...TARGETS.frontRaise]),
  ex("cable_y_raise", "Y-Raise (Kabel)", "Cable Y-Raise", "rear_delt_raise",
    [tm("lower_traps", 30), tm("rear_delts", 25), tm("mid_traps", 20), tm("rotator_cuff", 15), tm("serratus_anterior", 10)]),
  ex("reverse_cable_y_raise", "Reverse Y-Raise (Kabel)", "Reverse Cable Y-Raise", "rear_delt_raise",
    [tm("lower_traps", 30), tm("rear_delts", 30), tm("mid_traps", 20), tm("rotator_cuff", 20)]),
  ex("machine_upright_row", "Aufrechtes Rudern (Maschine)", "Machine Upright Row", "upright_row", [...TARGETS.uprightRow]),
  ex("rope_upright_row", "Aufrechtes Rudern (Seil am Kabel)", "Rope Upright Row", "upright_row", [...TARGETS.uprightRow]),
  ex("plate_lateral_raise", "Seitheben (Scheiben)", "Plate Lateral Raise", "lateral_raise", [...TARGETS.lateralRaise]),

  // Arms
  ex("bayesian_curl", "Bayesian Curl (Kabel)", "Bayesian Cable Curl", "curl", [...TARGETS.curl]),
  ex("spider_curl", "Spider Curl", "Spider Curl", "preacher_curl", [...TARGETS.preacherCurl]),
  ex("drag_curl", "Drag Curl", "Drag Curl", "curl",
    [tm("biceps_brachii", 50), tm("brachialis", 25), tm("rear_delts", 10), tm("brachioradialis", 15)]),
  ex("single_arm_cable_curl", "Einarmiger Bizepscurl (Kabel)", "Single-Arm Cable Curl", "curl", [...TARGETS.curl]),
  ex("high_cable_curl", "High Cable Curl", "High Cable Curl", "curl", [...TARGETS.curl],
    ["double biceps cable curl"]),
  ex("machine_biceps_curl", "Bizepscurl (Maschine)", "Machine Biceps Curl", "curl", [...TARGETS.curl]),
  ex("incline_hammer_curl", "Schrägbank Hammer Curl", "Incline Hammer Curl", "hammer_curl", [...TARGETS.hammerCurl]),
  ex("cross_body_hammer_curl", "Cross-Body Hammer Curl", "Cross-Body Hammer Curl", "hammer_curl", [...TARGETS.hammerCurl]),
  ex("pinwheel_curl", "Pinwheel Curl", "Pinwheel Curl", "hammer_curl", [...TARGETS.hammerCurl]),
  ex("reverse_ez_curl", "Reverse Curl (EZ-Stange)", "EZ-Bar Reverse Curl", "hammer_curl",
    [tm("brachioradialis", 40), tm("forearm_extensors", 35), tm("biceps_brachii", 15), tm("brachialis", 10)]),
  ex("reverse_wrist_curl", "Reverse Wrist Curl", "Reverse Wrist Curl", "curl",
    [tm("forearm_extensors", 75), tm("forearm_flexors", 10), tm("brachioradialis", 15)],
    ["dumbbell reverse-grip forearm curl"]),
  ex("standing_wrist_curl_behind_back", "Handgelenkcurl hinter dem Rücken", "Behind-the-Back Wrist Curl", "curl",
    [tm("forearm_flexors", 80), tm("brachioradialis", 10), tm("forearm_extensors", 10)]),
  ex("v_bar_triceps_pushdown", "Trizepsdrücken (V-Griff)", "V-Bar Triceps Pushdown", "triceps_pushdown", [...TARGETS.tricepsPushdown]),
  ex("straight_bar_triceps_pushdown", "Trizepsdrücken (gerade Stange)", "Straight-Bar Triceps Pushdown", "triceps_pushdown", [...TARGETS.tricepsPushdown]),
  ex("ez_bar_triceps_pushdown", "Trizepsdrücken (EZ-Stange)", "EZ-Bar Triceps Pushdown", "triceps_pushdown", [...TARGETS.tricepsPushdown]),
  ex("reverse_grip_triceps_pushdown", "Trizepsdrücken Untergriff (Kabel)", "Reverse-Grip Triceps Pushdown", "triceps_pushdown",
    [tm("triceps_medial_head", 40), tm("triceps_lateral_head", 30), tm("triceps_long_head", 20), tm("forearm_flexors", 10)]),
  ex("single_arm_overhead_triceps_extension_cable", "Einarmiges Überkopf Trizepsstrecken (Kabel)", "Single-Arm Overhead Cable Triceps Extension", "overhead_triceps", [...TARGETS.overheadTriceps]),
  ex("triceps_kickback_dumbbell", "Trizeps Kickback (Kurzhantel)", "Dumbbell Triceps Kickback", "triceps_pushdown",
    [tm("triceps_lateral_head", 35), tm("triceps_long_head", 35), tm("triceps_medial_head", 20), tm("rear_delts", 10)]),
  ex("triceps_kickback_cable", "Trizeps Kickback (Kabel)", "Cable Triceps Kickback", "triceps_pushdown",
    [tm("triceps_lateral_head", 35), tm("triceps_long_head", 35), tm("triceps_medial_head", 20), tm("rear_delts", 10)]),
  ex("jm_press", "JM Press", "JM Press", "skullcrusher",
    [tm("triceps_long_head", 35), tm("triceps_lateral_head", 30), tm("triceps_medial_head", 20), tm("mid_chest", 10), tm("anterior_delts", 5)]),
  ex("tate_press", "Tate Press", "Tate Press", "overhead_triceps",
    [tm("triceps_long_head", 40), tm("triceps_lateral_head", 30), tm("triceps_medial_head", 20), tm("anterior_delts", 10)]),
  ex("assisted_triceps_dips", "Dips (Trizepsfokus, assistiert)", "Assisted Triceps Dips", "dip_triceps", [...TARGETS.dipTriceps],
    ["machine assisted dip"]),

  // Legs / Glutes / Hinge
  ex("safety_bar_squat", "Safety Bar Squat", "Safety Bar Squat", "squat", [...TARGETS.squat]),
  ex("box_squat", "Box Squat", "Box Squat", "squat", [...TARGETS.squat]),
  ex("pause_back_squat", "Pause Kniebeuge", "Pause Back Squat", "squat", [...TARGETS.squat]),
  ex("tempo_back_squat", "Tempo Kniebeuge", "Tempo Back Squat", "squat", [...TARGETS.squat]),
  ex("zercher_squat", "Zercher Squat", "Zercher Squat", "squat",
    [tm("rectus_femoris", 25), tm("vastus_lateralis", 20), tm("vastus_medialis", 20), tm("gluteus_maximus", 15), tm("erector_spinae", 10), tm("rectus_abdominis", 10)]),
  ex("belt_squat", "Belt Squat", "Belt Squat", "squat",
    [tm("rectus_femoris", 25), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("gluteus_maximus", 20), tm("gluteus_medius", 10)]),
  ex("pendulum_squat", "Pendulum Squat", "Pendulum Squat", "squat",
    [tm("rectus_femoris", 30), tm("vastus_lateralis", 25), tm("vastus_medialis", 20), tm("vastus_intermedius", 15), tm("gluteus_maximus", 10)]),
  ex("landmine_squat", "Landmine Squat", "Landmine Squat", "squat", [...TARGETS.frontSquat]),
  ex("single_leg_press", "Einbeinige Beinpresse", "Single-Leg Press", "leg_press", [...TARGETS.legPress]),
  ex("leg_press_high_feet", "Beinpresse (Füße hoch)", "Leg Press (High Feet)", "leg_press",
    [tm("gluteus_maximus", 25), tm("biceps_femoris", 15), tm("rectus_femoris", 20), tm("vastus_lateralis", 20), tm("vastus_medialis", 20)]),
  ex("leg_press_low_feet", "Beinpresse (Füße tief)", "Leg Press (Low Feet)", "leg_press",
    [tm("rectus_femoris", 30), tm("vastus_lateralis", 25), tm("vastus_medialis", 25), tm("vastus_intermedius", 15), tm("gluteus_maximus", 5)]),
  ex("narrow_stance_leg_press", "Beinpresse (enger Stand)", "Narrow-Stance Leg Press", "leg_press", [...TARGETS.legPress]),
  ex("wide_stance_leg_press", "Beinpresse (weiter Stand)", "Wide-Stance Leg Press", "leg_press",
    [tm("adductors", 20), tm("gluteus_maximus", 20), tm("rectus_femoris", 20), tm("vastus_lateralis", 20), tm("vastus_medialis", 20)]),
  ex("walking_split_squat", "Walking Split Squat", "Walking Split Squat", "lunge", [...TARGETS.lunge]),
  ex("forward_lunge", "Forward Lunge", "Forward Lunge", "lunge", [...TARGETS.lunge]),
  ex("lateral_lunge", "Side Lunge", "Side Lunge", "lunge",
    [tm("adductors", 25), tm("gluteus_maximus", 20), tm("gluteus_medius", 15), tm("rectus_femoris", 15), tm("vastus_lateralis", 15), tm("vastus_medialis", 10)]),
  ex("cossack_squat", "Cossack Squat", "Cossack Squat", "lunge",
    [tm("adductors", 25), tm("gluteus_medius", 20), tm("gluteus_maximus", 15), tm("rectus_femoris", 15), tm("vastus_lateralis", 15), tm("vastus_medialis", 10)]),
  ex("smith_bulgarian_split_squat", "Bulgarian Split Squat (Smith Machine)", "Smith Machine Bulgarian Split Squat", "lunge", [...TARGETS.lunge]),
  ex("deficit_reverse_lunge", "Reverse Lunge (Deficit)", "Deficit Reverse Lunge", "lunge", [...TARGETS.lunge]),
  ex("trap_bar_deadlift", "Trap-Bar Kreuzheben", "Trap Bar Deadlift", "hip_hinge",
    [tm("gluteus_maximus", 25), tm("rectus_femoris", 15), tm("vastus_lateralis", 15), tm("vastus_medialis", 10), tm("biceps_femoris", 10), tm("erector_spinae", 15), tm("upper_traps", 10)],
    ["hex bar deadlift", "trap bar"]),
  ex("trap_bar_rdl", "Trap-Bar Romanian Deadlift", "Trap Bar Romanian Deadlift", "hip_hinge", [...TARGETS.hinge]),
  ex("smith_rdl", "Rumänisches Kreuzheben (Smith Machine)", "Smith Machine Romanian Deadlift", "hip_hinge", [...TARGETS.hinge]),
  ex("single_leg_rdl", "Einbeiniger Romanian Deadlift", "Single-Leg Romanian Deadlift", "hip_hinge",
    [tm("gluteus_maximus", 30), tm("gluteus_medius", 20), tm("biceps_femoris", 15), tm("semitendinosus", 10), tm("semimembranosus", 10), tm("erector_spinae", 10), tm("rectus_abdominis", 5)],
    ["single leg rdl"]),
  ex("barbell_hip_thrust", "Hip Thrust (Langhantel)", "Barbell Hip Thrust", "hip_thrust", [...TARGETS.hipThrust],
    ["barbell glute thrust"]),
  ex("smith_hip_thrust", "Hip Thrust (Smith Machine)", "Smith Machine Hip Thrust", "hip_thrust", [...TARGETS.hipThrust]),
  ex("single_leg_hip_thrust", "Einbeiniger Hip Thrust", "Single-Leg Hip Thrust", "hip_thrust",
    [tm("gluteus_maximus", 55), tm("gluteus_medius", 20), tm("biceps_femoris", 15), tm("rectus_abdominis", 10)]),
  ex("frog_pump", "Frog Pump", "Frog Pump", "hip_thrust",
    [tm("gluteus_maximus", 65), tm("gluteus_medius", 15), tm("adductors", 10), tm("erector_spinae", 10)]),
  ex("kas_glute_bridge", "Kas Glute Bridge", "Kas Glute Bridge", "hip_thrust",
    [tm("gluteus_maximus", 70), tm("gluteus_medius", 15), tm("biceps_femoris", 10), tm("erector_spinae", 5)]),
  ex("machine_glute_kickback", "Glute Kickback (Maschine)", "Machine Glute Kickback", "glute_kickback", [...TARGETS.gluteKickback]),
  ex("standing_cable_hip_abduction", "Hüftabduktion stehend (Kabel)", "Standing Cable Hip Abduction", "abduction", [...TARGETS.abduction]),
  ex("standing_cable_hip_adduction", "Hüftadduktion stehend (Kabel)", "Standing Cable Hip Adduction", "adduction", [...TARGETS.adduction]),
  ex("nordic_hamstring_curl", "Nordic Hamstring Curl", "Nordic Hamstring Curl", "leg_curl",
    [tm("biceps_femoris", 45), tm("semitendinosus", 30), tm("semimembranosus", 20), tm("gastrocnemius", 5)],
    ["nordic curl"]),
  ex("glute_ham_raise", "Glute-Ham Raise", "Glute-Ham Raise", "leg_curl",
    [tm("biceps_femoris", 35), tm("semitendinosus", 25), tm("semimembranosus", 20), tm("gluteus_maximus", 15), tm("erector_spinae", 5)],
    ["ghr"]),
  ex("cable_leg_curl", "Beinbeuger (Kabel)", "Cable Leg Curl", "leg_curl", [...TARGETS.legCurl]),
  ex("sissy_squat", "Sissy Squat", "Sissy Squat", "leg_extension",
    [tm("rectus_femoris", 35), tm("vastus_lateralis", 25), tm("vastus_medialis", 25), tm("vastus_intermedius", 15)]),
  ex("single_leg_calf_raise", "Wadenheben einbeinig", "Single-Leg Calf Raise", "calf_raise", [...TARGETS.calfRaise]),
  ex("tibialis_machine_raise", "Tibialis Raise (Maschine)", "Tibialis Raise Machine", "tibialis_raise", [...TARGETS.tibRaise]),

  // Core / trunk / obliques
  ex("decline_crunch", "Crunch (Negativbank)", "Decline Crunch", "crunch", [...TARGETS.crunch]),
  ex("weighted_crunch", "Crunch (mit Gewicht)", "Weighted Crunch", "crunch", [...TARGETS.crunch]),
  ex("stability_ball_crunch", "Crunch (Gymball)", "Stability Ball Crunch", "crunch", [...TARGETS.crunch]),
  ex("toe_to_bar", "Toes-to-Bar", "Toes-to-Bar", "leg_raise",
    [tm("rectus_abdominis", 35), tm("iliopsoas", 30), tm("transversus_abdominis", 15), tm("external_obliques", 10), tm("internal_obliques", 10)],
    ["ttb", "toes to bar"]),
  ex("hanging_toes_to_bar_knee_raise", "Toes-to-Bar (assistiert / Knie)", "Toes-to-Bar Knee Raise", "leg_raise", [...TARGETS.legRaise]),
  ex("lying_leg_raise", "Liegendes Beinheben", "Lying Leg Raise", "leg_raise", [...TARGETS.legRaise]),
  ex("garhammer_raise", "Garhammer Raise", "Garhammer Raise", "leg_raise",
    [tm("rectus_abdominis", 45), tm("transversus_abdominis", 20), tm("iliopsoas", 20), tm("external_obliques", 10), tm("internal_obliques", 5)]),
  ex("hollow_body_hold", "Hollow Hold", "Hollow Body Hold", "plank",
    [tm("transversus_abdominis", 30), tm("rectus_abdominis", 30), tm("external_obliques", 15), tm("internal_obliques", 15), tm("iliopsoas", 10)]),
  ex("body_saw_plank", "Body Saw Plank", "Body Saw Plank", "plank",
    [tm("transversus_abdominis", 35), tm("rectus_abdominis", 25), tm("external_obliques", 15), tm("internal_obliques", 15), tm("serratus_anterior", 10)]),
  ex("pallof_press", "Pallof Press", "Pallof Press", "rotation_core",
    [tm("external_obliques", 30), tm("internal_obliques", 25), tm("transversus_abdominis", 20), tm("rectus_abdominis", 15), tm("serratus_anterior", 10)]),
  ex("pallof_hold", "Pallof Hold", "Pallof Hold", "rotation_core",
    [tm("external_obliques", 30), tm("internal_obliques", 25), tm("transversus_abdominis", 25), tm("rectus_abdominis", 10), tm("serratus_anterior", 10)]),
  ex("landmine_rotation", "Landmine Rotation", "Landmine Rotation", "rotation_core", [...TARGETS.rotationCore]),
  ex("standing_cable_rotation", "Stehende Rumpfrotation (Kabel)", "Standing Cable Rotation", "rotation_core", [...TARGETS.rotationCore]),
  ex("seated_cable_rotation", "Sitzende Rumpfrotation (Kabel)", "Seated Cable Rotation", "rotation_core", [...TARGETS.rotationCore]),
  ex("bird_dog", "Bird Dog", "Bird Dog", "plank",
    [tm("transversus_abdominis", 25), tm("erector_spinae", 20), tm("gluteus_maximus", 20), tm("rectus_abdominis", 15), tm("external_obliques", 10), tm("internal_obliques", 10)]),
  ex("superman_hold", "Superman Hold", "Superman Hold", "back_extension",
    [tm("erector_spinae", 40), tm("gluteus_maximus", 20), tm("mid_traps", 15), tm("rear_delts", 10), tm("biceps_femoris", 15)]),
  ex("reverse_hyperextension", "Reverse Hyperextension", "Reverse Hyperextension", "back_extension",
    [tm("gluteus_maximus", 35), tm("erector_spinae", 30), tm("biceps_femoris", 20), tm("gluteus_medius", 15)])
];

// ─── Additional machine / isolation variants ──────────────────────────────────
const EXTRA_VARIANTS_3: ExerciseCatalogEntry[] = [
  ex("machine_seated_back_extension", "Rückenstrecker sitzend (Maschine)", "Machine Seated Back Extension", "back_extension",
    [...TARGETS.backExtension],
    ["seated back extension machine", "machine back extension seated"]),
  ex("machine_torso_rotation", "Torso Rotation (Maschine)", "Machine Torso Rotation", "rotation_core",
    [tm("external_obliques", 35), tm("internal_obliques", 30), tm("rectus_abdominis", 20), tm("transversus_abdominis", 15)],
    ["torso rotation machine", "machine seated torso rotation", "rotary torso machine"]),
  ex("machine_alternate_arm_curl", "Alternierende Bizepscurls (Maschine)", "Machine Alternate Arm Curl", "curl",
    [...TARGETS.curl],
    ["alternate arm curl machine"]),
  ex("deficit_deadlift", "Erhöhtes Kreuzheben", "Deficit Deadlift", "hip_hinge",
    [tm("gluteus_maximus", 25), tm("biceps_femoris", 15), tm("semitendinosus", 10), tm("semimembranosus", 10), tm("erector_spinae", 25), tm("rectus_femoris", 10), tm("forearm_flexors", 5)],
    ["deficit deadlifts", "elevated deadlift", "kreuzheben deficit"]),
  ex("zottman_curl", "Zottman Curl", "Zottman Curl", "hammer_curl",
    [tm("biceps_brachii", 35), tm("brachialis", 30), tm("brachioradialis", 25), tm("forearm_extensors", 10)],
    ["zottman curls"]),
  ex("pike_push_up", "Pike Liegestütz", "Pike Push-Up", "shoulder_press",
    [tm("anterior_delts", 40), tm("medial_delts", 25), tm("triceps_lateral_head", 20), tm("upper_chest", 10), tm("lower_traps", 5)],
    ["pike pushup", "pike push up"]),
  ex("diamond_push_up", "Enge Liegestütz (Diamant)", "Diamond Push-Up", "dip_triceps",
    [tm("triceps_lateral_head", 35), tm("triceps_long_head", 25), tm("triceps_medial_head", 20), tm("mid_chest", 15), tm("anterior_delts", 5)],
    ["diamond pushup", "close grip push up", "enges liegestütz"]),
  ex("farmers_carry", "Farmer's Carry", "Farmer's Carry", "farmers_carry",
    [tm("forearm_flexors", 30), tm("upper_traps", 25), tm("erector_spinae", 20), tm("transversus_abdominis", 15), tm("gluteus_medius", 10)],
    ["farmers walk", "farmers carry", "farmers walk exercise", "farmer carry", "farmer walk"]),
  ex("single_arm_farmers_carry", "Einarmiger Farmer's Carry", "Single-Arm Farmer's Carry", "farmers_carry",
    [tm("forearm_flexors", 30), tm("upper_traps", 20), tm("erector_spinae", 20), tm("transversus_abdominis", 20), tm("external_obliques", 10)],
    ["suitcase carry", "suitcase walk", "einarmiger farmers walk"])
];

export const EXERCISE_CATALOG: ExerciseCatalogEntry[] = [
  ...catalog,
  ...EXTRA_VARIANTS,
  ...EXTRA_VARIANTS_2,
  ...EXTRA_VARIANTS_3
];

// ─── Index build ──────────────────────────────────────────────────────────────
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

// ─── Public match / suggest functions ────────────────────────────────────────
export function matchExerciseCatalogEntry(inputName: string): ExerciseCatalogMatch | null {
  const normalized = normalizeText(inputName);
  if (!normalized) return null;
  const compactInput = compactText(inputName);

  const exact = exactAliasIndex.get(normalized);
  if (exact) return { entry: exact, score: 1, strategy: "exact" };

  const compact = compactAliasIndex.get(compactInput);
  if (compact) return { entry: compact, score: 0.98, strategy: "compact" };

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
    if (!dedupeKey || seenLabels.has(dedupeKey)) continue;
    seenLabels.add(dedupeKey);
    suggestions.push({
      key: item.entry.key,
      label,
      score: Math.max(0, Math.min(1, item.score))
    });
    if (suggestions.length >= limit) break;
  }

  return suggestions;
}

export function buildExerciseInfoForMatch(match: ExerciseCatalogMatch, locale: AppLanguage, inputName: string) {
  const info = buildExerciseAiInfoForCatalogMatch(match, locale);
  return {
    inputName,
    targetMuscles: info.targetMuscles,
    executionGuide: info.executionGuide,
    coachingTips: info.coachingTips,
    matchedExerciseName: info.matchedExerciseName,
    matchedExerciseKey: match.entry.key,
    matchScore: info.matchScore,
    matchStrategy: info.matchStrategy
  };
}
