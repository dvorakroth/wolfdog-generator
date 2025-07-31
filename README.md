# wolfdog-generator

Static site generator with as few dependencies as I could realistically manage without going insane.

## Wait, why avoid dependencies?

I feel like we have become too reliant on `npm install`ing stuff like Leftpad or whatever that then pulls in 2^32-1 more dependencies. Whenever vulnerabilities are discovered, or NPM randomly decides to take down some package, it creates massive unnecessary headaches for everyone.

Not counting dev-dependencies, this project currently has 3 dependencies:

- [docopt](https://www.npmjs.com/package/docopt) -- for argument parsing (0 dependencies)
- [luxon](https://www.npmjs.com/package/luxon) -- for date stuff (0 dependencies)
- [zod](https://www.npmjs.com/package/zod) -- for type validation (0 dependencies)
- [mustache](https://www.npmjs.com/package/mustache) -- for templates (0 dependencies)

These packages have pretty important functionality that would be a headache to implement myself, and more importantly, all have 0 dependencies of their own, minimizing potential for future NPM headaches.

## How to Use

TODO lmao
