#!/usr/bin/env node
// Fires on SubagentStop — reads JSON input from stdin.

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  let agentType = 'unknown';
  let agentId = 'unknown';
  let lastMessage = '';

  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    agentType = input.agent_type ?? 'unknown';
    agentId = input.agent_id ?? 'unknown';
    const msg = input.last_assistant_message ?? '';
    lastMessage = msg.length > 120 ? msg.slice(0, 120) + '...' : msg;
  } catch (_) {}

  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  process.stdout.write(
    `[lambda-api-plugin] [${timestamp}] [SUBAGENT STOP] type=${agentType} id=${agentId}\n`
  );
  if (lastMessage) {
    process.stdout.write(`[lambda-api-plugin]   last_message: ${lastMessage}\n`);
  }
});
