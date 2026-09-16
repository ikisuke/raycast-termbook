/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `ask-term` command */
  export type AskTerm = ExtensionPreferences & {}
  /** Preferences accessible in the `search` command */
  export type Search = ExtensionPreferences & {}
  /** Preferences accessible in the `add` command */
  export type Add = ExtensionPreferences & {}
  /** Preferences accessible in the `import-csv` command */
  export type ImportCsv = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `ask-term` command */
  export type AskTerm = {}
  /** Arguments passed to the `search` command */
  export type Search = {}
  /** Arguments passed to the `add` command */
  export type Add = {}
  /** Arguments passed to the `import-csv` command */
  export type ImportCsv = {}
}

