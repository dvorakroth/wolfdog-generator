import { DateTime } from "luxon";
import { z } from "zod";

export const schemaSiteManifest = z.strictObject({
  version: z.string(),
  outputDir: z.string().default("dist"),
  postInputDir: z.string().default("posts"),
  postOutputFileTemplate: z.string().default("posts/{{post.slug}}/index.html"),
  staticAssetsInputDir: z.string().default("static"),
  postTemplate: z.string().default("templates/post.html.hbs"),
  partialTemplatesDir: z.string().default("templates/partials/"),
  additionalPageTemplatesDir: z.string().default("templates/additionalPages/"),
  additionalValuesInTemplateScope: z.json().optional(),
});

export type SiteManifest = z.infer<typeof schemaSiteManifest>;

const schemaValidDateTime = z.custom<DateTime<true>>(
  (val) => val instanceof DateTime && val.isValid,
  "DateTime is invalid",
);

export const schemaPostMetadata = z.strictObject({
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
   * Publication date for display purposes. Can be any string, or `false`
   *
   * @example "August 6th, 2025"
   * @example false
   * @example "Back when I lived in Sawtooth"
   */
  showPubDate: z.union([z.string(), z.literal(false)]),

  /**
   * Optionally, values to be passed onto the Handlebars template, in a prop
   * named `additionalValues`
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
