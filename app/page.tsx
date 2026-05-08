import fs from 'fs';
import path from 'path';

export default async function Page() {
  const htmlPath = path.join(process.cwd(), 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
