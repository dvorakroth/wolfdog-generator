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

const USAGE = `
Usage:
  wolfdog build <path/to/site/directory>
  wolfdog -h | --help | --version
`;

const schemaOpts = z.object({
  "<path/to/site/directory>": z.string(),
  build: z.boolean(),
});

const LOGGER = {
  info: console.warn.bind(console),
  error: console.error.bind(console),
};

async function main(): Promise<void> {
  const { "<path/to/site/directory>": manifestDir } = schemaOpts.parse(
    docopt(USAGE, { version: VERSION }),
  );

  const pathToManifest = path.join(manifestDir, "wolfdog.json");
  LOGGER.info(`Compiling website at: ${manifestDir}`);
  LOGGER.info("");

  LOGGER.info("📋 Reading manifest...");
  const manifest = schemaSiteManifest.parse(
    JSON.parse(await fs.readFile(pathToManifest, "utf-8")),
  );
  if (!checkManifestVersion(manifest.version)) {
    process.exit(1);
  }

  if (!manifestSanityChecks(manifestDir, manifest)) {
    process.exit(1);
  }

  const outDir = path.join(manifestDir, manifest.outputDir);
  LOGGER.info("📂 Creating output directory: " + outDir);
  await fs.mkdir(outDir, { recursive: true });

  LOGGER.info("📂 Copying static files");
  const staticDir = path.join(manifestDir, manifest.staticAssetsInputDir);
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
  const postDir = path.join(manifestDir, manifest.postSettings.postInputDir);
  const allPosts = await readAllPosts(postDir);
  if (allPosts === false) {
    process.exit(1);
  }

  LOGGER.info("📐 Reading partial templates");
  const partialTemplatesFound = await readPartialTemplates(
    path.join(manifestDir, manifest.partialTemplatesDir),
  );
  if (!partialTemplatesFound) {
    LOGGER.info("📐 (Nevermind, no partial templates found)");
  }

  LOGGER.info("📝 Templating and writing all posts");
  const postTemplateFilePath = path.join(
    manifestDir,
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
    manifestDir,
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

  result.sort(
    (postA, postB) =>
      -(postA.metadata.pubDate.valueOf() - postB.metadata.pubDate.valueOf()),
  );

  return result;
}

async function readPartialTemplates(
  partialTemplatesDir: string,
): Promise<boolean> {
  let allPartialFiles;
  try {
    allPartialFiles = await fs.readdir(partialTemplatesDir);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return false;
    } else {
      throw err;
    }
  }

  let foundAny = false;

  for (const partialFile of allPartialFiles) {
    Handlebars.registerPartial(
      partialFile,
      await fs.readFile(path.join(partialTemplatesDir, partialFile), "utf-8"),
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

      const filename = path.join(outDir, postFilenameTemplate(scope));
      const dirname = path.dirname(filename);

      await fs.mkdir(dirname, { recursive: true });
      await fs.writeFile(filename, postTemplate(scope));
    } catch (err) {
      LOGGER.error(`❌ Error processing post: ${post.slug}`);
      throw err;
    }
  }
}

type AdditionalPageQueueItem = {
  inputFilePath: string;
  outputFilePath: string;
};

const PATTERN_HBS_EXT = /\.hbs$/i;

async function templateAndWriteAdditionalPages(
  additionalPagesDir: string,
  allPosts: SitePost[],
  pubDateFormatting: SiteManifest["postSettings"]["postPubDate"],
  additionalValuesInTemplateScope: z.core.util.JSONType | undefined,
  outDir: string,
): Promise<boolean> {
  try {
    await fs.stat(additionalPagesDir);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return false;
    } else {
      throw err;
    }
  }

  const allPostsForScope = await Promise.all(
    allPosts.map((post) => formatPostForTemplateScope(post, pubDateFormatting)),
  );

  // um actually, this is technically a stack!!,
  const queue: AdditionalPageQueueItem[] = [
    { inputFilePath: additionalPagesDir, outputFilePath: outDir },
  ];

  let foundAny = false;

  while (queue.length) {
    const { inputFilePath, outputFilePath } = queue.pop()!;

    if ((await fs.stat(inputFilePath)).isDirectory()) {
      const dirListing = await fs.readdir(inputFilePath);
      queue.push(
        ...dirListing.map(
          (filename) =>
            ({
              inputFilePath: path.join(inputFilePath, filename),
              outputFilePath: path.join(
                outputFilePath,
                filename.replace(PATTERN_HBS_EXT, ""),
              ),
            }) satisfies AdditionalPageQueueItem,
        ),
      );
      continue;
    }

    if (inputFilePath.match(PATTERN_HBS_EXT)) {
      try {
        const templateContent = await fs.readFile(inputFilePath, "utf-8");
        const template = Handlebars.compile(templateContent);
        await fs.writeFile(
          outputFilePath,
          template({
            additionalValues: additionalValuesInTemplateScope,
            allPosts: allPostsForScope,
            generatorTag: GENERATOR_TAG,
          }),
        );
        foundAny = true;
      } catch (err) {
        LOGGER.error(`❌ Error processing page: ${inputFilePath}`);
        throw err;
      }
    }
  }

  return foundAny;
}

await main();
