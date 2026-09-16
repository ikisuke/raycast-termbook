import { environment } from "@raycast/api";
import { join } from "node:path";

export const dictionaryPath = join(environment.supportPath, "dictionary.json");
