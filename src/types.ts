import { DateTime } from "luxon";
import { z } from "zod";

const DEFAULT_POST_SETTINGS = {
  postInputDir: "posts/",
  postOutputFileTemplate: "posts/{{post.slug}}/index.html",
  postTemplate: "templates/post.html.hbs",
  postPubDate: {
    formatString: "DDD",
    locale: "en-US",
  },
} as const;

export const schemaSiteManifest = z.strictObject({
  $schema: z.string().optional(),

  /** The version of Wolfdog Generator that this manifest is intended for */
  version: z.string(),

  /**
   * Directory to output the resulting baked and ready to go website to
   * (relative to where the manifest is)
   *
   * @default "dist/"
   */
  outputDir: z.string().default("dist/"),

  /**
   * Path to directory of "static assets" (relative to where the manifest is),
   * that will have all of its content copied verbatim into the output directory
   *
   * @default "static/"
   */
  staticAssetsInputDir: z.string().default("static/"),

  /**
   * Path to directory of Handlebars Partials (relative to where the manifest
   * is), that will be loaded before any pages are templated.
   *
   *
   * @see https://handlebarsjs.com/guide/partials.html
   * @default "templates/partials/"
   */
  partialTemplatesDir: z.string().default("templates/partials/"),

  /**
   * Path to directory of "additional pages" (relative to where the manifest
   * is), that will be passed through Handlebars and output to the output
   * directory. Subdirectory structure will be kept.
   *
   * @default "templates/additionalPages/"
   */
  additionalPageTemplatesDir: z.string().default("templates/additionalPages/"),

  /**
   * Optionally, values to be passed onto every single Handlebars template, in a
   * prop named `additionalValues`
   */
  additionalValuesInTemplateScope: z.json().optional(),

  /**
   * Settings for post generation
   */
  postSettings: z
    .strictObject({
      /**
       * Directory to read posts from (relative to where the manifest is)
       *
       * @default "posts/"
       */
      postInputDir: z.string().default(DEFAULT_POST_SETTINGS.postInputDir),

      /**
       * Handlebars template that, given the post's template scope, yields the
       * output file path. (relative to the general output directory)
       *
       * @default "posts/{{post.slug}}/index.html"
       */
      postOutputFileTemplate: z
        .string()
        .default(DEFAULT_POST_SETTINGS.postOutputFileTemplate),

      /**
       * Path to the Handlebars template used for rendering posts (relative to
       * where the manifest is)
       *
       * @default "templates/post.html.hbs"
       */
      postTemplate: z.string().default(DEFAULT_POST_SETTINGS.postTemplate),

      /** Settings for formatting post publication dates */
      postPubDate: z
        .strictObject({
          /**
           * Luxon format string to use
           *
           * @see https://moment.github.io/luxon/#/formatting?id=table-of-tokens
           * @default "DDD"
           */
          formatString: z
            .string()
            .default(DEFAULT_POST_SETTINGS.postPubDate.formatString),

          /**
           * Locale to use
           *
           * @default "en-US"
           */
          locale: z.string().default(DEFAULT_POST_SETTINGS.postPubDate.locale),
        })
        .default(DEFAULT_POST_SETTINGS.postPubDate),
    })
    .default(DEFAULT_POST_SETTINGS),
});

export type SiteManifest = z.infer<typeof schemaSiteManifest>;

const schemaValidDateTime = z.custom<DateTime<true>>(
  (val) => val instanceof DateTime && val.isValid,
  "DateTime is invalid",
);

export const schemaPostMetadata = z.strictObject({
  $schema: z.string().optional(),

  /**
   * A mandatory title for the post
   */
  title: z.string(),

  /**
   * A mandatory publication date for the post. (For sorting and RSS and stuff)
   *
   * Given in ISO format + timezone
   *
   * @example "2025-08-06T04:20:00.690Z"
   */
  pubDate: z.iso
    .datetime({ offset: true })
    .transform((str) => DateTime.fromISO(str, { setZone: true }))
    .pipe(schemaValidDateTime),

  /**
   * Optionally, values to be passed onto the Handlebars template, in a prop
   * named `post.additionalValues`
   */
  additionalValuesInTemplateScope: z.json().optional(),
});

export type PostMetadata = z.infer<typeof schemaPostMetadata>;
export type SitePost = {
  slug: string;
  pathToHtml: string;
  pathToJson: string;
  metadata: PostMetadata;
};
