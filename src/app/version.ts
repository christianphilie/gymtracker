import packageJson from "../../package.json";

export const APP_VERSION = packageJson.version;
export const APP_DATA_EXPORT_VERSION = "1.0" as const;
export const DB_SCHEMA_VERSION = 10 as const;

export const LAST_SEEN_APP_VERSION_KEY = "gymtracker:last-seen-app-version";
export const MAX_UPDATE_SAFETY_SNAPSHOTS = 3;
