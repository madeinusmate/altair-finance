#!/usr/bin/env tsx

import * as fs from "fs";
import * as path from "path";

// Configuration
const DEFAULT_INPUT_DIR = path.join(process.cwd(), "statements", "extracted", "CITI");
const DEFAULT_OUTPUT_FILE = path.join(process.cwd(), "statements", "combined.csv");
const CSV_HEADER = "date,account,description,amount,category,type";

// Get command line arguments
const args = process.argv.slice(2);
const inputDir = args[0] || DEFAULT_INPUT_DIR;
const outputFile = args[1] || DEFAULT_OUTPUT_FILE;

// Get all CSV files from input directory
const getCsvFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) {
    console.error(`❌ Error: Directory does not exist: ${dir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir);
  return files
    .filter((file) => file.toLowerCase().endsWith(".csv"))
    .map((file) => path.join(dir, file))
    .sort(); // Sort for consistent ordering
};

// Check if a line is a header
const isHeader = (line: string): boolean => {
  const normalized = line.toLowerCase().trim();
  return normalized === CSV_HEADER.toLowerCase() || normalized.startsWith("date,");
};

// Read CSV file and return data rows (excluding header if present)
const readCsvFile = (filePath: string): string[] => {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  
  if (lines.length === 0) {
    return [];
  }

  // Check if first line is a header
  const hasHeader = isHeader(lines[0]);
  return hasHeader ? lines.slice(1) : lines;
};

// Combine multiple CSV files into one
const combineCsvs = (csvFiles: string[]): string => {
  const allRows: string[] = [];
  let filesProcessed = 0;
  let totalRows = 0;

  for (const csvFile of csvFiles) {
    try {
      const rows = readCsvFile(csvFile);
      allRows.push(...rows);
      totalRows += rows.length;
      filesProcessed++;
      console.log(`  ✓ Processed: ${path.basename(csvFile)} (${rows.length} rows)`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Failed to read ${path.basename(csvFile)}: ${errorMessage}`);
    }
  }

  // Combine header and all rows
  const combinedContent = [CSV_HEADER, ...allRows].join("\n");

  console.log(`\n📊 Summary:`);
  console.log(`  Files processed: ${filesProcessed}/${csvFiles.length}`);
  console.log(`  Total rows: ${totalRows}`);

  return combinedContent;
};

// Main execution
const main = (): void => {
  console.log("🚀 Starting CSV Combination\n");
  console.log(`📁 Input directory: ${inputDir}`);
  console.log(`📄 Output file: ${outputFile}\n`);

  // Get all CSV files
  const csvFiles = getCsvFiles(inputDir);

  if (csvFiles.length === 0) {
    console.log("ℹ️  No CSV files found in the input directory");
    return;
  }

  console.log(`Found ${csvFiles.length} CSV file(s) to combine\n`);

  // Combine CSV files
  const combinedContent = combineCsvs(csvFiles);

  // Ensure output directory exists
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`✓ Created output directory: ${outputDir}`);
  }

  // Write combined CSV to output file
  fs.writeFileSync(outputFile, combinedContent, "utf-8");
  console.log(`\n✅ Successfully combined CSVs into: ${outputFile}`);
};

// Run main function
main();
