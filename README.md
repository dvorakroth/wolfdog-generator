# wolfdog-generator

Simple and straightforward static site generator, with as few dependencies as I could realistically manage without going insane. Uses Handlebars for templating, and good ol' raw HTML for page content.

## How to Use

Set up a directory with this layout:

```
my-cool-site/
├── posts/
│   ├── some-topic-or-other.html
│   ├── some-topic-or-other.json
│   ├── another-topic-i-care-about.html
│   ├── another-topic-i-care-about.json
│   └── ...
├── static/
│   └── ...(stuff placed here will be copied as is)
├── templates/
│   ├── additionalPages/
│   │   └── index.html.hbs
│   └── post.html.hbs
└── wolfdog.json
```

Then run:

```bash
npm install --save-dev wolfdog
npx wolfdog build
```

Be sure to have a look at the [examples](examples/)!

## The Manifest: `wolfdog.json`

This is the main config file, usually referred to as the Manifest. The smallest allowed config file that simply uses the default config values for everything is:

```json
{ "version": "1.0.0" }
```

There is a [JSON schema](./wolfdog.schema.json) for Wolfdog Manifest files, for type checking and autocompletion in text editors. Use it by adding the `$schema` property to your manifest:

```json
{
  "$schema": "./node_modules/wolfdog/wolfdog.schema.json",
  "version": "1.0.0"
}
```

Probably the most immediately-useful property in the manifest is `additionalValuesInTemplateScope`, which lets you inject values into all of the templates. Put your website's title here, for example:

```json
{
  "$schema": "./node_modules/wolfdog/wolfdog.schema.json",
  "version": "1.0.0",
  "additionalValuesInTemplateScope": {
    "siteName": "My Cool Site",
    "myFavoriteStaticSiteGenerator": "Wolfdog Generator!"
  }
}
```

For a full list of every allowed property and its default value, see either the [JSON schema](./wolfdog.schema.json) or [types.ts](./src/types.ts).

## Posts

Posts are given as two files:

- An HTML file that contains the actual post content,
- And a JSON file for metadata and additional values to be passed on to the Handlebars template

There is a [JSON schema](./post.schema.json) included for post metadata files. To use it, add the `$schema` property to your post metadata files:

```json
{
  "$schema": "./node_modules/wolfdog/post.schema.json",
  "title": "On Regression and Overthinking",
  "pubDate": "2020-01-20T00:00:00-07:00",
  "additionalValuesInTemplateScope": {
    "description": "Exploring some thoughts on going backwards and thinking too much.",
    "customPubDate": "Originally written while still living in Sawtooth"
  }
}
```

The post template (by default `templates/post.html.hbs`, determined by `postSettings.postTemplate` in the manifest) is then executed for each post with a scope that looks something like this:

```typescript
const SCOPE = {
  post: {
    slug: "on-regression-and-overthinking",
    title: "On Regression and Overthinking",
    pubDate: "Januray 20, 2020",
    pubDateIso: "2020-01-20T00:00:00-07:00",
    pubDateRfc: "Mon, 20 Jan 2020 00:00:00 -0700",
    content: "(the entire HTML content of the post)",
    additionalValues: {
      description:
        "Exploring some thoughts on going backwards and thinking too much.",
      customPubDate: "Originally written while still living in Sawtooth",
    },
  },
  additionalValues: {
    // (from the manifest)
  },
  generatorTag: "Wolfdog Generator 1.0.0",
};
```

Posts are output, by default, to `dist/posts/{{post.slug}}/index.html`. To change this, refer to the `postSettings.postOutputFileTemplate` subproperty in the manifest file.

The format and locale of `pubDate` in the templating scope are determined by the `postSettings.postPubDate.formatString` and `postSettings.postPubDate.locale` sub-sub-properties.

## Additional Pages

In addition to individual posts, Wolfdog also lets you define templateable pages. These are given as Handlebars templates, by default under the directory `templates/additionalPages/` (configurable using `additionalPageTemplatesDir` in the manifest)

This directory and all subdirectories are recursively scanned, and any files with names that end in `.hbs` are interpreted as Handlebars templates. (Files without the `.hbs` extension are ignored). The directory structure is kept and copied over, and the resulting files get the same name as the input files, but without the `.hbs` extension.

For example, the following tree:

```
additionalPages/
├── about/
│   ├── index.html.hbs
│   └── socials.html.hbs
├── index.html.hbs
└── rss.xml.hbs
```

Will result in the following:

```
dist/
├── about/
│   ├── index.html
│   └── socials.html
├── index.html
└── rss.xml
```

Each "additional page" template is executed with the following scope:

```typescript
const SCOPE = {
  allPosts: [
    // sorted by descending order of publication; newest first, oldest last
    {
      // (identical to the `post` property in the Posts section)
    },
    {
      // (identical to the `post` property in the Posts section)
    },
    // ...
  ],
  additionalValues: {
    // (from the manifest)
  },
  generatorTag: "Wolfdog Generator 1.0.0",
};
```

## Partial Templates

For convenience, you can use [Handlebars' Partials feature](https://handlebarsjs.com/guide/partials.html) in your templates. Before templating any pages, Wolfdog will recursively iterate over everything in the directory `templates/partials/` (configurable using `partialTemplatesDir` in the manifest), and load any file it finds as a Handlebars partial. The name of the partial will be the path to the file, relative to the partial templates directory.

For example, the following tree:

```
partials/
├── util/
│   └── identity.html.hbs
├── main-template.html.hbs
└── rss-template.xml.hbs
```

Will result in three partials being loaded:

- One called `main-template.html.hbs`,
- One called `rss-template.xml.hbs`,
- And one called `util/identity.html.hbs`

## Preprocessing and postprocessing (SASS, Typescript, etc.)

This will probably never be supported. There's plenty of other, more capable and chonkier static site generators that support that kind of elaborate stuff. My use case is simple, so Wolfdog stays simple.

## Wait, why avoid dependencies?

I feel like we have become too reliant on `npm install`ing stuff like Leftpad or whatever, that then pulls in 2,147,483,647 more dependencies. Whenever vulnerabilities are discovered, or NPM randomly decides to take down some package, it creates massive unnecessary headaches for everyone.

Not counting dev-dependencies, this project currently has 4 direct dependencies:

- [docopt](https://www.npmjs.com/package/docopt) -- for argument parsing (0 dependencies)
- [luxon](https://www.npmjs.com/package/luxon) -- for date stuff (0 dependencies)
- [zod](https://www.npmjs.com/package/zod) -- for type validation (0 dependencies)
- [handlebars](https://www.npmjs.com/package/handlebars) -- for templating (5 dependencies, that all have 0 dependencies)

These packages implement pretty important functionality that would be a headache to implement myself, and more importantly, all except one of them have 0 dependencies of their own, minimizing the potential for future NPM headaches.

## Wolfdog?

Awoooooooooooo!
