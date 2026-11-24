#!/usr/bin/env node
import { compare, usage } from './compare';

const [, , command, ...args] = process.argv;
if (command === 'compare' && !args.includes('--help')) {
  compare(args).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else {
  console.log('Bilan · personal coding-agent evals');
  console.log(usage);
  if (command && command !== '--help' && command !== 'compare') process.exitCode = 1;
}
