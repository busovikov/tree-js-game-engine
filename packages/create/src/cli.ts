#!/usr/bin/env node
import { createHakuProject } from './index.js'

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const positional = args.filter((a) => !a.startsWith('--'))

const targetDir = positional[0] ?? '.'
let name = 'my-game'
const nameIdx = args.indexOf('--name')
if (nameIdx >= 0 && args[nameIdx + 1]) name = args[nameIdx + 1]

let engineVersion = 'latest'
const engineIdx = args.indexOf('--engine-version')
if (engineIdx >= 0 && args[engineIdx + 1]) engineVersion = args[engineIdx + 1]

createHakuProject({
  targetDir,
  name,
  engineVersion,
  git: !flags.has('--no-git'),
  install: !flags.has('--no-install'),
})
  .then((result) => {
    console.log(`Created haku project at ${result.projectDir}`)
  })
  .catch((err: Error) => {
    console.error(err.message)
    process.exit(1)
  })
