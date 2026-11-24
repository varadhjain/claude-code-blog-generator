#!/usr/bin/env node
import { compare, usage } from './compare';
import { learnings, learningsUsage, review, reviewUsage } from './review';

const args = process.argv.slice(2);
const hasCommand = Boolean(args[0] && !args[0].startsWith('-'));
const command = hasCommand ? args.shift() : 'review';
const action = command === 'compare' ? compare : command === 'review' ? review : command === 'learnings' ? learnings : undefined;
if (action && !args.includes('--help')) {
  action(args).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else {
  console.log('Bilan · personal coding-agent evals');
  console.log(reviewUsage);
  console.log(usage);
  console.log(learningsUsage);
  if (!action) process.exitCode = 1;
}
