const ollama = require('ollama');
const fs = require('fs');
const path = require('path');

async function askAI(prompt) {
  const response = await ollama.chat({
    model: 'qwen2.5-coder:1.5b',
    messages: [{ role: 'user', content: prompt }],
  });
  return response.message.content;
}

// Example: Fix Resumora 404
askAI('Write a static Express server that serves index.html from /public, listening on port 8080. Output only the JavaScript code.').then(code => {
  fs.writeFileSync('server-fixed.js', code);
  console.log('✅ AI generated server-fixed.js');
});
