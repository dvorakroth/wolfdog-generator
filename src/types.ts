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
  title: z.string(),
  pubDate: z.iso
    .datetime({ offset: true })
    .transform((str) => DateTime.fromISO(str, { setZone: true }))
    .pipe(schemaValidDateTime),
  showPubDate: z.union([z.string(), z.literal(false)]),
  additionalValuesInTemplateScope: z.json().optional(),
});

export type PostMetadata = z.infer<typeof schemaPostMetadata>;
export type SitePost = {
  slug: string;
  pathToHtml: string;
  pathToJson: string;
  metadata: PostMetadata;
};
