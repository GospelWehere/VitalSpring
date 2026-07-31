import { readFile, writeFile } from "node:fs/promises";

const files = ["part1.html", "part2.html", "part3.html", "part4.html", "part5.html"];
const parts = await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")));
await writeFile(new URL("Vital_Spring_System_Specification.html", import.meta.url), parts.join("\n"));
