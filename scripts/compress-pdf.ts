#!/usr/bin/env tsx

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

type ParsedArgs = {
  inputDir: string;
  preset: string;
  dpi: number;
};

const VALID_PRESETS = new Set([
  "screen",
  "ebook",
  "printer",
  "prepress",
  "default",
]);

const DEFAULT_PRESET = "ebook";
const DEFAULT_DPI = 150;
const DEFAULT_INPUT_DIR = path.join(process.cwd(), "statements");

const printUsage = (): void => {
  console.log(
    [
      "Usage:",
      "  pnpm compress-pdf [input-dir] [--preset <screen|ebook|printer|prepress|default>] [--dpi <number>]",
      "",
      "Examples:",
      "  pnpm compress-pdf",
      "  pnpm compress-pdf statements --preset printer --dpi 200",
      "",
      "Notes:",
      "  - Requires Ghostscript (gs) installed and available on PATH.",
      "  - Preset default is 'ebook' with DPI 150.",
      "  - Output is saved in <input-dir>/compressed/<name>_compressed.pdf",
    ].join("\n")
  );
};

const isGsAvailable = (): boolean => {
  const result = spawnSync("gs", ["-v"], { stdio: "ignore" });
  return result.status === 0;
};

const ensureOutputDir = (outputPath: string): void => {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const readArgValue = (
  args: string[],
  index: number,
  label: string
): string => {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Error: Missing value for ${label}.`);
    printUsage();
    process.exit(1);
  }
  return value;
};

const parseArgs = (argv: string[]): ParsedArgs => {
  const args = argv.slice(2);
  let inputDir = DEFAULT_INPUT_DIR;
  let preset = DEFAULT_PRESET;
  let dpi = DEFAULT_DPI;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (!arg.startsWith("--")) {
      if (inputDir !== DEFAULT_INPUT_DIR) {
        console.error("Error: Only one input directory can be specified.");
        printUsage();
        process.exit(1);
      }
      inputDir = arg;
      continue;
    }

    if (arg === "--preset") {
      preset = readArgValue(args, i, "--preset");
      i += 1;
      continue;
    }

    if (arg.startsWith("--preset=")) {
      preset = arg.split("=")[1] ?? "";
      continue;
    }

    if (arg === "--dpi") {
      const value = readArgValue(args, i, "--dpi");
      dpi = Number(value);
      i += 1;
      continue;
    }

    if (arg.startsWith("--dpi=")) {
      dpi = Number(arg.split("=")[1]);
      continue;
    }

    console.error(`Error: Unknown argument ${arg}`);
    printUsage();
    process.exit(1);
  }

  if (!VALID_PRESETS.has(preset)) {
    console.error(`Error: Invalid preset "${preset}".`);
    console.error(`Valid presets: ${Array.from(VALID_PRESETS).join(", ")}`);
    process.exit(1);
  }

  if (!Number.isFinite(dpi) || dpi <= 0) {
    console.error("Error: dpi must be a positive number.");
    process.exit(1);
  }

  return { inputDir, preset, dpi };
};

const validateInputDir = (inputDir: string): void => {
  if (!fs.existsSync(inputDir)) {
    console.error(`Error: Input directory not found: ${inputDir}`);
    process.exit(1);
  }
  if (!fs.statSync(inputDir).isDirectory()) {
    console.error(`Error: Input path is not a directory: ${inputDir}`);
    process.exit(1);
  }
};

const buildGsArgs = (
  inputPath: string,
  outputPath: string,
  options: ParsedArgs
): string[] => [
  "-sDEVICE=pdfwrite",
  "-dCompatibilityLevel=1.4",
  "-dNOPAUSE",
  "-dBATCH",
  "-dSAFER",
  `-dPDFSETTINGS=/${options.preset}`,
  "-dDetectDuplicateImages=true",
  "-dCompressFonts=true",
  "-dDownsampleColorImages=true",
  "-dDownsampleGrayImages=true",
  "-dDownsampleMonoImages=true",
  `-dColorImageResolution=${options.dpi}`,
  `-dGrayImageResolution=${options.dpi}`,
  `-dMonoImageResolution=${options.dpi}`,
  `-sOutputFile=${outputPath}`,
  inputPath,
];

const getOutputPath = (inputPath: string, outputDir: string): string => {
  const { name, ext } = path.parse(inputPath);
  return path.join(outputDir, `${name}_compressed${ext || ".pdf"}`);
};

const getPdfFiles = (inputDir: string): string[] => {
  const entries = fs.readdirSync(inputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(inputDir, entry.name))
    .filter((filePath) => filePath.toLowerCase().endsWith(".pdf"))
    .sort();
};

const run = (): void => {
  const options = parseArgs(process.argv);

  if (!isGsAvailable()) {
    console.error("Error: Ghostscript (gs) is not installed or not on PATH.");
    console.error("Install with: brew install ghostscript");
    process.exit(1);
  }

  validateInputDir(options.inputDir);
  const outputDir = path.join(options.inputDir, "compressed");
  ensureOutputDir(path.join(outputDir, "placeholder.pdf"));

  const pdfFiles = getPdfFiles(options.inputDir);
  if (pdfFiles.length === 0) {
    console.log("No PDF files found to compress.");
    return;
  }

  console.log(`Compressing ${pdfFiles.length} PDF(s)...`);
  console.log(`Input dir:  ${options.inputDir}`);
  console.log(`Output dir: ${outputDir}`);
  console.log(`Preset: ${options.preset}`);
  console.log(`DPI:    ${options.dpi}`);

  for (const inputPath of pdfFiles) {
    const outputPath = getOutputPath(inputPath, outputDir);
    console.log(`\nInput:  ${inputPath}`);
    console.log(`Output: ${outputPath}`);

    const result = spawnSync("gs", buildGsArgs(inputPath, outputPath, options), {
      stdio: "inherit",
    });

    if (result.status !== 0) {
      console.error("Error: Ghostscript failed to compress the PDF.");
      process.exit(result.status ?? 1);
    }
  }

  console.log("Done.");
};

run();
