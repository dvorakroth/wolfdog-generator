import fs from "node:fs/promises";
import path from "node:path";

import { docopt } from "docopt";
import Handlebars from "handlebars";
import { z } from "zod";
import {
  schemaPostMetadata,
  schemaSiteManifest,
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

  // TODO add some more sanity checks: is the output directory different from any of the input directories?

  const outDir = path.join(manifestDir, manifest.outputDir);
  LOGGER.info("📂 Creating output directory: " + outDir);
  await fs.mkdir(outDir, { recursive: true });

  LOGGER.info("📂 Copying static files");
  const staticDir = path.join(manifestDir, manifest.staticAssetsInputDir);
  await fs.cp(staticDir, outDir, { recursive: true });

  LOGGER.info("📝 Reading all posts");
  const postDir = path.join(manifestDir, manifest.postInputDir);
  const allPosts = await readAllPosts(postDir);
  if (allPosts === false) {
    process.exit(1);
  }

  LOGGER.info("📐 Reading partial templates");
  await readPartialTemplates(
    path.join(manifestDir, manifest.partialTemplatesDir),
  );

  LOGGER.info("📝 Templating and writing all posts");
  const postTemplateFilePath = path.join(manifestDir, manifest.postTemplate);
  await templateAndWriteAllPosts(
    allPosts,
    postTemplateFilePath,
    manifest.additionalValuesInTemplateScope ?? null,
    outDir,
    manifest.postOutputFileTemplate,
  );

  LOGGER.info("📝 Templating and writing all other pages");
  const additionalPagesPath = path.join(
    manifestDir,
    manifest.additionalPageTemplatesDir,
  );
  await templateAndWriteAdditionalPages(
    additionalPagesPath,
    allPosts,
    manifest.additionalValuesInTemplateScope,
    outDir,
  );

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
): Promise<void> {
  const allPartialFiles = await fs.readdir(partialTemplatesDir);

  for (const partialFile of allPartialFiles) {
    Handlebars.registerPartial(
      partialFile,
      await fs.readFile(path.join(partialTemplatesDir, partialFile), "utf-8"),
    );
  }
}

async function formatPostForTemplateScope(
  post: SitePost,
): Promise<z.core.util.JSONType> {
  return {
    slug: post.slug,
    title: post.metadata.title,
    showPubDate: post.metadata.showPubDate !== false,
    pubDate: post.metadata.showPubDate || null,
    pubDateIso: post.metadata.pubDate.toISO({ includeOffset: true }),
    pubDateRfc: post.metadata.pubDate.toRFC2822(),
    content: await fs.readFile(post.pathToHtml, "utf-8"),
    additionalValues: post.metadata.additionalValuesInTemplateScope ?? null,
  };
}

async function templateAndWriteAllPosts(
  allPosts: SitePost[],
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
        post: await formatPostForTemplateScope(post),
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
  additionalValuesInTemplateScope: z.core.util.JSONType | undefined,
  outDir: string,
): Promise<void> {
  const allPostsForScope = await Promise.all(
    allPosts.map(formatPostForTemplateScope),
  );

  // um actually, this is technically a stack!!,
  const queue: AdditionalPageQueueItem[] = [
    { inputFilePath: additionalPagesDir, outputFilePath: outDir },
  ];

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
      } catch (err) {
        LOGGER.error(`❌ Error processing page: ${inputFilePath}`);
        throw err;
      }
    }
  }
}

await main();
