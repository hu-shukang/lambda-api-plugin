#!/usr/bin/env node
// Fires on SubagentStart — reads JSON input from stdin.

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  let agentType = 'unknown';
  let agentId = 'unknown';

  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    agentType = input.agent_type ?? 'unknown';
    agentId = input.agent_id ?? 'unknown';
  } catch (_) {}

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  process.stdout.write(
    `[lambda-api-plugin] [${timestamp}] [SUBAGENT START] type=${agentType} id=${agentId}\n`
  );
});
