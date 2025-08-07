# wolfdog-generator

Simple static site generator with as few dependencies as I could realistically manage without going insane.

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

And run `wolfdog build path/to/my-cool-site`

Be sure to have a look at the [examples](examples/)!

## wolfdog.json

TODO write about this

## Additional Pages

TODO

## Partial Templates

TODO

## Posts

Posts are given as two files, one HTML and one JSON. The HTML is for the actual post content, and is meant to be pasted verbatim into the post template. The JSON is for metadata.

The metadata fields are:

```typescript
type PostMetadata = {
  /**
   * A mandatory title for the post
   */
  title: string;

  /**
   * A mandatory publication date for the post. (For sorting and RSS and stuff)
   *
   * Given in ISO format + timezone
   *
   * @example "2025-08-06T04:20:00.690Z"
   */
  pubDate: string;

  /**
   * Optionally, values to be passed onto the Handlebars template, in a prop
   * named `post.additionalValues`
   */
  additionalValuesInTemplateScope?: z.core.util.JSONType;
};
```

The post template (by default `templates/post.html.hbs`) receives a scope that looks something like this:

```typescript
const SCOPE = {
  post: {
    slug: "on-regression-and-overthinking",
    title: "On Regression and Overthinking",
    pubDate: "Januray 20, 2020",
    pubDateIso: "2020-01-20T00:00:00-07:00",
    pubDateRfc: "Mon, 20 Jan 2020 00:00:00 -0700",
    content: "(the entire HTML content of the post)",
    additionalValues: {}, // from the post's JSON
  },
  additionalValues: {}, // from the manifest
  generatorTag: "Wolfdog Generator 1.0.0",
};
```

## Preprocessing and postprocessing (SASS, Typescript, etc.)

This will probably never be supported. There's plenty of other, more capable and chonkier static site generators that support that kind of elaborate stuff. My use case is simple, so Wolfdog stays simple.

## Wait, why avoid dependencies?

I feel like we have become too reliant on `npm install`ing stuff like Leftpad or whatever that then pulls in 2^32-1 more dependencies. Whenever vulnerabilities are discovered, or NPM randomly decides to take down some package, it creates massive unnecessary headaches for everyone.

Not counting dev-dependencies, this project currently has 4 direct dependencies:

- [docopt](https://www.npmjs.com/package/docopt) -- for argument parsing (0 dependencies)
- [luxon](https://www.npmjs.com/package/luxon) -- for date stuff (0 dependencies)
- [zod](https://www.npmjs.com/package/zod) -- for type validation (0 dependencies)
- [handlebars](https://www.npmjs.com/package/handlebars) -- for templating (5 dependencies, that all have 0 dependencies)

These packages implement pretty important functionality that would be a headache to implement myself, and more importantly, all except one of them have 0 dependencies of their own, minimizing the potential for future NPM headaches.
