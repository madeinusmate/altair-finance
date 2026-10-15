export type Credit = {
  name: string;
  url: string;
  role: string;
};

export type CreditGroup = {
  title: string;
  libraries: Credit[];
};

export const author = {
  name: "@madeinusmate",
  url: "https://github.com/madeinusmate",
} as const;

export const repository = {
  name: "github.com/madeinusmate/altair",
  url: "https://github.com/madeinusmate/altair",
} as const;

export const license = {
  name: "MIT",
  url: "https://github.com/madeinusmate/altair/blob/main/LICENSE",
} as const;

// Libraries the app imports or vendors. Unused packages in package.json stay off this list.
export const libraryGroups: CreditGroup[] = [
  {
    title: "Application",
    libraries: [
      { name: "Next.js", url: "https://github.com/vercel/next.js", role: "App framework" },
      { name: "React", url: "https://github.com/facebook/react", role: "User interface" },
      { name: "Electron", url: "https://github.com/electron/electron", role: "Desktop shell" },
    ],
  },
  {
    title: "Data",
    libraries: [
      { name: "Drizzle ORM", url: "https://github.com/drizzle-team/drizzle-orm", role: "Database queries" },
      {
        name: "better-sqlite3-multiple-ciphers",
        url: "https://github.com/m4heshd/better-sqlite3-multiple-ciphers",
        role: "SQLite driver",
      },
      { name: "SQLCipher", url: "https://github.com/sqlcipher/sqlcipher", role: "Database encryption" },
      { name: "uuid", url: "https://github.com/uuidjs/uuid", role: "Identifiers" },
      { name: "date-fns", url: "https://github.com/date-fns/date-fns", role: "Dates" },
    ],
  },
  {
    title: "Interface",
    libraries: [
      { name: "Tailwind CSS", url: "https://github.com/tailwindlabs/tailwindcss", role: "Styling" },
      { name: "Radix UI", url: "https://github.com/radix-ui/primitives", role: "Interface primitives" },
      { name: "shadcn/ui", url: "https://github.com/shadcn-ui/ui", role: "Component patterns" },
      { name: "Lucide", url: "https://github.com/lucide-icons/lucide", role: "Icons" },
      { name: "next-themes", url: "https://github.com/pacocoursey/next-themes", role: "Light and dark theme" },
      { name: "Sonner", url: "https://github.com/emilkowalski/sonner", role: "Notifications" },
      { name: "Inter", url: "https://github.com/rsms/inter", role: "Typeface" },
      { name: "Geist Mono", url: "https://github.com/vercel/geist", role: "Monospace type" },
    ],
  },
  {
    title: "Charts",
    libraries: [
      { name: "Recharts", url: "https://github.com/recharts/recharts", role: "Charts" },
      { name: "Nivo", url: "https://github.com/plouc/nivo", role: "Cash flow diagram" },
      { name: "Three.js", url: "https://github.com/mrdoob/three.js", role: "Card surface" },
    ],
  },
  {
    title: "Import and backup",
    libraries: [
      { name: "Papa Parse", url: "https://github.com/mholt/PapaParse", role: "CSV import" },
      { name: "OpenAI Node", url: "https://github.com/openai/openai-node", role: "Statement reading" },
      { name: "Archiver", url: "https://github.com/archiverjs/node-archiver", role: "Database export" },
      { name: "yauzl", url: "https://github.com/thejoshwolfe/yauzl", role: "Database import" },
    ],
  },
];

export const isGitHubCreditUrl = (value: string): boolean => {
  if (value.length === 0 || value.length > 300) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
};
