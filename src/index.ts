#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { docopt } from "docopt";
import Handlebars from "handlebars";
import { z } from "zod";
import {
  schemaPostMetadata,
  schemaSiteManifest,
  type SiteManifest,
  type SitePost,
} from "./types.ts";
import { fileExists, readdirR } from "./junkyard.ts";

const USAGE = `
Usage:
  wolfdog build [<path/to/site/directory>]
  wolfdog -h | --help | --version
`;

const schemaOpts = z.object({
  "<path/to/site/directory>": z.string().or(z.null()),
  build: z.boolean(),
});

const LOGGER = {
  info: console.warn.bind(console),
  warn: console.error.bind(console),
  error: console.error.bind(console),
};

async function main(): Promise<void> {
  const { "<path/to/site/directory>": manifestDirArg } = schemaOpts.parse(
    docopt(USAGE, { version: VERSION }),
  );

  const manifestDirAbs = path.resolve(manifestDirArg ?? ".");

  const pathToManifest = path.join(manifestDirAbs, "wolfdog.json");
  LOGGER.info(`Compiling website at: ${manifestDirAbs}`);
  LOGGER.info("");

  LOGGER.info("📋 Reading manifest...");
  const manifest = schemaSiteManifest.parse(
    JSON.parse(await fs.readFile(pathToManifest, "utf-8")),
  );
  if (!checkManifestVersion(manifest.version)) {
    process.exit(1);
  }

  if (!manifestSanityChecks(manifestDirAbs, manifest)) {
    process.exit(1);
  }

  const outDir = path.join(manifestDirAbs, manifest.outputDir);
  LOGGER.info("📂 Creating output directory: " + outDir);
  await fs.mkdir(outDir, { recursive: true });

  LOGGER.info("📂 Copying static files");
  const staticDir = path.join(manifestDirAbs, manifest.staticAssetsInputDir);
  try {
    await fs.cp(staticDir, outDir, { recursive: true });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      LOGGER.info("📂 (Nevermind, no static files found)");
    } else {
      throw err;
    }
  }

  LOGGER.info("📝 Reading all posts");
  const postDir = path.join(manifestDirAbs, manifest.postSettings.postInputDir);
  const allPosts = await readAllPosts(postDir);
  if (allPosts === false) {
    process.exit(1);
  }

  LOGGER.info("📐 Reading partial templates");
  const partialTemplatesFound = await readPartialTemplates(
    path.join(manifestDirAbs, manifest.partialTemplatesDir),
  );
  if (!partialTemplatesFound) {
    LOGGER.info("📐 (Nevermind, no partial templates found)");
  }

  LOGGER.info("📝 Templating and writing all posts");
  const postTemplateFilePath = path.join(
    manifestDirAbs,
    manifest.postSettings.postTemplate,
  );
  await templateAndWriteAllPosts(
    allPosts,
    manifest.postSettings.postPubDate,
    postTemplateFilePath,
    manifest.additionalValuesInTemplateScope ?? null,
    outDir,
    manifest.postSettings.postOutputFileTemplate,
  );

  LOGGER.info("📝 Templating and writing all other pages");
  const additionalPagesPath = path.join(
    manifestDirAbs,
    manifest.additionalPageTemplatesDir,
  );
  const additionalPagesFound = await templateAndWriteAdditionalPages(
    additionalPagesPath,
    allPosts,
    manifest.postSettings.postPubDate,
    manifest.additionalValuesInTemplateScope,
    outDir,
  );
  if (!additionalPagesFound) {
    LOGGER.info("📝 (Nevermind, no additional pages found)");
  }

  LOGGER.info("");
  LOGGER.info("✅ All done! 🐺");
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

const GENERATOR_TAG = `Wolfdog Generator ${VERSION}`;

const PATTERN_VERSION = /^(?<major>\d+)\.(?<minor>\d+)\.(?<revision>\d+)$/;
function parseVersion(version: string): {
  major: number;
  minor: number;
  revision: number;
} {
  const matches = version.match(PATTERN_VERSION);
  if (!matches) {
    throw new Error("Could not parse version number: " + version);
  }

  return {
    major: parseInt(matches.groups!.major!),
    minor: parseInt(matches.groups!.minor!),
    revision: parseInt(matches.groups!.revision!),
  };
}

function checkManifestVersion(manifestVersionStr: string): boolean {
  const currentVersion = parseVersion(VERSION);
  const manifestVersion = parseVersion(manifestVersionStr);

  if (
    currentVersion.major !== manifestVersion.major ||
    currentVersion.minor < manifestVersion.minor ||
    (currentVersion.minor === manifestVersion.minor &&
      currentVersion.revision < manifestVersion.revision)
  ) {
    LOGGER.error(
      `❌ The website requires Wolfdog version ${manifestVersionStr},` +
        ` but you're using version ${VERSION}`,
    );
    return false;
  }

  return true;
}

function checkIfOutsideOfProjectDir(
  projectDir: string,
  directoryToCheck: string,
  nameOfDirectoryToCheck: string,
): boolean {
  if (!directoryToCheck.startsWith(projectDir)) {
    LOGGER.error(
      `❌ The ${nameOfDirectoryToCheck} (${directoryToCheck}) is outside of the project directory`,
    );
    return false;
  }

  return true;
}

function checkIfInsideOutputDir(
  outputDir: string,
  directoryToCheck: string,
  nameOfDirectoryToCheck: string,
): boolean {
  if (directoryToCheck.startsWith(outputDir)) {
    LOGGER.error(
      `❌ The ${nameOfDirectoryToCheck} (${directoryToCheck}) is inside of the output directory`,
    );
    return false;
  }

  return true;
}

function manifestSanityChecks(
  baseDir: string,
  manifest: SiteManifest,
): boolean {
  let isValid = true;

  const absBase = path.resolve(baseDir) + "/";

  const absOut = path.resolve(absBase, manifest.outputDir);
  isValid &&= checkIfOutsideOfProjectDir(absBase, absOut, "output directory");

  const pathsToCheck: { relPath: string; name: string }[] = [
    {
      relPath: manifest.postSettings.postInputDir,
      name: "post input directory",
    },
    {
      relPath: manifest.postSettings.postTemplate,
      name: "post template",
    },
    {
      relPath: manifest.staticAssetsInputDir,
      name: "static asset directory",
    },
    {
      relPath: manifest.partialTemplatesDir,
      name: "partial templates directory",
    },
    {
      relPath: manifest.additionalPageTemplatesDir,
      name: "additional page template directory",
    },
  ];

  for (const { relPath, name } of pathsToCheck) {
    const absPath = path.resolve(absBase, relPath);
    isValid &&= checkIfOutsideOfProjectDir(absBase, absPath, name);
    isValid &&= checkIfInsideOutputDir(absOut, absPath, name);
  }

  return isValid;
}

const PATTERN_JSON_FILE_EXT = /\.json$/i;
const PATTERN_HTML_FILE_EXT = /\.html$/i;

async function readAllPosts(postDir: string): Promise<false | SitePost[]> {
  const posts: Record<string, { htmlFile?: string; jsonFile?: string }> = {};
  const unrecognized: string[] = [];

  for await (const file of readdirR(postDir)) {
    let slug: string;
    let type: "htmlFile" | "jsonFile";

    if (file.match(PATTERN_HTML_FILE_EXT)) {
      slug = file.replace(PATTERN_HTML_FILE_EXT, "");
      type = "htmlFile";
    } else if (file.match(PATTERN_JSON_FILE_EXT)) {
      slug = file.replace(PATTERN_JSON_FILE_EXT, "");
      type = "jsonFile";
    } else {
      unrecognized.push(file);
      continue;
    }

    if (!(slug in posts)) {
      posts[slug] = {};
    }

    posts[slug]![type] = file;
  }

  {
    const slugsWithNoHtml = Object.entries(posts)
      .filter(([_slug, { htmlFile }]) => htmlFile === undefined)
      .map(([slug]) => slug);
    const slugsWithNoJson = Object.entries(posts)
      .filter(([_slug, { jsonFile }]) => jsonFile === undefined)
      .map(([slug]) => slug);

    let foundMismatches = false;

    if (slugsWithNoHtml.length > 0) {
      LOGGER.error(`❌ No HTML found for posts: ${slugsWithNoHtml.join(", ")}`);
      foundMismatches = true;
    }

    if (slugsWithNoJson.length > 0) {
      LOGGER.error(`❌ No JSON found for posts: ${slugsWithNoJson.join(", ")}`);
      foundMismatches = true;
    }

    if (unrecognized.length > 0) {
      LOGGER.error(`❌ Unrecognized post files: ${unrecognized.join(", ")}`);
      foundMismatches = true;
    }

    if (foundMismatches) {
      return false;
    }
  }

  const result: SitePost[] = [];
  for (const [slug, { htmlFile, jsonFile }] of Object.entries(posts)) {
    const pathToHtml = path.join(postDir, htmlFile!);
    const pathToJson = path.join(postDir, jsonFile!);

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

  result.sort(
    (postA, postB) =>
      -(postA.metadata.pubDate.valueOf() - postB.metadata.pubDate.valueOf()),
  );

  return result;
}

async function readPartialTemplates(
  partialTemplatesDir: string,
): Promise<boolean> {
  if (!(await fileExists(partialTemplatesDir))) {
    return false;
  }

  let foundAny = false;

  for await (const file of readdirR(partialTemplatesDir)) {
    Handlebars.registerPartial(
      file,
      await fs.readFile(path.join(partialTemplatesDir, file), "utf-8"),
    );
    foundAny = true;
  }

  return foundAny;
}

async function formatPostForTemplateScope(
  post: SitePost,
  pubDateFormatting: SiteManifest["postSettings"]["postPubDate"],
): Promise<z.core.util.JSONType> {
  return {
    slug: post.slug,
    title: post.metadata.title,
    pubDate: post.metadata.pubDate.toFormat(pubDateFormatting.formatString, {
      locale: pubDateFormatting.locale,
    }),
    pubDateIso: post.metadata.pubDate.toISO({ includeOffset: true }),
    pubDateRfc: post.metadata.pubDate.toRFC2822(),
    content: await fs.readFile(post.pathToHtml, "utf-8"),
    additionalValues: post.metadata.additionalValuesInTemplateScope ?? null,
  };
}

async function templateAndWriteAllPosts(
  allPosts: SitePost[],
  pubDateFormatting: SiteManifest["postSettings"]["postPubDate"],
  postTemplateFilePath: string,
  additionalValuesInTemplateScope: z.core.util.JSONType | null,
  outDir: string,
  postOutputFileTemplate: string,
): Promise<void> {
  const postTemplateStr = await fs.readFile(postTemplateFilePath, "utf-8");
  const postTemplate = Handlebars.compile(postTemplateStr);

  const postFilenameTemplate = Handlebars.compile(postOutputFileTemplate);

  for (const post of allPosts) {
    try {
      const scope = {
        post: await formatPostForTemplateScope(post, pubDateFormatting),
        additionalValues: additionalValuesInTemplateScope,
        generatorTag: GENERATOR_TAG,
      } satisfies z.core.util.JSONType;

      const outFile = path.join(outDir, postFilenameTemplate(scope));

      await fs.mkdir(path.dirname(outFile), { recursive: true });
      await fs.writeFile(outFile, postTemplate(scope));
    } catch (err) {
      LOGGER.error(`❌ Error processing post: ${post.slug}`);
      throw err;
    }
  }
}

const PATTERN_HBS_EXT = /\.hbs$/i;

async function templateAndWriteAdditionalPages(
  additionalPagesDir: string,
  allPosts: SitePost[],
  pubDateFormatting: SiteManifest["postSettings"]["postPubDate"],
  additionalValuesInTemplateScope: z.core.util.JSONType | undefined,
  outDir: string,
): Promise<boolean> {
  if (!(await fileExists(additionalPagesDir))) {
    return false;
  }

  const allPostsForScope = await Promise.all(
    allPosts.map((post) => formatPostForTemplateScope(post, pubDateFormatting)),
  );

  let foundAny = false;

  for await (const file of readdirR(additionalPagesDir)) {
    const fileAbs = path.join(additionalPagesDir, file);
    if (!fileAbs.match(PATTERN_HBS_EXT)) {
      LOGGER.warn(
        `⚠️ Ignoring page: ${fileAbs} (filename doesn't end with .hbs)`,
      );
      continue;
    }

    const outFile = path.join(outDir, file).replace(PATTERN_HBS_EXT, "");
    try {
      const templateContent = await fs.readFile(fileAbs, "utf-8");
      const template = Handlebars.compile(templateContent);
      await fs.mkdir(path.dirname(outFile), { recursive: true });
      await fs.writeFile(
        outFile,
        template({
          additionalValues: additionalValuesInTemplateScope,
          allPosts: allPostsForScope,
          generatorTag: GENERATOR_TAG,
        }),
      );
      foundAny = true;
    } catch (err) {
      LOGGER.error(`❌ Error processing page: ${fileAbs}`);
      throw err;
    }
  }

  return foundAny;
}

await main();
