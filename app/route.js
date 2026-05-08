export async function GET() {
  const fs = await import('fs/promises');
  const html = await fs.readFile(process.cwd() + '/public/index.html', 'utf-8');
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}
