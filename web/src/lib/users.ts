/**
 * Simulated demo users (decision of 6 Nov 2026, PLAN.md section 9), based on
 * the three personas in "Sprint3_Personas_Journeys_v3" (Luisa, 6 Nov 2026).
 * Names are fictional and, as in the deck, first names only.
 * This is not a login: anyone can switch user in the account menu.
 */
export type Role = "category-manager" | "scope3-manager" | "cpo";

export interface DemoUser {
  id: string;
  name: string;
  initials: string;
  title: string;
  /** Short role under the name in the header (16 Nov 2026), e.g. "CPO". */
  shortTitle: string;
  /** Persona role from the deck: user, rule setter + data user, payer. */
  persona: string;
  role: Role;
  /** May start agent runs. */
  canRun: boolean;
  /** May record decisions. */
  canDecide: boolean;
  /** Sees spend and contract details on the suppliers page. */
  seesCommercials: boolean;
  /** May change the buyer rules (rules page). */
  canEditRules: boolean;
  /** Favourite suppliers until the user changes them (16 Nov 2026). */
  defaultFavourites: string[];
}

export const COMPANY = "Rheintal Antriebe GmbH";

export const DEMO_USERS: DemoUser[] = [
  {
    // Awards suppliers for his categories; picks the best offer and defends the choice.
    id: "thomas",
    name: "Thomas",
    initials: "T",
    title: "Category Manager, Direct Materials",
    shortTitle: "Category Manager",
    persona: "User",
    role: "category-manager",
    canRun: true,
    canDecide: true,
    seesCommercials: true,
    canEditRules: false,
    // Current suppliers of his categories: Alucast Schwaben (aluminium), Donautal Stahl (steel).
    defaultFavourites: ["S-0013", "S-0007"],
  },
  {
    // Owns the Scope 3 numbers; sets knock-outs and risk rules buyers must follow.
    id: "sarah",
    name: "Sarah",
    initials: "S",
    title: "Scope 3 / Sustainable Procurement Manager",
    shortTitle: "Scope 3 Manager",
    persona: "Rule setter + data user",
    role: "scope3-manager",
    canRun: false,
    canDecide: false,
    seesCommercials: false,
    canEditRules: true,
    // Suppliers with good CO₂ data: Alu-Druckguss Erzgebirge (verified footprint), Elbkupfer.
    defaultFavourites: ["S-0015", "S-0021"],
  },
  {
    // Owns spend, team and tool budget; sees results across categories.
    id: "katrin",
    name: "Katrin",
    initials: "K",
    title: "Chief Procurement Officer (CPO)",
    shortTitle: "CPO",
    persona: "Payer",
    role: "cpo",
    canRun: false,
    canDecide: false,
    seesCommercials: true,
    canEditRules: false,
    // The two largest suppliers by annual spend: Weserland Aluminium, Neckartal Elektronik.
    defaultFavourites: ["S-0012", "S-0032"],
  },
];

/** Pages in the navigation per role (expert interviews, 10 Nov 2026): pages a role does not need are hidden. The glossary is open to everyone from the help menu (16 Nov 2026). */
export type NavPage = "queue" | "process" | "dashboard" | "suppliers" | "sustainability" | "targets" | "impact" | "rules" | "decisions" | "glossary";

export const NAV_BY_ROLE: Record<Role, NavPage[]> = {
  "category-manager": ["queue", "process", "suppliers", "impact", "decisions"],
  // CO₂ targets first: "are we on track?" is Sarah's starting point (expert feedback, decision of 12 Nov 2026).
  "scope3-manager": ["targets", "sustainability", "impact", "suppliers", "rules"],
  // The CPO only wants the big picture: no single materials, no employee targets (expert interviews).
  cpo: ["dashboard", "suppliers"],
};

/** First page after sign-in. */
export const START_PAGE: Record<Role, NavPage> = {
  "category-manager": "queue",
  "scope3-manager": "targets",
  cpo: "dashboard",
};

export const VIEW_ONLY_HINT = "View only: in this demo only the category manager starts runs and records decisions.";

const KEY = "scc-demo-user-v2";

/** Last chosen demo user in this browser; Thomas if none is stored or storage is unavailable. */
export function loadUser(): DemoUser {
  try {
    const id = window.localStorage.getItem(KEY);
    return DEMO_USERS.find((u) => u.id === id) ?? DEMO_USERS[0];
  } catch {
    return DEMO_USERS[0];
  }
}

export function saveUser(user: DemoUser): void {
  try {
    window.localStorage.setItem(KEY, user.id);
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
}
