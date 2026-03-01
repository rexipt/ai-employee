import fs from "node:fs/promises";
import path from "node:path";
import Handlebars from "handlebars";
import { CachedStoreData } from "./store-cache";
import { AppConfig } from "../types";

// Directory where user can place custom skill MD files
const CONFIG_DIR = path.join(process.env.HOME || "~", ".rexipt", "ai-employee");
const SKILLS_DIR = path.join(CONFIG_DIR, "skills");

// Get the path to bundled default skills
// skills/ folder is at package root (same level as src/, dist/)
function getDefaultSkillsPath(): string {
  // __dirname is src/lib or dist/lib, so go up 2 levels to package root
  const packageRoot = path.resolve(__dirname, "..", "..");
  return path.join(packageRoot, "skills");
}

const DEFAULT_SKILLS_PATH = getDefaultSkillsPath();

export interface SkillContext {
  store: {
    name: string;
    url: string;
    niche: string;
    targetMargin: number;
    targetMarginPercent: string;
    constraints: string[];
    hasConstraints: boolean;
  };
  metrics: {
    revenue: number;
    revenueFormatted: string;
    orders: number;
    aov: number;
    aovFormatted: string;
    currency: string;
  };
  platforms: {
    active: string[];
    activeList: string;
    hasMultiple: boolean;
  };
  topProducts: Array<{
    name: string;
    revenue: number;
    revenueFormatted: string;
  }>;
  organization: {
    name: string;
    timezone: string;
    currency: string;
  };
  // Raw data for advanced templates
  raw: {
    storeData: CachedStoreData;
    config: AppConfig;
  };
}

/**
 * Register Handlebars helpers for skill templates
 */
function registerHelpers(): void {
  // Format currency
  Handlebars.registerHelper("currency", (value: number, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value);
  });

  // Format percentage
  Handlebars.registerHelper("percent", (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  });

  // Join array with separator
  Handlebars.registerHelper("join", (arr: string[], separator = ", ") => {
    return Array.isArray(arr) ? arr.join(separator) : "";
  });

  // Check if array is empty
  Handlebars.registerHelper("isEmpty", (arr: unknown[]) => {
    return !arr || arr.length === 0;
  });

  // Check if array is not empty
  Handlebars.registerHelper("isNotEmpty", (arr: unknown[]) => {
    return arr && arr.length > 0;
  });

  // Conditional based on value
  Handlebars.registerHelper("ifPositive", function (this: unknown, value: number, options: Handlebars.HelperOptions) {
    return value > 0 ? options.fn(this) : options.inverse(this);
  });

  // Format date
  Handlebars.registerHelper("formatDate", (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  // Current date
  Handlebars.registerHelper("now", () => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });
}

// Register helpers once
registerHelpers();

/**
 * Convert skill ID from camelCase to kebab-case for file names
 * e.g., dailyBriefing -> daily-briefing
 */
function skillIdToFileName(skillId: string): string {
  return skillId.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Build the context object for skill templates
 */
export function buildSkillContext(storeData: CachedStoreData, config: AppConfig): SkillContext {
  const currency = config.organization.currency || "USD";
  
  return {
    store: {
      name: storeData.storeName,
      url: storeData.storeUrl,
      niche: storeData.niche,
      targetMargin: storeData.targetMargin,
      targetMarginPercent: `${(storeData.targetMargin * 100).toFixed(0)}%`,
      constraints: storeData.constraints,
      hasConstraints: storeData.constraints.length > 0,
    },
    metrics: {
      revenue: storeData.recentMetrics.revenue,
      revenueFormatted: `$${storeData.recentMetrics.revenue.toFixed(2)}`,
      orders: storeData.recentMetrics.orders,
      aov: storeData.calculatedAOV,
      aovFormatted: `$${storeData.calculatedAOV.toFixed(2)}`,
      currency,
    },
    platforms: {
      active: storeData.activePlatforms,
      activeList: storeData.activePlatforms.join(", "),
      hasMultiple: storeData.activePlatforms.length > 1,
    },
    topProducts: storeData.topProducts.map(p => ({
      name: p.name,
      revenue: p.revenue,
      revenueFormatted: `$${p.revenue.toFixed(2)}`,
    })),
    organization: {
      name: config.organization.name,
      timezone: config.organization.timezone,
      currency,
    },
    raw: {
      storeData,
      config,
    },
  };
}

/**
 * Load a skill's markdown template
 * Checks user's custom skills first, falls back to defaults
 * Throws error if no template found - we don't support hardcoded prompts
 */
export async function loadSkillTemplate(skillId: string): Promise<string> {
  // Convert camelCase skillId to kebab-case for file names
  const fileName = skillIdToFileName(skillId);
  const userSkillPath = path.join(SKILLS_DIR, `${fileName}.md`);
  
  // Try user's custom skill first (both camelCase and kebab-case)
  for (const name of [fileName, skillId]) {
    try {
      const content = await fs.readFile(path.join(SKILLS_DIR, `${name}.md`), "utf-8");
      return content;
    } catch {
      // Try next
    }
  }
  
  // Try bundled default skills (skills/ at package root)
  const triedPaths: string[] = [userSkillPath, path.join(SKILLS_DIR, `${skillId}.md`)];
  
  // Try both naming conventions in the default skills folder
  for (const name of [fileName, skillId]) {
    const skillPath = path.join(DEFAULT_SKILLS_PATH, `${name}.md`);
    triedPaths.push(skillPath);
    
    try {
      const content = await fs.readFile(skillPath, "utf-8");
      return content;
    } catch {
      // Try next name
    }
  }
  
  // No template found - this is an error, not a fallback situation
  throw new Error(
    `Skill template not found for '${skillId}'.\n\n` +
    `Searched in:\n${triedPaths.map(p => `  - ${p}`).join("\n")}\n\n` +
    `Create a custom skill template at:\n  ${userSkillPath}\n\n` +
    `Or check your @rexipt/ai-employee installation.`
  );
}

/**
 * Load and compile a skill template with context
 * Always returns a compiled template - throws if template not found or invalid
 */
export async function loadSkillPrompt(
  skillId: string,
  storeData: CachedStoreData,
  config: AppConfig,
): Promise<string> {
  const template = await loadSkillTemplate(skillId);
  const context = buildSkillContext(storeData, config);
  
  try {
    const compiled = Handlebars.compile(template);
    return compiled(context);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to compile skill template '${skillId}': ${errorMessage}\n` +
      `Check the template syntax for Handlebars errors.`
    );
  }
}

/**
 * Ensure the skills directory exists
 */
export async function ensureSkillsDir(): Promise<void> {
  try {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

/**
 * List available skills (both default and custom)
 */
export async function listAvailableSkills(): Promise<{ skillId: string; isCustom: boolean }[]> {
  const skills: { skillId: string; isCustom: boolean }[] = [];
  
  // Check bundled default skills
  try {
    const defaultFiles = await fs.readdir(DEFAULT_SKILLS_PATH);
    for (const file of defaultFiles) {
      if (file.endsWith(".md")) {
        const skillId = file.replace(".md", "");
        skills.push({
          skillId,
          isCustom: false,
        });
      }
    }
  } catch {
    // Default skills folder doesn't exist
  }
  
  // Check custom skills (override defaults)
  try {
    const customFiles = await fs.readdir(SKILLS_DIR);
    for (const file of customFiles) {
      if (file.endsWith(".md")) {
        const skillId = file.replace(".md", "");
        const existing = skills.find(s => s.skillId === skillId);
        if (existing) {
          existing.isCustom = true;
        } else {
          skills.push({
            skillId,
            isCustom: true,
          });
        }
      }
    }
  } catch {
    // No custom skills directory yet
  }
  
  return skills;
}
