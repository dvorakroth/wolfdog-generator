import fs from "node:fs/promises";
import path from "node:path";

import { docopt } from "docopt";
import { z } from "zod";
import {
  schemaPostMetadata,
  schemaSiteManifest,
  type SiteManifest,
  type SitePost,
} from "./types.ts";

const USAGE = `
Usage:
  wolfdog <path/to/wolfdog.json>
  wolfdog -h | --help | --version
`;

const schemaOpts = z.object({
  "<path/to/wolfdog.json>": z.string(),
});

const LOGGER = {
  info: console.warn.bind(console),
  error: console.error.bind(console),
};

async function main(): Promise<void> {
  const { "<path/to/wolfdog.json>": pathToManifest } = schemaOpts.parse(
    docopt(USAGE, { version: VERSION }),
  );

  const manifestDir = path.dirname(pathToManifest);
  LOGGER.info(`Compiling website at: ${manifestDir}`);
  LOGGER.info("");

  LOGGER.info("📋 Reading manifest...");
  const manifest = schemaSiteManifest.parse(
    JSON.parse(await fs.readFile(pathToManifest, "utf-8")),
  );
  if (!checkManifestVersion(manifest.version)) {
    process.exit(1);
  }

  // TODO add some more sanity checks: is the output directory different from any of the input directories?

  LOGGER.info("📂 Creating output directory (if necessary)");
  const outDir = path.join(manifestDir, manifest.outputDir);
  await fs.mkdir(outDir, {
    recursive: true,
  });

  LOGGER.info("📂 Copying static files");
  const staticDir = path.join(manifestDir, manifest.staticAssetsInputDir);
  await fs.cp(staticDir, outDir, { recursive: true });

  LOGGER.info("📝 Reading all posts");
  const postDir = path.join(manifestDir, manifest.postInputDir);
  const allPosts = await readAllPosts(postDir);
  if (allPosts === false) {
    process.exit(1);
  }

  console.debug(allPosts);

  LOGGER.info("");
  LOGGER.info("All done! 🐺");
}

const VERSION = await (async (): Promise<string> => {
  const schemaPackageJson = z.object({
    version: z.string(),
  });

  const packageJsonPath = path.resolve(
    path.join(import.meta.dirname, "..", "package.json"),
  );

  let packageJsonObj;

  try {
    packageJsonObj = JSON.parse(
      await fs.readFile(packageJsonPath, "utf-8"),
    ) as unknown;
  } catch (err) {
    throw new Error("Error parsing package.json: " + err);
  }

  try {
    return schemaPackageJson.parse(packageJsonObj).version;
  } catch (err) {
    throw new Error("Unexpected content in package.json: " + err);
  }
})();

function checkManifestVersion(manifestVersion: string): boolean {
  // TODO do the whole semver thing; for now, there's just 1.0.0 anyway
  if (manifestVersion !== VERSION) {
    LOGGER.error(
      `❌ The website requires Wolfdog version ${manifestVersion},` +
        ` but you're using version ${VERSION}`,
    );
    return false;
  }

  return true;
}

const PATTERN_JSON_FILE_EXT = /\.json$/;
const PATTERN_HTML_FILE_EXT = /\.html$/;

async function readAllPosts(postDir: string): Promise<false | SitePost[]> {
  const filesInPostDir = await fs.readdir(postDir);
  // TODO subdirectories as categories? idk

  const htmlFiles = filesInPostDir.filter(
    (filename) => path.extname(filename) === ".html",
  );
  const jsonFiles = filesInPostDir.filter(
    (filename) => path.extname(filename) === ".json",
  );

  {
    const jsonFilesWithNoHtml = jsonFiles.filter(
      (filename) =>
        !htmlFiles.includes(filename.replace(PATTERN_JSON_FILE_EXT, ".html")),
    );
    const htmlFilesWithNoJson = htmlFiles.filter(
      (filename) =>
        !jsonFiles.includes(filename.replace(PATTERN_HTML_FILE_EXT, ".json")),
    );
    const nonHtmlNonJsonFiles = filesInPostDir.filter(
      (filename) => ![".html", ".json"].includes(path.extname(filename)),
    );

    let foundMismatches = false;

    if (jsonFilesWithNoHtml.length > 0) {
      LOGGER.error(
        `❌ No HTML found for posts: ${jsonFilesWithNoHtml.join(", ")}`,
      );
      foundMismatches = true;
    }

    if (htmlFilesWithNoJson.length > 0) {
      LOGGER.error(
        `❌ No JSON found for posts: ${htmlFilesWithNoJson.join(", ")}`,
      );
      foundMismatches = true;
    }

    if (nonHtmlNonJsonFiles.length > 0) {
      LOGGER.error(
        `❌ Unrecognized post files: ${nonHtmlNonJsonFiles.join(", ")}`,
      );
      foundMismatches = true;
    }

    if (foundMismatches) {
      return false;
    }
  }

  const result: SitePost[] = [];
  for (const htmlFile of htmlFiles) {
    const slug = htmlFile.substring(
      0,
      htmlFile.length - path.extname(htmlFile).length,
    );
    const jsonFile = slug + ".json";

    const pathToHtml = path.join(postDir, htmlFile);
    const pathToJson = path.join(postDir, jsonFile);

    let metadata;
    try {
      metadata = schemaPostMetadata.parse(
        JSON.parse(await fs.readFile(pathToJson, "utf8")),
      );
    } catch (err) {
      LOGGER.error(`❌ Error reading metadata for post: ${jsonFile}`);
      throw err;
    }

    result.push({
      slug,
      pathToHtml,
      pathToJson,
      metadata,
    });
  }

  return result;
}

await main();
