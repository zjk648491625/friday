// Modified by Friday AI Team - Rebranded from Continue
import fs from "fs";
import { IDE } from "..";
import { getGlobalFridayIgnorePath } from "../util/paths";
import { gitIgArrayFromFile } from "./ignore";

export const getGlobalFridayIgArray = () => {
  const contents = fs.readFileSync(getGlobalFridayIgnorePath(), "utf8");
  return gitIgArrayFromFile(contents);
};

export const getWorkspaceFridayIgArray = async (ide: IDE) => {
  const dirs = await ide.getWorkspaceDirs();
  return await dirs.reduce(
    async (accPromise, dir) => {
      const acc = await accPromise;
      try {
        const contents = await ide.readFile(`${dir}/.fridayignore`);
        return [...acc, ...gitIgArrayFromFile(contents)];
      } catch (err) {
        console.error(err);
        return acc;
      }
    },
    Promise.resolve([] as string[]),
  );
};
