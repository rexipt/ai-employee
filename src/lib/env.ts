import dotenv from "dotenv";

let loaded = false;

export function loadEnv(): void {
  if (loaded) {
    return;
  }

  dotenv.config();
  dotenv.config({ path: ".env.local", override: true });
  loaded = true;
}
