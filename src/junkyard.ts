// i once read a twoot on social media that said "if you have a file called
// utils in your code, you might as well just call it junkyard"
//
// i choose to interpret that literally

import fs from "node:fs/promises";
import path from "node:path";

export async function* readdirR(inDir: string): AsyncIterableIterator<string> {
  if (!(await fileExists(inDir))) {
    return;
  }

  // um actually, this is technically a stack!!,
  const queue: string[] = await fs.readdir(inDir);
  while (queue.length) {
    const item = queue.pop()!;
    const itemAbs = path.join(inDir, item);

    if ((await fs.stat(itemAbs)).isDirectory()) {
      const dirListing = await fs.readdir(itemAbs);
      queue.push(...dirListing.map((filename) => path.join(item, filename)));
      continue;
    }

    yield item;
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path, fs.constants.F_OK);
    return true;
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
}
