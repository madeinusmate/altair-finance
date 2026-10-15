#!/usr/bin/env tsx

import { createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { GENERIC_PAYEE_ICONS } from "../lib/payees/icon-payees";
import {
  normalizePayeeIconImage,
  PAYEE_ICON_EDGE_PX,
  PAYEE_ICON_MAX_BYTES,
  payeeIconImageSize,
} from "../lib/payees/icon-image";
import { PAYEE_LOGOS } from "../lib/payees/logos";
import { cleanPayee } from "../lib/payees/normalize";
import { matchPayeeBrand, PAYEE_BRANDS, type PayeeBrand } from "./payee-image-brands";

const USER_AGENT = "NetlyPayeeBundle/1.0";
const CACHE_PATH = path.join(process.cwd(), "scripts/.cache/payee-image-cache.json");
const OUTPUT_PATH = path.join(process.cwd(), "lib/payees/images.ts");
const SEPARATOR = /[\s\-*\/!?,.'’]/;

type CacheEntry = { image: string; source: string };
type FetchResult = { image: string; source: string } | { error: string };

const args = process.argv.slice(2);
const reportOnly = args.includes("--report-only");
const csvPath = args.find((arg) => !arg.startsWith("--"));

const logoNames = new Set(
  Object.values(PAYEE_LOGOS)
    .map((logo) => cleanPayee(logo.title)?.normalizedName)
    .filter((name): name is string => Boolean(name))
);

const parseCsv = (filePath: string): Array<{ payee: string; count: number }> => {
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/).slice(1).filter((line) => line.trim());
  return lines.map((line) => {
    if (line.startsWith('"')) {
      const end = line.indexOf('"', 1);
      const payee = line.slice(1, end).replace(/""/g, '"');
      return { payee, count: Number(line.slice(end + 2)) || 0 };
    }
    const comma = line.lastIndexOf(",");
    return { payee: line.slice(0, comma), count: Number(line.slice(comma + 1)) || 0 };
  });
};

const GIVEN_NAMES = new Set(
  `andrea alessandro alberto anna antonio barbara benjamin christoph claudia dario elena elisabeth fabrizio francesco
  giorgio giuseppe gauthier helene helio johann jordi josine juan lukas marco maria marina matteo michael mona nina
  paolo petrus pim robert stefano tirza tommaso walter yuhui zoe giulia luca mario pietro giovanni francesca chiara
  sara laura sofia emma mia hannah lena jonas paul peter hans klaus thomas martin andreas stefan markus daniel
  christian alexander maximilian felix moritz david simon florian sebastian julia katharina sarah lisa marie sophie
  john james william richard joseph charles christopher matthew anthony mark donald steven andrew joshua kenneth
  kevin brian george edward jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon
  samuel raymond gregory patrick jack dennis jerry tyler aaron jose adam nathan henry douglas zachary kyle noah
  ethan jeremy keith roger terry austin sean gerald carl harold dylan arthur lawrence jordan jesse bryan billy joe
  bruce gabriel logan albert willie alan juan wayne elijah randy vincent ralph roy eugene russell bobby philip louis
  mary patricia jennifer linda elizabeth susan jessica karen nancy betty margaret sandra ashley kimberly emily donna
  michelle dorothy carol amanda melissa deborah stephanie rebecca sharon cynthia kathleen amy shirley angela helen
  brenda pamela nicole samantha katherine christine debra rachel carolyn janet catherine heather diane ruth julie
  olivia joyce virginia victoria kelly christina lauren joan evelyn judith megan cheryl martha jacqueline frances
  gloria ann teresa kathryn janice jean alice madison grace judy theresa beverly denise marilyn amber danielle rose
  brittany diana natalie abigail charlotte kayla alexis lori jeanette sienna stephane synne petra marc maurice
  felipe filipe bruno luigi riccardo enrico alessio davide lorenzo giacomo vittorio emanuele fabio roberto massimo
  silvio umberto cesare leandro martino nicolo nicola valentina elisa beatrice camilla noemi irene silvia monica
  patrizia roberta susanna donatella carla franca giuseppina carmela concetta antonella gabriella raffaella werner
  helmut jurgen dieter manfred horst uwe ralf bernd wolfgang heinrich gerhard josef franz karl otto ernst hermann
  friedrich wilhelm ingrid helga ursula gabriele brigitte renate monika sabine kerstin birgit anja katja stefanie
  pierre jean michel philippe alain bernard christophe nicolas laurent olivier francois jacques serge dominique
  thierry stephane isabelle valerie nathalie sandrine sylvie celine aurelie camille julien antoine maxime romain
  baptiste quentin hugo henri manuel javier carlos miguel angel alejandro pablo sergio raul fernando diego andres
  ramon eduardo victor carmen dolores pilar rocio lucia cristina beatriz jan pieter willem hendrik johan kees dirk
  bas sander daan thijs bram luuk sanne femke anne lotte eva iris noor wei ming jun hao ying xin yan fang lei qiang
  jing yu mei ling hong yuhui deepesh raveen`
    .split(/\s+/)
    .map((name) => name.toLowerCase())
    .filter((name) => name.length > 2)
);

const BUSINESS = /\b(bank|cafe|café|coffee|restaurant|ristorante|hotel|ltd|pte|gmbh|srl|inc|llc|group|market|store|shop|bar|bistro|kitchen|bakery|pizza|gym|clinic|medical|dental|pharma|airway|airline|metro|express|studio|agency|insurance|energy|mart|resort|club|museum|cinema|theatre|theater|brewery|brew|beer|wine|grill|food|taxi|parking|rail|ferry|plaza|mall|centre|center|hospital|university|school|ticket|travel|wallet|digital|online|www|http|receipt|payment|expense|expenses|refund|salary|rent|affitto|fees|fine|transfer|paynow|debit|credit|vending|supermarket|airport|lounge|gelato|juice|noodle|ramen|sushi|seafood|hotpot|osteria|pizzeria|pub|hostel|motel|suites|subscription|domain|software|solution|technolog|trading|company|limited|sdn|bhd|holdings|service|services|duty|free|spa|oy\b|bv\b|nv\b|sas\b|snc\b|coop|pte\b|gmbh|ag\b)\b/i;

const genericMatch = (name: string): string | null => {
  const normalized = cleanPayee(name)?.normalizedName;
  if (!normalized) return null;
  for (const generic of GENERIC_PAYEE_ICONS) {
    const keys = [generic.name, ...(generic.aliases ?? [])]
      .map((value) => cleanPayee(value)?.normalizedName)
      .filter((value): value is string => Boolean(value));
    if (keys.some((key) => normalized === key || normalized.startsWith(`${key} `) || (SEPARATOR.test(normalized[key.length] ?? "") && normalized.startsWith(key)))) {
      return generic.name;
    }
  }
  return null;
};

const looksLikePerson = (name: string): boolean => {
  if (BUSINESS.test(name) || /\d/.test(name) || /[@/]/.test(name)) return false;
  const words = name
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/^[('"]+|[)'",.]+$/g, ""))
    .filter((token) => token.length > 0);
  if (words.length < 2 || words.length > 4) return false;
  if (!words.every((word) => /^[A-Za-zÀ-ÖØ-öø-ÿ'’.-]{2,}$/.test(word))) return false;
  return words.some((word) => GIVEN_NAMES.has(word.toLowerCase()));
};

const reportCsv = (filePath: string): void => {
  const rows = parseCsv(filePath);
  let matched = 0;
  let persons = 0;
  let generic = 0;
  let unknown = 0;
  const matchedBrands = new Set<string>();
  const unknownCounts = new Map<string, number>();
  for (const row of rows) {
    const brand = matchPayeeBrand(row.payee);
    if (brand?.brand.domain) {
      matched += 1;
      matchedBrands.add(cleanPayee(brand.brand.title)?.normalizedName ?? brand.brand.title);
      continue;
    }
    if (genericMatch(row.payee)) {
      generic += 1;
      continue;
    }
    if (looksLikePerson(row.payee)) {
      persons += 1;
      continue;
    }
    unknown += 1;
    unknownCounts.set(row.payee, (unknownCounts.get(row.payee) ?? 0) + row.count);
  }
  const existing = [...matchedBrands].filter((name) => logoNames.has(name));
  const added = [...matchedBrands].filter((name) => !logoNames.has(name));
  const topUnknown = [...unknownCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60);
  console.log(
    JSON.stringify(
      {
        csvRows: rows.length,
        matchedRows: matched,
        matchedBrands: matchedBrands.size,
        imagesForExistingLogos: existing.length,
        newImageBrands: added.length,
        genericIconRows: generic,
        skippedPersons: persons,
        skippedUnidentifiable: unknown,
        topUnidentifiable: topUnknown,
      },
      null,
      2
    )
  );
};

const readCache = (): Record<string, CacheEntry> => {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Record<string, CacheEntry>;
  } catch {
    return {};
  }
};

const writeCache = (cache: Record<string, CacheEntry>): void => {
  mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
};

const hostOf = (value: string): string => {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const sameSite = (host: string, domain: string): boolean => {
  const left = host.replace(/^www\./, "");
  const right = domain.replace(/^www\./, "").toLowerCase();
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
};

const fetchBytes = async (
  url: string,
  allowError = false
): Promise<{ bytes: Buffer; finalUrl: string; contentType: string } | null> => {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": USER_AGENT, accept: "image/png,image/webp,image/jpeg,image/*,*/*;q=0.8" },
    });
    if (!response.ok && !allowError) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 32 || bytes.length > 2_000_000) return null;
    return { bytes, finalUrl: response.url || url, contentType: response.headers.get("content-type") ?? "" };
  } catch {
    return null;
  }
};

const iconUrlsFromHtml = (html: string, pageUrl: string): string[] => {
  const found: Array<{ url: string; score: number }> = [];
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !rel.includes("icon")) continue;
    let absolute = "";
    try {
      absolute = new URL(href, pageUrl).href;
    } catch {
      continue;
    }
    const sizes = /sizes=["'](\d+)x\d+["']/i.exec(tag)?.[1];
    const score = (rel.includes("apple") ? 500 : 100) + Number(sizes ?? 0);
    found.push({ url: absolute, score });
  }
  found.sort((a, b) => b.score - a.score);
  return [...new Set(found.map((item) => item.url))];
};

let globeHash = "";

const loadGlobeHash = async (): Promise<void> => {
  // Google answers an unknown domain with 404 and the default globe PNG.
  const globe = await fetchBytes("https://www.google.com/s2/favicons?domain=invalid-domain-xyz123.example&sz=128", true);
  globeHash = globe ? createHash("sha256").update(globe.bytes).digest("hex") : "";
};

type SharpFactory = typeof import("sharp").default;

type IcoRaster = { png: Buffer } | { raw: Buffer; width: number; height: number };

const decodeIco = (bytes: Buffer): IcoRaster | null => {
  if (bytes.length < 22 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) return null;
  const count = bytes.readUInt16LE(4);
  let best: { width: number; height: number; offset: number; size: number } | null = null;
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    if (entry + 16 > bytes.length) return null;
    const width = bytes[entry] === 0 ? 256 : bytes[entry];
    const height = bytes[entry + 1] === 0 ? 256 : bytes[entry + 1];
    const size = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    if (offset <= 0 || size <= 0 || offset + size > bytes.length) continue;
    if (!best || width * height > best.width * best.height) best = { width, height, offset, size };
  }
  if (!best) return null;
  const image = bytes.subarray(best.offset, best.offset + best.size);
  if (image.length >= 8 && image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47) {
    return { png: Buffer.from(image) };
  }
  if (image.length < 40 || image.readUInt32LE(0) < 40) return null;
  const headerSize = image.readUInt32LE(0);
  const width = image.readInt32LE(4);
  const heightField = image.readInt32LE(8);
  const bitCount = image.readUInt16LE(14);
  const compression = image.readUInt32LE(16);
  if (width <= 0 || width > 256 || compression !== 0) return null;
  const height = heightField > width ? Math.floor(heightField / 2) : Math.abs(heightField);
  if (height <= 0 || height > 256 || (bitCount !== 32 && bitCount !== 24 && bitCount !== 8)) return null;
  const stride = Math.ceil((width * bitCount) / 32) * 4;
  let palette: Buffer | null = null;
  let pixelOffset = headerSize;
  if (bitCount === 8) {
    const colors = image.readUInt32LE(32) || 256;
    palette = image.subarray(headerSize, headerSize + colors * 4);
    pixelOffset = headerSize + colors * 4;
  }
  if (pixelOffset + stride * height > image.length) return null;
  const raw = Buffer.alloc(width * height * 4);
  let opaque = 0;
  for (let y = 0; y < height; y += 1) {
    const srcY = heightField > 0 ? height - 1 - y : y;
    const row = pixelOffset + srcY * stride;
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      if (bitCount === 8 && palette) {
        const color = image[row + x] * 4;
        raw[target] = palette[color + 2] ?? 0;
        raw[target + 1] = palette[color + 1] ?? 0;
        raw[target + 2] = palette[color] ?? 0;
        raw[target + 3] = 255;
        opaque += 1;
        continue;
      }
      const source = row + x * (bitCount / 8);
      raw[target] = image[source + 2] ?? 0;
      raw[target + 1] = image[source + 1] ?? 0;
      raw[target + 2] = image[source] ?? 0;
      const alpha = bitCount === 32 ? (image[source + 3] ?? 255) : 255;
      raw[target + 3] = alpha;
      if (alpha > 0) opaque += 1;
    }
  }
  if (opaque === 0) {
    for (let pixel = 3; pixel < raw.length; pixel += 4) raw[pixel] = 255;
  }
  return { raw, width, height };
};

const encodeIcon = async (
  bytes: Buffer,
  sharp: SharpFactory
): Promise<{ image: string; edge: number } | null> => {
  try {
    let input = bytes;
    let edge = 0;
    try {
      const metadata = await sharp(bytes, { failOn: "none", animated: false, limitInputPixels: 20_000_000 }).metadata();
      if (!metadata.width || !metadata.height || metadata.width < 8 || metadata.height < 8) return null;
      edge = Math.max(metadata.width, metadata.height);
    } catch {
      const decoded = decodeIco(bytes);
      if (!decoded) return null;
      if ("png" in decoded) {
        input = decoded.png;
        const metadata = await sharp(input, { failOn: "none" }).metadata();
        if (!metadata.width || !metadata.height) return null;
        edge = Math.max(metadata.width, metadata.height);
      } else {
        input = await sharp(decoded.raw, { raw: { width: decoded.width, height: decoded.height, channels: 4 } }).png().toBuffer();
        edge = Math.max(decoded.width, decoded.height);
      }
    }
    const attempts: Array<{ format: "webp" | "png" | "jpeg"; quality: number }> = [
      { format: "webp", quality: 80 },
      { format: "webp", quality: 60 },
      { format: "webp", quality: 40 },
      { format: "png", quality: 80 },
      { format: "jpeg", quality: 70 },
      { format: "jpeg", quality: 50 },
    ];
    for (const attempt of attempts) {
      let pipeline = sharp(input, { failOn: "none", animated: false }).resize(PAYEE_ICON_EDGE_PX, PAYEE_ICON_EDGE_PX, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
      if (attempt.format === "jpeg") {
        pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: attempt.quality });
      } else if (attempt.format === "png") {
        pipeline = pipeline.png({ compressionLevel: 9 });
      } else {
        pipeline = pipeline.webp({ quality: attempt.quality, alphaQuality: attempt.quality });
      }
      const encoded = await pipeline.toBuffer();
      if (encoded.length > PAYEE_ICON_MAX_BYTES) continue;
      const subtype = attempt.format === "jpeg" ? "jpeg" : attempt.format;
      const dataUrl = `data:image/${subtype};base64,${encoded.toString("base64")}`;
      const normalized = normalizePayeeIconImage(dataUrl);
      const size = normalized ? payeeIconImageSize(normalized) : null;
      if (!normalized || size?.width !== PAYEE_ICON_EDGE_PX || size.height !== PAYEE_ICON_EDGE_PX) continue;
      return { image: normalized, edge };
    }
  } catch {
    return null;
  }
  return null;
};

const fetchBrandIcon = async (domain: string, sharp: SharpFactory): Promise<FetchResult> => {
  const homepage = await fetchBytes(`https://${domain}`);
  const linked = new Set<string>();
  const candidates: string[] = [];
  if (homepage && sameSite(hostOf(homepage.finalUrl), domain) && !homepage.contentType.includes("image/")) {
    const html = homepage.bytes.toString("utf8").slice(0, 300_000);
    for (const url of iconUrlsFromHtml(html, homepage.finalUrl)) {
      linked.add(url);
      candidates.push(url);
    }
  }
  for (const suffix of ["/apple-touch-icon.png", "/apple-touch-icon-precomposed.png", "/favicon-32x32.png", "/favicon.ico"]) {
    candidates.push(`https://${domain}${suffix}`);
  }
  let best: { image: string; source: string; edge: number } | null = null;
  for (const url of [...new Set(candidates)]) {
    const file = await fetchBytes(url);
    if (!file || file.contentType.includes("text/html")) continue;
    // Icons declared on the brand page may live on that brand's CDN. Guessed paths must stay on-site.
    if (!linked.has(url) && !sameSite(hostOf(file.finalUrl), domain)) continue;
    const encoded = await encodeIcon(file.bytes, sharp);
    if (!encoded) continue;
    if (!best || encoded.edge > best.edge) {
      best = { image: encoded.image, source: hostOf(file.finalUrl) || domain, edge: encoded.edge };
    }
    if (best.edge >= 96) break;
  }
  if (!best || best.edge < 48) {
    const google = await fetchBytes(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
    if (google && globeHash) {
      const hash = createHash("sha256").update(google.bytes).digest("hex");
      if (hash !== globeHash) {
        const encoded = await encodeIcon(google.bytes, sharp);
        if (encoded && (!best || encoded.edge > best.edge)) {
          return { image: encoded.image, source: `google-favicon:${domain}` };
        }
      }
    }
  }
  if (best) return { image: best.image, source: best.source };
  return { error: `no icon for ${domain}` };
};

const mapPool = async <T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const run = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
};

const assertUniqueTitles = (): void => {
  const seen = new Map<string, string>();
  for (const brand of PAYEE_BRANDS) {
    const normalized = cleanPayee(brand.title)?.normalizedName;
    if (!normalized) throw new Error(`Blank brand title: ${brand.title}`);
    const previous = seen.get(normalized);
    if (previous) throw new Error(`Duplicate brand ${normalized}: ${previous} and ${brand.title}`);
    seen.set(normalized, brand.title);
    if (!brand.domain) throw new Error(`Missing domain for ${brand.title}`);
  }
};

const writeBundle = (entries: Array<{ key: string; title: string; domain: string; image: string }>): void => {
  const lines = entries
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => `  ${JSON.stringify(entry.key)}: ${JSON.stringify({ title: entry.title, domain: entry.domain, image: entry.image })}`);
  const source = `// Generated by scripts/fetch-payee-images.ts. Do not edit by hand.
// Each image is a 64px PNG, JPEG, or WebP data URL fetched from the brand domain.

export type PayeeBundleImage = {
  title: string;
  domain: string;
  image: string;
};

export const PAYEE_BUNDLE_IMAGES: Record<string, PayeeBundleImage> = {
${lines.join(",\n")}
};
`;
  writeFileSync(OUTPUT_PATH, source);
};

const main = async (): Promise<void> => {
  assertUniqueTitles();
  if (csvPath) reportCsv(csvPath);
  if (reportOnly) return;

  await loadGlobeHash();
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;
  const cache = readCache();
  const brands = PAYEE_BRANDS.filter((brand): brand is PayeeBrand & { domain: string } => Boolean(brand.domain));
  const failures: string[] = [];
  const googleFallbacks: string[] = [];
  let done = 0;
  const encoded = await mapPool(brands, 8, async (brand) => {
    const cached = cache[brand.domain];
    if (cached?.image) {
      done += 1;
      return { brand, image: cached.image, source: cached.source };
    }
    const result = await fetchBrandIcon(brand.domain, sharp);
    done += 1;
    if ("error" in result) {
      failures.push(`${brand.title} (${brand.domain}): ${result.error}`);
      console.error(`miss ${done}/${brands.length} ${brand.title}`);
      return { brand, image: null, source: "" };
    }
    cache[brand.domain] = { image: result.image, source: result.source };
    if (done % 10 === 0) writeCache(cache);
    if (result.source.startsWith("google-favicon:")) googleFallbacks.push(`${brand.title} -> ${result.source}`);
    console.error(`ok ${done}/${brands.length} ${brand.title} ${result.source}`);
    return { brand, image: result.image, source: result.source };
  });
  writeCache(cache);

  const entries = encoded.flatMap((item) => {
    if (!item.image) return [];
    const key = cleanPayee(item.brand.title)?.normalizedName;
    if (!key) return [];
    return [{ key, title: item.brand.title, domain: item.brand.domain, image: item.image }];
  });
  writeBundle(entries);
  const existing = entries.filter((entry) => logoNames.has(entry.key)).length;
  console.log(
    JSON.stringify(
      {
        written: entries.length,
        imagesForExistingLogos: existing,
        newImageBrands: entries.length - existing,
        failed: failures.length,
        failures,
        googleFallbacks,
        review: PAYEE_BRANDS.filter((brand) => brand.review && entries.some((entry) => entry.domain === brand.domain && entry.title === brand.title)).map(
          (brand) => ({ title: brand.title, domain: brand.domain, review: brand.review })
        ),
      },
      null,
      2
    )
  );
};

const isDirectRun = process.argv[1]?.includes("fetch-payee-images");
if (isDirectRun) void main();
